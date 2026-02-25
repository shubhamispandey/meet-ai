const { app, BrowserWindow, ipcMain, globalShortcut, Tray, nativeImage, systemPreferences, net } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { machineIdSync } = require('node-machine-id');
const OpenAI = require('openai').default;
const Anthropic = require('@anthropic-ai/sdk').default;

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

let controlPanelWindow = null;
let overlayWindow = null;
let tray = null;
let overlayVisible = true;
let isListening = false;
let currentStatus = 'paused';

const encryptionKey = machineIdSync({ original: true });
const store = new Store({
  encryptionKey,
  name: 'meetingmind-config',
});

function getWindowUrl(page) {
  if (isDev) {
    return page === 'overlay' ? `${VITE_DEV_SERVER_URL}/overlay.html` : VITE_DEV_SERVER_URL;
  }
  return `file://${path.join(__dirname, '..', 'dist', page === 'overlay' ? 'overlay.html' : 'index.html')}`;
}

const TRANSCRIPTION_PROVIDERS = {
  openai: { hostname: 'api.openai.com', path: '/v1/audio/transcriptions', model: 'whisper-1' },
  groq:   { hostname: 'api.groq.com',   path: '/openai/v1/audio/transcriptions', model: 'whisper-large-v3' },
};

function whisperTranscribeRaw(apiKey, wavBuffer, language, provider = 'openai') {
  const https = require('https');
  const cfg = TRANSCRIPTION_PROVIDERS[provider] || TRANSCRIPTION_PROVIDERS.openai;
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const parts = [];
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`
    ));
    parts.push(wavBuffer);
    parts.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${cfg.model}`
    ));
    if (language) {
      parts.push(Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}`
      ));
    }
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const req = https.request({
      hostname: cfg.hostname,
      path: cfg.path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Whisper API ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          resolve(json.text || '');
        } catch (e) {
          reject(new Error(`Invalid JSON from Whisper: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (e) => reject(new Error(`HTTPS error: ${e.message}`)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Whisper API timeout (30s)')); });
    req.write(body);
    req.end();
  });
}

async function withRetry(fn, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

function createControlPanelWindow() {
  const transparent = store.get('controlPanelTransparent') === true;
  controlPanelWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    transparent,
    backgroundColor: transparent ? '#00000000' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    title: 'MeetingMind AI — Control Panel',
  });

  controlPanelWindow.loadURL(getWindowUrl('main'));
  controlPanelWindow.once('ready-to-show', () => controlPanelWindow.show());
  controlPanelWindow.on('closed', () => {
    controlPanelWindow = null;
  });
}

function createOverlayWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const overlayWidth = 420;
  const overlayHeight = 500;
  const x = width - overlayWidth - 24;
  const y = height - overlayHeight - 24;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  overlayWindow.setContentProtection(true);
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadURL(getWindowUrl('overlay'));
  overlayWindow.once('ready-to-show', () => overlayWindow.show());
  overlayWindow.webContents.once('did-finish-load', () => {
    overlayWindow.webContents.send('listening-state', isListening);
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function updateTrayStatus(status) {
  currentStatus = status;
  if (!tray) return;
  const size = 16;
  const dot = (color) => {
    const canvas = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const idx = i * 4;
      const x = i % size;
      const y = Math.floor(i / size);
      const cx = size / 2;
      const cy = size / 2;
      const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const inCircle = r <= 6;
      canvas[idx] = color[0];
      canvas[idx + 1] = color[1];
      canvas[idx + 2] = color[2];
      canvas[idx + 3] = inCircle ? 255 : 0;
    }
    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
  };
  const colors = {
    listening: [34, 197, 94],
    processing: [234, 179, 8],
    paused: [156, 163, 175],
  };
  const c = colors[status] || colors.paused;
  tray.setImage(dot(c));
}

function setupTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'tray-icon.png');
  let icon = nativeImage.createEmpty();
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch (_) {}
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2NkYGD4z0ABYBw1gGE0DBgZGBj+UxIGowYwMgAAGvECAR0Qb0AAAAAASUVORK5CYII='
    );
  }
  tray = new Tray(icon);
  updateTrayStatus('paused');
  tray.setToolTip('MeetingMind AI');
  tray.on('click', () => {
    if (controlPanelWindow) {
      controlPanelWindow.show();
      controlPanelWindow.focus();
    }
  });
  const { Menu } = require('electron');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Start Listening', click: () => controlPanelWindow?.webContents?.send('start-listening') },
      { label: 'Stop Listening', click: () => controlPanelWindow?.webContents?.send('stop-listening') },
      { type: 'separator' },
      { label: 'Show Window', click: () => controlPanelWindow?.show() },
      { label: 'Settings', click: () => controlPanelWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    overlayVisible = !overlayVisible;
    if (overlayWindow) overlayWindow[overlayVisible ? 'show' : 'hide']();
  });
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    isListening = !isListening;
    if (controlPanelWindow) controlPanelWindow.webContents.send(isListening ? 'start-listening' : 'stop-listening');
  });
  globalShortcut.register('Escape', () => {
    if (overlayWindow) overlayWindow.webContents.send('dismiss-answer');
  });
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (overlayWindow) overlayWindow.webContents.send('copy-answer');
  });
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

ipcMain.handle('get-settings', async () => {
  try {
    return { success: true, data: store.store };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-settings', async (_, settings) => {
  try {
    if (typeof settings === 'object') {
      for (const [k, v] of Object.entries(settings)) {
        if (v === undefined || v === null) {
          store.delete(k);
        } else {
          store.set(k, v);
        }
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let _transcribeInFlight = false;

ipcMain.handle('transcribe-audio', async (_, base64Audio) => {
  if (_transcribeInFlight) {
    return { success: false, error: 'Transcription already in progress' };
  }
  _transcribeInFlight = true;
  try {
    const transcriptionProvider = store.get('transcriptionProvider') || 'groq';
    let apiKey;
    if (transcriptionProvider === 'groq') {
      apiKey = store.get('groqApiKey');
      if (!apiKey) return { success: false, error: 'Groq API key not set. Get a free key at console.groq.com' };
    } else {
      apiKey = store.get('openaiApiKey');
      if (!apiKey) return { success: false, error: 'OpenAI API key not set' };
    }
    const wavBuffer = Buffer.from(base64Audio, 'base64');
    const language = store.get('transcriptionLanguage') || undefined;
    const result = await withRetry(() => whisperTranscribeRaw(apiKey, wavBuffer, language, transcriptionProvider), 3);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    _transcribeInFlight = false;
  }
});

const INTERVIEW_SYSTEM_PROMPT = `You are an expert interview assistant helping a candidate during a live technical/behavioral interview. Provide clear, well-structured answers the candidate can quickly scan and mentally map.

CRITICAL RULES:
1. Respond with ONLY one valid JSON object — no text outside the JSON.
2. The "answer" field MUST be a single flat STRING (not an object, not an array). Put ALL formatting inside that one string using newlines.
3. The "codeSnippet" field must be a single flat STRING of code, or null.

ANSWER FORMATTING (inside the answer string):
- Start with a 1-line definition
- Use bullet points (• ) for key concepts, each on a new line
- Use numbered lists (1. 2. 3.) for processes/steps
- Use CAPS or brackets for section headers like [DEFINITION], [KEY POINTS], [EXAMPLE], [FOLLOW-UP]
- For comparisons, use simple text tables with | separators
- Keep it 150-400 words, structured for instant scanning under interview pressure
- For coding questions, put the code in codeSnippet and explain the approach in answer
- For behavioral questions, use STAR format (Situation, Task, Action, Result)

QUALITY: Give interview-perfect answers covering definition, key points, example, and common follow-ups.

EXACT JSON shape (all values are strings or null):
{"hasQuestion": true, "question": "the question", "answer": "your full answer as a single string with newlines", "codeSnippet": null, "language": null}`;

function buildAIMessages(systemPrompt, utterance, fullContext) {
  const userContent = `Transcript:\n${fullContext || utterance}\n\nLast utterance: ${utterance}`;
  return { systemPrompt, userContent };
}

function flattenToString(val) {
  if (typeof val === 'string') return val;
  if (val == null) return '';
  if (Array.isArray(val)) return val.map(flattenToString).join('\n');
  if (typeof val === 'object') {
    return Object.entries(val).map(([k, v]) => `${k}\n${flattenToString(v)}`).join('\n\n');
  }
  return String(val);
}

function parseAIResponse(text, utterance) {
  let parsed = { hasQuestion: false, question: '', answer: '', codeSnippet: null, language: null };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}
  if (parsed.answer && typeof parsed.answer !== 'string') {
    parsed.answer = flattenToString(parsed.answer);
  }
  if (parsed.codeSnippet && typeof parsed.codeSnippet !== 'string') {
    parsed.codeSnippet = flattenToString(parsed.codeSnippet);
  }
  if (!parsed.hasQuestion && typeof utterance === 'string' && (utterance.includes('?') || /^(what|how|why|when|where|explain|define|tell me|describe|compare|difference|implement)/i.test(utterance.trim()))) {
    parsed.hasQuestion = true;
    parsed.question = parsed.question || utterance.trim().slice(0, 200);
    parsed.answer = parsed.answer || text.replace(/^[\s\S]*?\{[\s\S]*\}/, '').trim().slice(0, 4000) || text.slice(0, 4000);
  }
  return parsed;
}

function broadcastAnswer(parsed) {
  if (!parsed.hasQuestion) return;
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('new-answer', parsed);
  if (controlPanelWindow && !controlPanelWindow.isDestroyed()) controlPanelWindow.webContents.send('new-answer', parsed);
}

ipcMain.handle('get-ai-answer', async (_, { utterance, fullContext }) => {
  try {
    const provider = store.get('aiProvider') || 'groq';
    const { systemPrompt, userContent } = buildAIMessages(INTERVIEW_SYSTEM_PROMPT, utterance, fullContext);

    if (provider === 'groq') {
      const apiKey = store.get('groqApiKey');
      if (!apiKey) return { success: false, error: 'Groq API key not set. Get a free key at console.groq.com' };
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('question-processing');
      const openai = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
      const model = store.get('groqModel') || 'llama-3.1-70b-versatile';
      const response = await withRetry(
        () => openai.chat.completions.create({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
          max_tokens: 2048,
          temperature: 0.3,
        }),
        3
      );
      const text = response.choices?.[0]?.message?.content || '';
      const parsed = parseAIResponse(text, utterance);
      broadcastAnswer(parsed);
      return { success: true, data: parsed };
    }

    if (provider === 'claude') {
      const apiKey = store.get('anthropicApiKey');
      if (!apiKey) return { success: false, error: 'Anthropic API key not set' };
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('question-processing');
      const anthropic = new Anthropic({ apiKey });
      const response = await withRetry(
        () => anthropic.messages.create({
          model: store.get('claudeModel') || 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        }),
        3
      );
      const text = response.content?.[0]?.text || '';
      const parsed = parseAIResponse(text, utterance);
      broadcastAnswer(parsed);
      return { success: true, data: parsed };
    }

    const apiKey = store.get('openaiApiKey');
    if (!apiKey) return { success: false, error: 'OpenAI API key not set' };
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('question-processing');
    const openai = new OpenAI({ apiKey });
    const model = store.get('openaiModel') || 'gpt-4o';
    const response = await withRetry(
      () => openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        max_tokens: 2048,
        temperature: 0.3,
      }),
      3
    );
    const text = response.choices?.[0]?.message?.content || '';
    const parsed = parseAIResponse(text, utterance);
    broadcastAnswer(parsed);
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('set-ignore-mouse', (_, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('status-change', (_, status) => {
  isListening = status === 'listening';
  updateTrayStatus(status);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('listening-state', status === 'listening');
  }
});

ipcMain.on('emit-system-audio-warning', () => {
  if (controlPanelWindow && !controlPanelWindow.isDestroyed()) {
    controlPanelWindow.webContents.send('system-audio-warning');
  }
});

ipcMain.handle('copy-to-clipboard', async (_, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text || '');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
      await systemPreferences.askForMediaAccess('screen');
    } catch (_) {}
  }

  createControlPanelWindow();
  createOverlayWindow();
  setupTray();
  registerShortcuts();
});

app.on('window-all-closed', () => {
  unregisterShortcuts();
  if (tray) tray.destroy();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createControlPanelWindow();
    createOverlayWindow();
    setupTray();
    registerShortcuts();
  }
});

app.on('before-quit', () => unregisterShortcuts());
