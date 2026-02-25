const { desktopCapturer } = require('electron');

/**
 * Platform-specific hints for virtual audio devices.
 * Windows: VB-Cable, Voicemeeter, or similar virtual audio cable for loopback.
 * Mac: BlackHole 2ch for routing system audio into a capture stream.
 * We cannot enumerate devices from main process without native modules;
 * the renderer will use getDisplayMedia (system audio) and getUserMedia (mic).
 * This module provides helpers for the main process to pass to renderer or for logging.
 */

function getPlatform() {
  return process.platform;
}

function getAudioSetupHint() {
  const platform = getPlatform();
  if (platform === 'win32') {
    return {
      platform: 'windows',
      virtualDeviceName: 'VB-Cable',
      downloadUrl: 'https://vb-audio.com/Cable/',
      message: 'For system audio capture on Windows, install VB-Cable or similar virtual audio cable, then select it as the audio source when prompted for screen share with system audio.',
    };
  }
  if (platform === 'darwin') {
    return {
      platform: 'mac',
      virtualDeviceName: 'BlackHole',
      downloadUrl: 'https://existential.audio/blackhole/',
      message: 'For system audio capture on Mac, install BlackHole 2ch, create a Multi-Output Device in Audio MIDI Setup (System Audio + BlackHole), then select that or your display when prompted for screen share.',
    };
  }
  return {
    platform: 'other',
    virtualDeviceName: null,
    downloadUrl: null,
    message: 'System audio capture may require a virtual audio device. Check documentation for your OS.',
  };
}

/**
 * Optional: list sources for desktop capturer (screens/windows).
 * Used by renderer via getDisplayMedia; main process does not capture audio directly.
 */
async function getDisplaySources() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    return { success: true, sources };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getPlatform,
  getAudioSetupHint,
  getDisplaySources,
};
