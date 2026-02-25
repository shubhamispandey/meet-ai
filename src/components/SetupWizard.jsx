import React, { useState, useEffect } from 'react';

const STEPS = [
  { id: 1, title: 'OpenAI API key' },
  { id: 2, title: 'AI model (Claude or GPT-4)' },
  { id: 3, title: 'Audio setup' },
  { id: 4, title: 'Test' },
];

const BLACKHOLE_URL = 'https://existential.audio/blackhole/';
const VB_CABLE_URL = 'https://vb-audio.com/Cable/';

export default function SetupWizard({ onComplete, getSettings, saveSettings }) {
  const [step, setStep] = useState(1);
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [useOpenAIForAnswers, setUseOpenAIForAnswers] = useState(false);
  const [testResult, setTestResult] = useState({ status: 'idle', text: '', error: '' });
  const [testRecording, setTestRecording] = useState(false);
  const [platform, setPlatform] = useState('other');

  useEffect(() => {
    getSettings?.().then((res) => {
      if (res?.success && res.data) {
        setOpenaiKey(res.data.openaiApiKey || '');
        setAnthropicKey(res.data.anthropicApiKey || '');
        setUseOpenAIForAnswers(res.data.aiProvider === 'openai');
      }
    });
    setPlatform(navigator.platform?.toLowerCase().includes('win') ? 'windows' : 'mac');
  }, [getSettings]);

  const handleNext = async () => {
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    await saveSettings?.({
      openaiApiKey: openaiKey || undefined,
      anthropicApiKey: anthropicKey || undefined,
      aiProvider: useOpenAIForAnswers ? 'openai' : 'claude',
    });
    onComplete?.();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const runTest = async () => {
    setTestResult({ status: 'running', text: '', error: '' });
    setTestRecording(true);
    if (typeof window.onSetupTestRecord === 'function') {
      try {
        const base64 = await new Promise((resolve, reject) => {
          window.onSetupTestRecord(5000, resolve, reject);
        });
        setTestRecording(false);
        const api = window.electronAPI;
        if (!api) {
          setTestResult({ status: 'error', text: '', error: 'Electron API not available' });
          return;
        }
        const res = await api.transcribeAudio(base64);
        if (res?.success) {
          setTestResult({ status: 'success', text: res.data || '', error: '' });
        } else {
          setTestResult({ status: 'error', text: '', error: res?.error || 'Transcription failed' });
        }
      } catch (err) {
        setTestRecording(false);
        setTestResult({ status: 'error', text: '', error: err?.message || 'Test failed' });
      }
    } else {
      setTestRecording(false);
      setTestResult({ status: 'error', text: '', error: 'Test recorder not connected. Start the app and try again.' });
    }
  };

  const canProceed = () => {
    if (step === 1) return openaiKey.trim().length > 0;
    if (step === 2) return useOpenAIForAnswers || anthropicKey.trim().length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-semibold mb-2">MeetingMind AI</h1>
      <p className="text-gray-400 text-sm mb-8">Setup</p>

      <div className="flex gap-2 mb-8">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
            }`}
          >
            {s.id}
          </div>
        ))}
      </div>

      <div className="w-full max-w-md space-y-6">
        {step === 1 && (
          <>
            <p className="text-gray-400 text-sm">Used for speech-to-text (Whisper). Get a key at platform.openai.com</p>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white"
            />
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-gray-400 text-sm">Choose which AI answers meeting questions.</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useOpenAIForAnswers}
                onChange={(e) => setUseOpenAIForAnswers(e.target.checked)}
              />
              <span>Use OpenAI GPT-4 for answers (uses OpenAI key)</span>
            </label>
            {!useOpenAIForAnswers && (
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="Anthropic API key (sk-ant-...)"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white"
              />
            )}
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-gray-400 text-sm">
              To capture meeting audio (what others say), you need a virtual audio device. Without it, only your
              microphone will be captured.
            </p>
            {platform === 'mac' && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <p className="text-sm font-medium mb-2">Mac: BlackHole</p>
                <p className="text-xs text-gray-400 mb-2">
                  Install BlackHole 2ch, then in Audio MIDI Setup create a Multi-Output Device (System + BlackHole).
                  When you start listening, choose “Share system audio” when prompted.
                </p>
                <a
                  href={BLACKHOLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-sm"
                >
                  Download BlackHole
                </a>
              </div>
            )}
            {platform === 'windows' && (
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <p className="text-sm font-medium mb-2">Windows: VB-Cable</p>
                <p className="text-xs text-gray-400 mb-2">
                  Install VB-Cable. When you start listening, choose to share your screen/window with system audio so
                  meeting audio is captured.
                </p>
                <a
                  href={VB_CABLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-sm"
                >
                  Download VB-Cable
                </a>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-gray-400 text-sm">Record 5 seconds and transcribe to confirm everything works.</p>
            <button
              type="button"
              onClick={runTest}
              disabled={testRecording}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium"
            >
              {testRecording ? 'Recording...' : 'Record 5 seconds & transcribe'}
            </button>
            {testResult.status === 'success' && (
              <div className="bg-gray-800 rounded-lg p-4 border border-green-700">
                <p className="text-green-400 text-sm font-medium">Transcription:</p>
                <p className="text-sm text-gray-300 mt-1">{testResult.text || '(empty)'}</p>
              </div>
            )}
            {testResult.status === 'error' && (
              <div className="bg-gray-800 rounded-lg p-4 border border-red-700">
                <p className="text-red-400 text-sm">{testResult.error}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-4 mt-8">
        {step > 1 && (
          <button
            type="button"
            onClick={handleBack}
            className="px-6 py-2 text-gray-400 hover:text-white"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed()}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
        >
          {step === 4 ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  );
}
