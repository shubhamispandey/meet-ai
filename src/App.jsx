import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HiMicrophone, HiStop, HiCog6Tooth, HiDocumentText, HiChatBubbleBottomCenterText, HiClipboardDocument } from 'react-icons/hi2';
import { HiOutlineArrowPath } from 'react-icons/hi2';
import SetupWizard from './components/SetupWizard';
import StatusBar from './components/StatusBar';
import SettingsPanel from './components/SettingsPanel';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useTranscription } from './hooks/useTranscription';
import { useAIAnswer } from './hooks/useAIAnswer';

const HAS_SETUP_KEY = 'hasCompletedSetup';

function FormattedAnswer({ text, isTransparent }) {
  if (!text) return <span className="text-gray-500">—</span>;
  const safeText = typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text);
  const lines = safeText.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        if (/^\[.+\]$/.test(trimmed) || /^\*\*.+\*\*:?$/.test(trimmed)) {
          const label = trimmed.replace(/^\[|\]$|\*\*/g, '').replace(/:$/, '');
          return <div key={i} className="font-semibold text-blue-400 mt-2 mb-0.5 text-xs uppercase tracking-wide">{label}</div>;
        }
        if (/^[•\-\*]\s/.test(trimmed)) {
          const content = trimmed.replace(/^[•\-\*]\s+/, '');
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-blue-400 flex-shrink-0">•</span>
              <span>{content}</span>
            </div>
          );
        }
        if (/^\d+[\.\)]\s/.test(trimmed)) {
          const num = trimmed.match(/^(\d+)[\.\)]\s/)[1];
          const content = trimmed.replace(/^\d+[\.\)]\s+/, '');
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-emerald-400 font-semibold flex-shrink-0 w-5 text-right">{num}.</span>
              <span>{content}</span>
            </div>
          );
        }
        if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
          const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
          return (
            <div key={i} className="flex gap-0 font-mono text-xs">
              {cells.map((cell, ci) => (
                <div key={ci} className={`px-2 py-1 border ${isTransparent ? 'border-gray-600' : 'border-gray-700'} flex-1`}>{cell}</div>
              ))}
            </div>
          );
        }
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('setup');
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answerHistory, setAnswerHistory] = useState([]);
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState(null);
  const answersEndRef = useRef(null);

  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const isTransparent = settings?.controlPanelTransparent === true;

  const addAnswerToHistory = useCallback((data) => {
    setAnswerHistory((prev) => [
      { id: Date.now().toString(), timestamp: new Date(), ...data },
      ...prev,
    ]);
    setAnswerError(null);
    setIsAnswerLoading(false);
  }, []);

  const { requestAnswer } = useAIAnswer();
  const { transcript, liveText, isTranscribing, wordCount, handleChunk } = useTranscription();

  const transcriptRef = useRef('');
  const liveTextRef = useRef('');
  transcriptRef.current = transcript;
  liveTextRef.current = liveText;

  const onSilence = useCallback(async () => {
    const utterance = liveTextRef.current?.trim() || '';
    const context = transcriptRef.current?.trim() || '';
    if (!utterance && !context) return;
    setAnswerError(null);
    setIsAnswerLoading(true);
    try {
      await requestAnswer(utterance, context);
    } catch (err) {
      setAnswerError(err?.message || 'Failed to get answer');
      setIsAnswerLoading(false);
    }
  }, [requestAnswer]);

  const { isListening, start, stop, systemAudioWarning } = useAudioCapture({
    onChunk: handleChunk,
    onSilence,
  });

  useEffect(() => {
    if (!api) return;
    api.getSettings().then((res) => {
      if (res?.success && res.data) {
        setSettings(res.data);
        const d = res.data;
        const hasAnyKey = !!(d.openaiApiKey || d.groqApiKey || d.anthropicApiKey);
        if (d[HAS_SETUP_KEY] || hasAnyKey) {
          setView('main');
        }
      }
    });
  }, [api]);

  useEffect(() => {
    if (!api) return;
    api.onStartListeningRequest(() => start());
    api.onStopListeningRequest(() => stop());
    api.onAnswer((data) => {
      addAnswerToHistory(data);
    });
  }, [api, start, stop, addAnswerToHistory]);

  const handleSetupComplete = useCallback(async () => {
    if (api) await api.saveSettings({ [HAS_SETUP_KEY]: true });
    setView('main');
    api?.getSettings().then((res) => res?.success && setSettings(res.data));
  }, [api]);

  const handleSaveSettings = useCallback(
    async (next) => {
      if (api) await api.saveSettings(next);
      const res = api ? await api.getSettings() : null;
      if (res?.success && res.data) setSettings(res.data);
    },
    [api]
  );

  const copyAnswer = useCallback((entry) => {
    const text = `Q: ${entry.question}\n\nA: ${entry.answer}${entry.codeSnippet ? '\n\nCode:\n' + entry.codeSnippet : ''}`;
    api?.copyToClipboard?.(text);
  }, [api]);

  const status = isListening ? (isTranscribing ? 'processing' : 'listening') : 'paused';

  useEffect(() => {
    if (!api) return;
    api.sendStatusChange?.(status);
  }, [api, status]);

  if (view === 'setup') {
    return (
      <SetupWizard
        onComplete={handleSetupComplete}
        getSettings={api?.getSettings}
        saveSettings={api?.saveSettings}
      />
    );
  }

  const panelClass = isTransparent
    ? 'bg-gray-900/85 backdrop-blur-xl border-gray-600'
    : 'bg-gray-800/95 border-gray-700';
  const textPrimary = isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]' : 'text-gray-100';
  const textSecondary = isTransparent ? 'text-gray-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-gray-400';
  const textMuted = isTransparent ? 'text-gray-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-gray-500';

  return (
    <div className={`min-h-screen flex flex-col ${isTransparent ? 'bg-transparent' : 'bg-gray-900'} text-gray-100`}>
      <header className={`border-b px-5 py-3 flex items-center justify-between ${isTransparent ? 'bg-gray-900/80 backdrop-blur-xl border-gray-600' : 'border-gray-800 bg-gray-900/95'}`}>
        <h1 className={`text-lg font-bold flex items-center gap-2 ${textPrimary}`}>
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <HiChatBubbleBottomCenterText className="w-3.5 h-3.5 text-white" />
          </span>
          InterviewSpy
        </h1>
        <div className="flex items-center gap-3">
          <StatusBar status={status} lastQuestion={liveText?.slice(0, 50)} wordCount={wordCount} />
          <button
            type="button"
            onClick={isListening ? stop : start}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all shadow-lg ${isListening ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-900/30' : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-900/30'}`}
          >
            {isListening ? <HiStop className="w-4 h-4" /> : <HiMicrophone className="w-4 h-4" />}
            {isListening ? 'Stop' : 'Start'}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`p-2 rounded-xl transition-colors ${textSecondary} hover:bg-gray-700/50 hover:text-white`}
            title="Settings"
          >
            <HiCog6Tooth className="w-5 h-5" />
          </button>
        </div>
      </header>

      {systemAudioWarning && (
        <div className="bg-amber-500/20 border-b border-amber-600/50 px-4 py-2 text-sm text-amber-200 flex items-center gap-2">
          <HiMicrophone className="w-4 h-4 flex-shrink-0" />
          System audio unavailable — capturing microphone only.
        </div>
      )}

      {/* Transcript strip */}
      <div className={`border-b px-5 py-2.5 ${isTransparent ? 'bg-gray-900/60 backdrop-blur border-gray-600' : 'bg-gray-800/60 border-gray-800'}`}>
        <div className="flex items-center gap-2 mb-1">
          <HiDocumentText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className={`text-xs font-semibold uppercase tracking-wide ${textSecondary}`}>Live Transcript</span>
        </div>
        <div className={`text-sm max-h-16 overflow-y-auto ${textPrimary} leading-relaxed`}>
          {transcript || <span className={textMuted}>Waiting for speech...</span>}
          {liveText && <span className={textMuted + ' italic'}> {liveText}</span>}
        </div>
      </div>

      {/* Answers - full length */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {isAnswerLoading && (
          <div className={`rounded-xl border p-4 ${isTransparent ? 'bg-black/40 border-gray-600' : 'bg-gray-800/50 border-gray-700'}`}>
            <div className="flex items-center gap-3">
              <HiOutlineArrowPath className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
              <div>
                <p className={`font-medium ${textPrimary}`}>Thinking...</p>
                <p className={`text-xs mt-0.5 ${textMuted}`}>Analyzing the question and generating a detailed answer.</p>
              </div>
            </div>
          </div>
        )}

        {answerError && (
          <div className="rounded-xl border border-amber-600/50 bg-amber-500/10 p-4">
            <p className="text-amber-300 font-medium text-sm">Could not get answer</p>
            <p className="text-amber-200/90 text-xs mt-1">{answerError}</p>
          </div>
        )}

        {!isAnswerLoading && answerHistory.length === 0 && !answerError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HiChatBubbleBottomCenterText className={`w-12 h-12 mb-4 ${textMuted}`} />
            <p className={`text-sm ${textMuted}`}>
              Ask a question while listening — answers will appear here instantly.
            </p>
          </div>
        )}

        {answerHistory.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-xl border ${isTransparent ? 'bg-black/40 border-gray-600' : 'bg-gray-800/50 border-gray-700'}`}
          >
            {/* Question header */}
            <div className={`px-4 py-3 border-b flex items-start justify-between gap-3 ${isTransparent ? 'border-gray-600' : 'border-gray-700'}`}>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${textPrimary}`}>
                  {entry.question || '—'}
                </p>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  {entry.timestamp instanceof Date ? entry.timestamp.toLocaleTimeString() : new Date(entry.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyAnswer(entry)}
                className={`p-1.5 rounded-lg transition-colors ${textMuted} hover:bg-gray-700/50 hover:text-white flex-shrink-0`}
                title="Copy answer"
              >
                <HiClipboardDocument className="w-4 h-4" />
              </button>
            </div>

            {/* Full answer body */}
            <div className={`px-4 py-3 text-sm leading-relaxed ${isTransparent ? textPrimary : 'text-gray-300'}`}>
              <FormattedAnswer text={entry.answer} isTransparent={isTransparent} />
            </div>

            {/* Code snippet */}
            {entry.codeSnippet && (
              <div className={`px-4 pb-3`}>
                <div className={`text-xs font-mono px-1 py-0.5 mb-1 inline-block rounded ${textMuted}`}>
                  {entry.language || 'code'}
                </div>
                <pre className={`p-3 rounded-lg text-xs overflow-x-auto border ${isTransparent ? 'bg-black/50 border-gray-600 text-green-300' : 'bg-gray-900 border-gray-700 text-green-400'}`}>
                  {entry.codeSnippet}
                </pre>
              </div>
            )}
          </div>
        ))}
        <div ref={answersEndRef} />
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
