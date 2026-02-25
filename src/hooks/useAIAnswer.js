import { useCallback } from 'react';

export function useAIAnswer() {
  const requestAnswer = useCallback(async (utterance, fullContext) => {
    const api = window.electronAPI;
    if (!api) return { error: 'App not ready' };
    const trimmed = String(utterance || '').trim();
    if (!trimmed && !String(fullContext || '').trim()) return null;

    const res = await api.getAIAnswer({
      utterance: trimmed || String(fullContext || '').trim().slice(-500),
      fullContext: (fullContext && String(fullContext).trim()) || trimmed,
    });
    if (res?.success && res.data) return res.data;
    if (res && !res.success) throw new Error(res.error || 'Answer request failed');
    return null;
  }, []);

  return { requestAnswer };
}
