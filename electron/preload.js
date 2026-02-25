const { contextBridge, ipcRenderer } = require('electron');

function onChannel(channel, handler) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  transcribeAudio: (base64Audio) => ipcRenderer.invoke('transcribe-audio', base64Audio),
  getAIAnswer: (payload) => ipcRenderer.invoke('get-ai-answer', payload),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  emitSystemAudioWarning: () => ipcRenderer.send('emit-system-audio-warning'),
  sendStatusChange: (status) => ipcRenderer.send('status-change', status),

  onTranscription: (callback) => {
    onChannel('transcription-result', (_, data) => callback(data));
  },
  onAnswer: (callback) => {
    onChannel('new-answer', (_, data) => callback(data));
  },
  onQuestionProcessing: (callback) => {
    onChannel('question-processing', () => callback());
  },
  onSystemAudioWarning: (callback) => {
    onChannel('system-audio-warning', () => callback());
  },
  onStartListeningRequest: (callback) => {
    onChannel('start-listening', () => callback());
  },
  onStopListeningRequest: (callback) => {
    onChannel('stop-listening', () => callback());
  },
  onDismissAnswer: (callback) => {
    onChannel('dismiss-answer', () => callback());
  },
  onCopyAnswer: (callback) => {
    onChannel('copy-answer', () => callback());
  },
  onListeningState: (callback) => {
    onChannel('listening-state', (_, isListening) => callback(isListening));
  },

  dismissAnswer: () => ipcRenderer.send('dismiss-answer'),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
});
