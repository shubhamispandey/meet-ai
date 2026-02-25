import { useState, useRef, useCallback } from 'react';

const ROLLING_WINDOW_MS = 60000;

const HALLUCINATION_PHRASES = new Set([
  'thank you', 'thank you.', 'thanks.', 'thanks for watching.', 'thanks for watching',
  'thank you for watching.', 'thank you for watching',
  'amen.', 'amen', 'beep.', 'beep', 'bye.', 'bye', 'goodbye.', 'goodbye',
  'hello?', 'hello.', 'hello', 'hmm.', 'hmm', 'hm.', 'oh.', 'ah.', 'shh.', 'shh',
  'you', 'you.', '.', '..', '...', 'the end.', 'the end',
  'subtitles by the amara.org community',
  'thanks for listening.', 'thanks for listening',
  'please subscribe.', 'please subscribe',
  'like and subscribe.', 'like and subscribe',
  'silence.', 'silence', 'so.', 'so', 'yeah.', 'yeah',
]);

function isHallucination(text) {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return true;
  return HALLUCINATION_PHRASES.has(trimmed);
}

export function useTranscription() {
  const [transcript, setTranscript] = useState('');
  const [liveText, setLiveText] = useState('');
  const [isTranscribing, setTranscribing] = useState(false);
  const bufferRef = useRef([]);

  const trimBuffer = useCallback(() => {
    const now = Date.now();
    bufferRef.current = bufferRef.current.filter((e) => now - e.ts < ROLLING_WINDOW_MS);
  }, []);

  const handleChunk = useCallback(
    async (base64) => {
      const api = window.electronAPI;
      if (!api) return;
      setTranscribing(true);
      try {
        const res = await api.transcribeAudio(base64);
        trimBuffer();
        if (res?.success && res.data) {
          const text = typeof res.data === 'string' ? res.data : '';
          if (isHallucination(text)) return;
          bufferRef.current.push({ ts: Date.now(), text });
          setLiveText(text);
          const combined = [...bufferRef.current]
            .sort((a, b) => a.ts - b.ts)
            .map((e) => e.text)
            .filter(Boolean)
            .join(' ');
          setTranscript(combined);
        }
      } finally {
        setTranscribing(false);
      }
    },
    [trimBuffer]
  );

  const wordCount = transcript.split(/\s+/).filter(Boolean).length;

  return {
    transcript,
    liveText,
    isTranscribing,
    wordCount,
    handleChunk,
  };
}
