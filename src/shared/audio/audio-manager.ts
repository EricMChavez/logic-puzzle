import playUrl from '../../assets/audio/play.wav';
import pauseUrl from '../../assets/audio/pause.wav';
import nodeDrop1Url from '../../assets/audio/node-drop-1.wav';
import nodeDrop2Url from '../../assets/audio/node-drop-2.wav';
import nodeDrop3Url from '../../assets/audio/node-drop-3.wav';
import wireDrop1Url from '../../assets/audio/wire-drop-1.wav';
import wireDrop2Url from '../../assets/audio/wire-drop-2.wav';
import wireDrop3Url from '../../assets/audio/wire-drop-3.wav';
import winUrl from '../../assets/audio/win.wav';
import knobTic1Url from '../../assets/audio/knob-tic-1.wav';
import knobTic2Url from '../../assets/audio/knob-tic-2.wav';
import knobTic3Url from '../../assets/audio/knob-tic-3.wav';
import meterValidUrl from '../../assets/audio/meter-valid.wav';
import nextCycleUrl from '../../assets/audio/next-cycle.wav';
import prevCycleUrl from '../../assets/audio/prev-cycle.wav';
import revealOpenStartUrl from '../../assets/audio/reveal-open-start.wav';
import revealCloseEndUrl from '../../assets/audio/reveal-close-end.wav';
import meterInputPositiveUrl from '../../assets/audio/meters/input-positive.wav';
import meterInputNegitiveUrl from '../../assets/audio/meters/input-negitive.wav';
import meterOutputPositiveUrl from '../../assets/audio/meters/output-positive.wav';
import meterOutputNegitiveUrl from '../../assets/audio/meters/output-negitive.wav';
import menuTabUrl from '../../assets/audio/menu-tab.wav';
import menuPlayButtonUrl from '../../assets/audio/menu-play-button.wav';

const STORAGE_KEY = 'wavelength-muted';
const VOLUME_STORAGE_KEY = 'wavelength-sound-volumes';

/** Module-level state */
let audioContext: AudioContext | null = null;
let muted = false;
const buffers = new Map<string, AudioBuffer>();
const volumes = new Map<string, number>();
let initialized = false;
let nodeDropIndex = 0;
let wireDropIndex = 0;
let knobTicIndex = 0;

/** Sound name → asset URL mapping */
const soundUrls: Record<string, string> = {
  play: playUrl,
  pause: pauseUrl,
  'node-drop-1': nodeDrop1Url,
  'node-drop-2': nodeDrop2Url,
  'node-drop-3': nodeDrop3Url,
  'wire-drop-1': wireDrop1Url,
  'wire-drop-2': wireDrop2Url,
  'wire-drop-3': wireDrop3Url,
  win: winUrl,
  'knob-tic-1': knobTic1Url,
  'knob-tic-2': knobTic2Url,
  'knob-tic-3': knobTic3Url,
  'meter-valid': meterValidUrl,
  'next-cycle': nextCycleUrl,
  'prev-cycle': prevCycleUrl,
  'reveal-open-start': revealOpenStartUrl,
  'reveal-close-end': revealCloseEndUrl,
  'meter-input-positive': meterOutputPositiveUrl,
  'meter-input-negitive': meterOutputNegitiveUrl,
  'meter-output-positive': meterInputPositiveUrl,
  'meter-output-negitive': meterInputNegitiveUrl,
  'menu-tab': menuTabUrl,
  'menu-play-button': menuPlayButtonUrl,
};

/** Read mute state from localStorage */
function loadMuteState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persist mute state to localStorage */
function saveMuteState(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors
  }
}

/** Load per-sound volumes from localStorage */
function loadVolumes(): void {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const [name, vol] of Object.entries(parsed)) {
        volumes.set(name, vol);
      }
    }
  } catch {
    // Ignore parse errors
  }
}

/** Persist per-sound volumes to localStorage */
function saveVolumes(): void {
  try {
    const obj: Record<string, number> = {};
    for (const [name, vol] of volumes) {
      obj[name] = vol;
    }
    localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Ensure AudioContext exists. Created lazily because browsers
 * require a user gesture before allowing audio playback.
 */
function ensureContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/** Fetch and decode a single audio file into an AudioBuffer */
async function loadSound(name: string, url: string): Promise<void> {
  try {
    const ctx = ensureContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    buffers.set(name, audioBuffer);
  } catch {
    // Silently skip sounds that fail to load
  }
}

/**
 * Initialize the audio system. Call once from main.tsx.
 * Pre-loads all sound buffers.
 */
export async function initAudio(): Promise<void> {
  if (initialized) return;
  initialized = true;
  muted = loadMuteState();
  loadVolumes();

  // Default volumes (most sounds at full, win quieter)
  const defaultVolumes: Record<string, number> = { win: 0.2 };
  for (const name of Object.keys(soundUrls)) {
    if (!volumes.has(name)) volumes.set(name, defaultVolumes[name] ?? 1.0);
  }

  // Pre-load all sounds (context created lazily on first playSound)
  const entries = Object.entries(soundUrls);
  await Promise.all(entries.map(([name, url]) => loadSound(name, url)));
}

/**
 * Play a named sound effect. No-ops if muted or sound not loaded.
 */
export function playSound(name: string): void {
  if (muted) return;
  const buffer = buffers.get(name);
  if (!buffer) return;

  const vol = volumes.get(name) ?? 1.0;
  if (vol <= 0) return;

  try {
    const ctx = ensureContext();
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
  } catch {
    // Silently ignore playback errors
  }
}

/** Play the next node-drop sound, cycling 1 → 2 → 3 → 1 → ... */
export function playNodeDrop(): void {
  playSound(`node-drop-${nodeDropIndex + 1}`);
  nodeDropIndex = (nodeDropIndex + 1) % 3;
}

/** Play the next wire-drop sound, cycling 1 → 2 → 3 → 1 → ... */
export function playWireDrop(): void {
  playSound(`wire-drop-${wireDropIndex + 1}`);
  wireDropIndex = (wireDropIndex + 1) % 3;
}

/** Play the next knob-tic sound, cycling 1 → 2 → 3 → 1 → ... */
export function playKnobTic(): void {
  playSound(`knob-tic-${knobTicIndex + 1}`);
  knobTicIndex = (knobTicIndex + 1) % 3;
}

/** Play the win/victory sound */
export function playWin(): void {
  playSound('win');
}

/** Check if audio is muted */
export function isMuted(): boolean {
  return muted;
}

/** Set mute state and persist to localStorage */
export function setMuted(value: boolean): void {
  muted = value;
  saveMuteState(value);
}

/** Get all sound names */
export function getSoundNames(): string[] {
  return Object.keys(soundUrls);
}

/** Get volume for a sound (0-1) */
export function getVolume(name: string): number {
  return volumes.get(name) ?? 1.0;
}

/** Set volume for a sound (0-1) and persist */
export function setVolume(name: string, value: number): void {
  volumes.set(name, Math.max(0, Math.min(1, value)));
  saveVolumes();
}

/** Get a pre-loaded AudioBuffer by name, or null if not loaded. */
export function getBuffer(name: string): AudioBuffer | null {
  return buffers.get(name) ?? null;
}

/** Get the shared AudioContext (creates lazily if needed). */
export function getAudioContext(): AudioContext {
  return ensureContext();
}
