import { useState, useRef, useCallback } from 'react';

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1500;
const CHUNK_INTERVAL_MS = 3000;
const SAMPLE_RATE = 44100;

function float32To16BitPCM(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function createWavBlob(pcm16, sampleRate) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  const uint8 = new Uint8Array(buffer);
  const pcmOffset = 44;
  const pcmBytes = new Uint8Array(pcm16.buffer);
  for (let i = 0; i < pcmBytes.length; i++) uint8[pcmOffset + i] = pcmBytes[i];
  return new Blob([buffer], { type: 'audio/wav' });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result?.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isVBCableLabel(label) {
  return /CABLE|VB-Audio|Virtual Cable/i.test(label || '');
}

function isVirtualDeviceLabel(label) {
  return /CABLE|VB-Audio|Virtual Cable|Voicemod|Virtual Audio/i.test(label || '');
}

function findPhysicalMic(audioInputs, excludeDeviceId) {
  return audioInputs.find(
    (d) => d.deviceId !== 'default' && d.deviceId !== 'communications'
      && d.deviceId !== excludeDeviceId
      && !isVirtualDeviceLabel(d.label)
      && d.label
  );
}

export async function getAudioInputDevicesWithLabels() {
  let list = await navigator.mediaDevices.enumerateDevices();
  let audioInputs = list.filter((d) => d.kind === 'audioinput');
  const hasLabels = audioInputs.some((d) => d.label && d.label.trim() !== '');
  if (!hasLabels) {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach((t) => t.stop());
    list = await navigator.mediaDevices.enumerateDevices();
    audioInputs = list.filter((d) => d.kind === 'audioinput');
  }
  return audioInputs;
}

export function useAudioCapture({ onChunk, onSilence }) {
  const [isListening, setListening] = useState(false);
  const [systemAudioWarning, setSystemAudioWarning] = useState(false);
  const contextRef = useRef(null);
  const streamRef = useRef(null);
  const workletNodeRef = useRef(null);
  const bufferRef = useRef([]);
  const silenceStartRef = useRef(null);
  const silenceFiredRef = useRef(false);
  const chunkIntervalRef = useRef(null);
  const lastChunkTimeRef = useRef(0);

  const flushChunk = useCallback(async () => {
    if (bufferRef.current.length === 0) return;
    const samples = bufferRef.current;
    bufferRef.current = [];
    const flat = new Float32Array(samples.reduce((acc, s) => acc + s.length, 0));
    let offset = 0;
    for (const s of samples) {
      flat.set(s, offset);
      offset += s.length;
    }
    if (flat.length < 1000) return;

    let sum = 0;
    for (let i = 0; i < flat.length; i++) sum += flat[i] * flat[i];
    const rms = Math.sqrt(sum / flat.length);
    if (rms < SILENCE_THRESHOLD) return;

    const pcm16 = float32To16BitPCM(flat);
    const blob = createWavBlob(pcm16, SAMPLE_RATE);
    const base64 = await blobToBase64(blob);
    if (typeof onChunk === 'function') onChunk(base64);
    lastChunkTimeRef.current = Date.now();
  }, [onChunk]);

  const checkSilence = useCallback(() => {
    if (bufferRef.current.length === 0) return;
    const recent = bufferRef.current.slice(-20);
    const flat = new Float32Array(recent.reduce((acc, s) => acc + s.length, 0));
    let o = 0;
    for (const s of recent) {
      flat.set(s, o);
      o += s.length;
    }
    let sum = 0;
    for (let i = 0; i < flat.length; i++) sum += flat[i] * flat[i];
    const rms = Math.sqrt(sum / flat.length);
    if (rms < SILENCE_THRESHOLD) {
      if (silenceFiredRef.current) return;
      if (silenceStartRef.current == null) silenceStartRef.current = Date.now();
      else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS) {
        silenceStartRef.current = null;
        silenceFiredRef.current = true;
        if (typeof onSilence === 'function') onSilence();
      }
    } else {
      silenceStartRef.current = null;
      silenceFiredRef.current = false;
    }
  }, [onSilence]);

  const start = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;

    let settings = {};
    try {
      const res = await api.getSettings();
      if (res?.success && res.data) settings = res.data;
    } catch (_) {}

    const raw = settings.audioInputDeviceId;
    const savedDeviceId = raw === 'default' || raw === undefined || raw === null || raw === '' ? null : raw;

    let audioInputs = [];
    try {
      audioInputs = await getAudioInputDevicesWithLabels();
    } catch (_) {}

    let targetDeviceId = null;
    let targetIsVBCable = false;
    if (savedDeviceId && audioInputs.some((d) => d.deviceId === savedDeviceId)) {
      targetDeviceId = savedDeviceId;
      targetIsVBCable = isVBCableLabel(audioInputs.find((d) => d.deviceId === savedDeviceId)?.label);
    } else if (!savedDeviceId) {
      const vbCable = audioInputs.find((d) => isVBCableLabel(d.label));
      if (vbCable) {
        targetDeviceId = vbCable.deviceId;
        targetIsVBCable = true;
      }
    }

    let micStream = null;
    let systemStream = null;

    if (targetDeviceId) {
      try {
        systemStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: targetDeviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (err) {
        if (targetIsVBCable) {
          api.emitSystemAudioWarning();
          setSystemAudioWarning(true);
        }
      }

      const physicalMic = findPhysicalMic(audioInputs, targetDeviceId);
      if (physicalMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: physicalMic.deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
        } catch (_) {}
      }
    } else {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        console.error('Microphone access failed', err);
        return;
      }
    }

    if (!micStream && !systemStream) {
      console.error('No audio source available');
      return;
    }

    setSystemAudioWarning(false);

    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    contextRef.current = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const gainMix = ctx.createGain();
    gainMix.gain.value = 1;

    if (micStream) {
      const micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(gainMix);
    }
    if (systemStream) {
      const sysSource = ctx.createMediaStreamSource(systemStream);
      sysSource.connect(gainMix);
    }

    const processorCode = `
      class CaptureProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0]?.[0];
          if (input && input.length) {
            this.port.postMessage(input.slice(0));
          }
          return true;
        }
      }
      registerProcessor('capture-processor', CaptureProcessor);
    `;
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
    } catch (err) {
      URL.revokeObjectURL(url);
      [micStream, systemStream].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
      ctx.close().catch(() => {});
      return;
    }
    URL.revokeObjectURL(url);

    const workletNode = new AudioWorkletNode(ctx, 'capture-processor');
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (e) => {
      if (e.data && e.data.length) {
        bufferRef.current.push(e.data);
      }
    };

    gainMix.connect(workletNode);
    workletNode.connect(ctx.destination);

    streamRef.current = { mic: micStream, system: systemStream };

    chunkIntervalRef.current = setInterval(() => {
      checkSilence();
      flushChunk();
    }, CHUNK_INTERVAL_MS);

    setListening(true);
  }, [flushChunk, checkSilence]);

  const stop = useCallback(() => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (workletNodeRef.current && contextRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch (_) {}
      workletNodeRef.current = null;
    }
    if (streamRef.current) {
      [streamRef.current.mic, streamRef.current.system].forEach((s) => {
        if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
      });
      streamRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close().catch(() => {});
      contextRef.current = null;
    }
    bufferRef.current = [];
    silenceStartRef.current = null;
    silenceFiredRef.current = false;
    setListening(false);
  }, []);

  const recordFor = useCallback(
    (durationMs) =>
      new Promise((resolve, reject) => {
        const api = window.electronAPI;
        if (!api) {
          reject(new Error('Electron API not available'));
          return;
        }
        const buffer = [];
        const processorCode = `
          class RecordProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0]?.[0];
              if (input && input.length) this.port.postMessage(input.slice(0));
              return true;
            }
          }
          registerProcessor('record-processor', RecordProcessor);
        `;
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        const blob = new Blob([processorCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        ctx.audioWorklet
          .addModule(url)
          .then(() => {
            URL.revokeObjectURL(url);
            return navigator.mediaDevices.getUserMedia({ audio: true });
          })
          .then((stream) => {
            const node = new AudioWorkletNode(ctx, 'record-processor');
            node.port.onmessage = (e) => {
              if (e.data && e.data.length) buffer.push(e.data);
            };
            const src = ctx.createMediaStreamSource(stream);
            src.connect(node);
            node.connect(ctx.destination);
            const sampleRate = ctx.sampleRate;
            setTimeout(() => {
              stream.getTracks().forEach((t) => t.stop());
              ctx.close();
              const flat = new Float32Array(buffer.reduce((a, s) => a + s.length, 0));
              let o = 0;
              for (const s of buffer) {
                flat.set(s, o);
                o += s.length;
              }
              const pcm16 = float32To16BitPCM(flat);
              const wavBlob = createWavBlob(pcm16, sampleRate);
              blobToBase64(wavBlob).then(resolve).catch(reject);
            }, durationMs);
          })
          .catch(reject);
      }),
    []
  );

  return { isListening, start, stop, recordFor, systemAudioWarning };
}
