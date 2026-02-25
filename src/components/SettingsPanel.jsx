import React, { useState, useEffect } from 'react';
import { HiCog6Tooth, HiXMark, HiKey, HiSpeakerWave, HiChatBubbleLeftRight, HiMapPin, HiClock, HiLanguage, HiSignal } from 'react-icons/hi2';
import { getAudioInputDevicesWithLabels } from '../hooks/useAudioCapture';

const AI_MODELS = [
  { value: 'groq', label: 'Groq (free — Llama / Mixtral)', key: 'groqApiKey' },
  { value: 'claude', label: 'Claude Sonnet', key: 'anthropicApiKey' },
  { value: 'openai', label: 'GPT-4 / GPT-4o', key: 'openaiApiKey' },
];

const TRANSCRIPTION_PROVIDERS = [
  { value: 'groq', label: 'Groq Whisper (free)' },
  { value: 'openai', label: 'OpenAI Whisper (paid)' },
];

const OVERLAY_POSITIONS = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'center', label: 'Center' },
];

const DISMISS_OPTIONS = [
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
  { value: 0, label: 'Never' },
];

export default function SettingsPanel({ open, onClose, settings, onSave }) {
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [aiProvider, setAiProvider] = useState('claude');
  const [overlayPosition, setOverlayPosition] = useState('bottom-right');
  const [overlaySize, setOverlaySize] = useState('normal');
  const [dismissSeconds, setDismissSeconds] = useState(30);
  const [language, setLanguage] = useState('en');
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [groqKey, setGroqKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [transcriptionProvider, setTranscriptionProvider] = useState('groq');
  const [audioInputDeviceId, setAudioInputDeviceId] = useState('default');
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [controlPanelTransparent, setControlPanelTransparent] = useState(false);
  const [groqModel, setGroqModel] = useState('llama-3.1-70b-versatile');

  useEffect(() => {
    if (settings) {
      setOpenaiKey(settings.openaiApiKey || '');
      setAnthropicKey(settings.anthropicApiKey || '');
      setAiProvider(settings.aiProvider || 'claude');
      setOverlayPosition(settings.overlayPosition || 'bottom-right');
      setOverlaySize(settings.overlaySize || 'normal');
      setDismissSeconds(settings.overlayDismissSeconds ?? 30);
      setGroqKey(settings.groqApiKey || '');
      setTranscriptionProvider(settings.transcriptionProvider || 'groq');
      setLanguage(settings.transcriptionLanguage || 'en');
      setConfidenceThreshold(settings.confidenceThreshold ?? 0.7);
      const saved = settings.audioInputDeviceId;
      setAudioInputDeviceId(saved === undefined || saved === null || saved === '' ? 'default' : saved);
      setControlPanelTransparent(settings.controlPanelTransparent === true);
      setGroqModel(settings.groqModel || 'llama-3.1-70b-versatile');
    }
  }, [settings]);

  useEffect(() => {
    if (!open) return;
    getAudioInputDevicesWithLabels()
      .then((devices) => setAudioInputDevices(devices))
      .catch(() => setAudioInputDevices([]));
    if (settings) {
      const saved = settings.audioInputDeviceId;
      const resolved = saved === undefined || saved === null || saved === '' ? 'default' : saved;
      setAudioInputDeviceId(resolved);
    }
  }, [open, settings]);

  const handleSave = async () => {
    const payload = {
      openaiApiKey: openaiKey || undefined,
      anthropicApiKey: anthropicKey || undefined,
      groqApiKey: groqKey || undefined,
      transcriptionProvider,
      aiProvider,
      overlayPosition,
      overlaySize,
      overlayDismissSeconds: dismissSeconds,
      transcriptionLanguage: language || undefined,
      confidenceThreshold: confidenceThreshold,
      audioInputDeviceId: audioInputDeviceId === 'default' ? 'default' : audioInputDeviceId,
      controlPanelTransparent: controlPanelTransparent,
      groqModel: groqModel,
    };
    const result = onSave(payload);
    if (result && typeof result.then === 'function') await result;
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-800/95 rounded-2xl border border-gray-600 shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-600 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <HiCog6Tooth className="w-5 h-5 text-blue-400" />
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <HiXMark className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-900/50 border border-gray-700">
            <input
              type="checkbox"
              id="transparent"
              checked={controlPanelTransparent}
              onChange={(e) => setControlPanelTransparent(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            <label htmlFor="transparent" className="text-sm text-gray-300 cursor-pointer">
              Transparent control panel (restart app to apply)
            </label>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiKey className="w-4 h-4" /> OpenAI API key (Whisper + optional GPT)
            </label>
            <div className="flex gap-2">
              <input
                type={showOpenaiKey ? 'text' : 'password'}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey((s) => !s)}
                className="text-sm text-gray-400 hover:text-white"
              >
                {showOpenaiKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiKey className="w-4 h-4" /> Anthropic API key (Claude)
            </label>
            <div className="flex gap-2">
              <input
                type={showAnthropicKey ? 'text' : 'password'}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                placeholder="sk-ant-..."
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey((s) => !s)}
                className="text-sm text-gray-400 hover:text-white"
              >
                {showAnthropicKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiKey className="w-4 h-4" /> Groq API key (free — transcription & answers)
            </label>
            <div className="flex gap-2">
              <input
                type={showGroqKey ? 'text' : 'password'}
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                placeholder="gsk_..."
              />
              <button
                type="button"
                onClick={() => setShowGroqKey((s) => !s)}
                className="text-sm text-gray-400 hover:text-white"
              >
                {showGroqKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Free key from{' '}
              <span className="text-blue-400">console.groq.com</span>
            </p>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiSpeakerWave className="w-4 h-4" /> Transcription provider
            </label>
            <select
              value={transcriptionProvider}
              onChange={(e) => setTranscriptionProvider(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              {TRANSCRIPTION_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiChatBubbleLeftRight className="w-4 h-4" /> AI model for answers
            </label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            >
              {AI_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {aiProvider === 'groq' && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Groq model</label>
                <select
                  value={groqModel}
                  onChange={(e) => setGroqModel(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="llama-3.1-70b-versatile">Llama 3.1 70B Versatile</option>
                  <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                  <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiMapPin className="w-4 h-4" /> Overlay position
            </label>
            <select
              value={overlayPosition}
              onChange={(e) => setOverlayPosition(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              {OVERLAY_POSITIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Overlay size</label>
            <select
              value={overlaySize}
              onChange={(e) => setOverlaySize(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiClock className="w-4 h-4" /> Auto-dismiss timer
            </label>
            <select
              value={dismissSeconds}
              onChange={(e) => setDismissSeconds(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              {DISMISS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiSignal className="w-4 h-4" /> System audio device (mixed with microphone)
            </label>
            <select
              value={audioInputDeviceId}
              onChange={(e) => setAudioInputDeviceId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value="default">Default</option>
              {audioInputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select &quot;CABLE Output&quot; for system audio. Your microphone is always captured and mixed in automatically.
            </p>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
              <HiLanguage className="w-4 h-4" /> Transcription language
            </label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              placeholder="en"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Confidence threshold (0–1)</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
          <p className="text-xs text-gray-500">
            Hotkeys: Ctrl+Shift+M (toggle overlay), Ctrl+Shift+L (start/stop), Esc (dismiss), Ctrl+Shift+C (copy)
          </p>
        </div>
        <div className="p-4 border-t border-gray-600 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-900/30"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
