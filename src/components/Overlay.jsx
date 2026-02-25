import React, { useState, useEffect, useCallback, useRef } from 'react';
import AnswerCard, { SkeletonCard } from './AnswerCard';

const DEFAULT_DISMISS_MS = 30000;

export default function Overlay() {
  const [overlayState, setOverlayState] = useState('idle');
  const [answer, setAnswer] = useState(null);
  const [isListening, setListening] = useState(false);
  const [isCollapsed, setCollapsed] = useState(false);
  const [dismissMs, setDismissMs] = useState(DEFAULT_DISMISS_MS);
  const dismissTimerRef = useRef(null);
  const answerRef = useRef(null);
  answerRef.current = answer;

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startDismissTimer = useCallback(() => {
    clearDismissTimer();
    if (dismissMs > 0 && overlayState === 'answer') {
      dismissTimerRef.current = setTimeout(() => {
        setOverlayState('idle');
        setAnswer(null);
        dismissTimerRef.current = null;
      }, dismissMs);
    }
  }, [dismissMs, overlayState, clearDismissTimer]);

  useEffect(() => {
    if (overlayState === 'answer') startDismissTimer();
    return clearDismissTimer;
  }, [overlayState, startDismissTimer, clearDismissTimer]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.getSettings().then((res) => {
      if (res?.success && res.data?.overlayDismissSeconds != null) {
        const sec = Number(res.data.overlayDismissSeconds);
        setDismissMs(sec <= 0 ? 0 : sec * 1000);
      }
    });
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onQuestionProcessing(() => {
      setOverlayState('loading');
      setAnswer(null);
    });

    api.onAnswer((data) => {
      setAnswer(data);
      setOverlayState('answer');
    });

    api.onDismissAnswer(() => {
      setOverlayState('idle');
      setAnswer(null);
    });

    api.onCopyAnswer(() => {
      const current = answerRef.current;
      if (current && (current.answer || current.question)) {
        const text = [current.question, current.answer, current.codeSnippet].filter(Boolean).join('\n\n');
        api.copyToClipboard(text);
      }
    });

    api.onListeningState((listening) => {
      setListening(listening);
    });

    return () => {
      clearDismissTimer();
    };
  }, [clearDismissTimer]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        window.electronAPI?.dismissAnswer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleClose = () => {
    window.electronAPI?.dismissAnswer();
  };

  const handleCopy = (text) => {
    window.electronAPI?.copyToClipboard(text);
  };

  const handleMouseEnter = () => {
    window.electronAPI?.setIgnoreMouse?.(false);
  };

  const handleMouseLeave = () => {
    window.electronAPI?.setIgnoreMouse?.(true);
  };

  const showCard = overlayState === 'loading' || overlayState === 'answer';
  const showContent = showCard && !isCollapsed;

  return (
    <div
      className="h-full flex flex-col items-end justify-end p-4 gap-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isListening && (
        <div
          className="w-3 h-3 rounded-full bg-green-500 animate-pulse flex-shrink-0"
          title="Listening"
        />
      )}
      {showContent && (
        <div className="w-full max-w-md">
          {overlayState === 'loading' && <SkeletonCard />}
          {overlayState === 'answer' && answer && (
            <AnswerCard
              question={answer.question}
              answer={answer.answer}
              codeSnippet={answer.codeSnippet}
              language={answer.language || 'text'}
              onClose={handleClose}
              onCopy={handleCopy}
              copyText={[answer.question, answer.answer, answer.codeSnippet].filter(Boolean).join('\n\n')}
            />
          )}
        </div>
      )}
      {showCard && (
        <button
          type="button"
          onClick={() => setCollapsed(!isCollapsed)}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
        >
          {isCollapsed ? 'Expand' : 'Minimize'}
        </button>
      )}
    </div>
  );
}
