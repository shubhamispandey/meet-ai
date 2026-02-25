import { useState, useRef, useCallback } from 'react';

const SILENCE_DELAY_MS = 2000;
const ROLLING_WINDOW_MS = 60000;

export function useSpeechRecognition({ onSilence }) {
  const [transcript, setTranscript] = useState('');
  const [liveText, setLiveText] = useState('');
  const [isListening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const bufferRef = useRef([]);
  const silenceTimerRef = useRef(null);
  const stoppedRef = useRef(false);

  const trimBuffer = useCallback(() => {
    const now = Date.now();
    bufferRef.current = bufferRef.current.filter((e) => now - e.ts < ROLLING_WINDOW_MS);
  }, []);

  const rebuildTranscript = useCallback(() => {
    trimBuffer();
    const combined = bufferRef.current
      .sort((a, b) => a.ts - b.ts)
      .map((e) => e.text)
      .filter(Boolean)
      .join(' ');
    setTranscript(combined);
    return combined;
  }, [trimBuffer]);

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Web Speech API not available');
      return;
    }

    stoppedRef.current = false;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const api = window.electronAPI;
    if (api) {
      api.getSettings().then((res) => {
        if (res?.success && res.data?.transcriptionLanguage) {
          recognition.lang = res.data.transcriptionLanguage;
        }
      }).catch(() => {});
    }

    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            bufferRef.current.push({ ts: Date.now(), text });
            rebuildTranscript();
          }
        } else {
          interimText += result[0].transcript;
        }
      }
      setLiveText(interimText);

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (typeof onSilence === 'function') onSilence();
      }, SILENCE_DELAY_MS);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('SpeechRecognition error:', event.error);
    };

    recognition.onend = () => {
      if (!stoppedRef.current && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (_) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);

    if (api) api.sendStatusChange?.('listening');
  }, [onSilence, rebuildTranscript]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try { rec.stop(); } catch (_) {}
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setListening(false);

    const api = window.electronAPI;
    if (api) api.sendStatusChange?.('paused');
  }, []);

  const wordCount = transcript.split(/\s+/).filter(Boolean).length;

  return {
    transcript,
    liveText,
    isListening,
    isTranscribing: false,
    wordCount,
    start,
    stop,
  };
}
