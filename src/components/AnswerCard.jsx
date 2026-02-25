import React, { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';

function getBorderClass(codeSnippet) {
  if (codeSnippet) return 'border-l-4 border-green-500/80';
  return 'border-l-4 border-blue-500/80';
}

export function SkeletonCard() {
  return (
    <div
      className="w-full rounded-xl backdrop-blur-md bg-black/60 border border-white/10 border-l-4 border-gray-500/50 p-4 animate-skeleton-pulse"
      data-testid="skeleton-card"
    >
      <div className="h-3 w-3/4 bg-gray-600 rounded mb-3" />
      <div className="h-4 w-full bg-gray-600 rounded mb-2" />
      <div className="h-4 w-5/6 bg-gray-600 rounded mb-3" />
      <div className="h-24 w-full bg-gray-600 rounded" />
    </div>
  );
}

export default function AnswerCard({
  question,
  answer,
  codeSnippet,
  language = 'text',
  onClose,
  onCopy,
  copyText,
}) {
  const codeRef = useRef(null);

  useEffect(() => {
    if (!codeSnippet || !codeRef.current) return;
    try {
      const grammar = Prism.languages[language] || Prism.languages.javascript;
      const highlighted = Prism.highlight(codeSnippet, grammar, language);
      codeRef.current.innerHTML = highlighted;
    } catch (_) {
      codeRef.current.textContent = codeSnippet;
    }
  }, [codeSnippet, language]);

  const handleCopy = () => {
    const text = copyText || [question, answer, codeSnippet].filter(Boolean).join('\n\n');
    if (typeof onCopy === 'function') onCopy(text);
  };

  const borderClass = getBorderClass(codeSnippet);

  return (
    <div className={`w-full rounded-xl backdrop-blur-md bg-black/60 border border-white/10 ${borderClass} p-4 animate-slide-in`}>
      <div className="flex justify-end gap-2 mb-2">
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none px-2 py-1 rounded"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {question && (
        <p className="text-sm text-gray-400 mb-2 break-words">{question}</p>
      )}
      <p className="text-gray-100 text-base leading-relaxed whitespace-pre-wrap break-words">{answer}</p>
      {codeSnippet && (
        <pre className="language-none mt-3 rounded overflow-x-auto" style={{ background: '#1d1f21' }}>
          <code ref={codeRef} className={`language-${language}`} />
        </pre>
      )}
    </div>
  );
}
