import React from 'react';
import { HiSignal, HiCpuChip, HiPauseCircle } from 'react-icons/hi2';

const statusConfig = {
  listening: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500',
    label: 'Listening',
    Icon: HiSignal,
    animate: true,
  },
  processing: {
    color: 'text-amber-400',
    bg: 'bg-amber-500',
    label: 'Processing',
    Icon: HiCpuChip,
    animate: true,
  },
  paused: {
    color: 'text-gray-400',
    bg: 'bg-gray-500',
    label: 'Paused',
    Icon: HiPauseCircle,
    animate: false,
  },
};

export default function StatusBar({ status = 'paused', lastQuestion, wordCount }) {
  const config = statusConfig[status] || statusConfig.paused;
  const Icon = config.Icon;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800/80 rounded-xl border border-gray-700/50">
      <div
        className={`flex items-center gap-2 ${config.color}`}
        title={config.label}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.bg} ${config.animate ? 'animate-pulse' : ''}`} />
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{config.label}</span>
      </div>
      {lastQuestion != null && lastQuestion !== '' && (
        <span className="text-sm text-gray-500 truncate max-w-[220px]" title={lastQuestion}>
          Last: {lastQuestion}
        </span>
      )}
      {wordCount != null && (
        <span className="text-xs text-gray-500 ml-auto font-medium tabular-nums">
          {wordCount} words
        </span>
      )}
    </div>
  );
}
