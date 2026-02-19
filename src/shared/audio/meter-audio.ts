import { getBuffer, getAudioContext, isMuted, getVolume } from './audio-manager.ts';

/** Max volume when signal is at full magnitude (±100). Caps continuous meter audio. */
const MAX_METER_VOLUME = 0.2;

/** A single looping audio channel for one meter slot. */
interface MeterChannel {
  source: AudioBufferSourceNode;
  gain: GainNode;
  polarity: 'positive' | 'negitive';
  mismatched: boolean;
}

/** Module-level state */
let masterGain: GainNode | null = null;
let transitionGain: GainNode | null = null;
let pendingTransitionGain = 1;
let running = false;
const channels = new Map<number, MeterChannel>();

type MeterDirection = 'input' | 'output';

/** Build the sound name for a given direction and polarity. */
function bufferName(direction: MeterDirection, polarity: 'positive' | 'negitive'): string {
  return `meter-${direction}-${polarity}`;
}

/**
 * Start the meter audio system. Creates the master gain node.
 * Channels are created lazily when updateSlotAudio is called with a non-zero value.
 */
export function startMeterAudio(): void {
  if (running) return;
  running = true;

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    masterGain = ctx.createGain();
    masterGain.gain.value = isMuted() ? 0 : 1;
    transitionGain = ctx.createGain();
    transitionGain.gain.value = pendingTransitionGain;
    masterGain.connect(transitionGain);
    transitionGain.connect(ctx.destination);
  } catch {
    running = false;
  }
}

/** Stop all meter audio. Disconnects all channels and the master gain. */
export function stopMeterAudio(): void {
  if (!running) return;
  running = false;

  for (const [, channel] of channels) {
    destroyChannel(channel);
  }
  channels.clear();

  if (transitionGain) {
    transitionGain.disconnect();
    transitionGain = null;
  }

  if (masterGain) {
    masterGain.disconnect();
    masterGain = null;
  }
}

/** Destroy a single channel's source and gain nodes. */
function destroyChannel(channel: MeterChannel): void {
  try {
    channel.source.stop();
  } catch {
    // Already stopped
  }
  channel.source.disconnect();
  channel.gain.disconnect();
}

/**
 * Compute the detune value for a meter slot.
 * Each slot gets a slight spread (±5 cents), and mismatched outputs get an extra -50 cents.
 */
function computeDetune(slotIndex: number, isMismatched: boolean): number {
  return (1 - (slotIndex % 3)) * 5 + (isMismatched ? -50 : 0);
}

/**
 * Update a single meter slot's audio.
 * @param slotIndex - Flat slot index (0-5)
 * @param direction - 'input' or 'output'
 * @param value - Signal value at current playpoint (-100 to +100)
 * @param isMismatched - Whether this output meter is actively failing validation
 */
export function updateSlotAudio(slotIndex: number, direction: MeterDirection, value: number, isMismatched = false): void {
  if (!running || !masterGain) return;

  const absValue = Math.abs(value);
  const polarity: 'positive' | 'negitive' = value >= 0 ? 'positive' : 'negitive';
  const soundName = bufferName(direction, polarity);
  const volume = (absValue / 100) * MAX_METER_VOLUME * getVolume(soundName);

  const existing = channels.get(slotIndex);

  // If value is essentially zero, destroy any existing channel
  if (absValue < 0.5) {
    if (existing) {
      destroyChannel(existing);
      channels.delete(slotIndex);
    }
    return;
  }

  // If muted, destroy channel (will recreate when unmuted)
  if (isMuted()) {
    if (existing) {
      destroyChannel(existing);
      channels.delete(slotIndex);
    }
    return;
  }

  // If channel exists with same polarity, smooth gain update
  if (existing && existing.polarity === polarity) {
    const ctx = getAudioContext();
    existing.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    // Smoothly ramp detune if mismatch state changed
    if (existing.mismatched !== isMismatched) {
      const newDetune = computeDetune(slotIndex, isMismatched);
      existing.source.detune.setTargetAtTime(newDetune, ctx.currentTime, 0.02);
      existing.mismatched = isMismatched;
    }
    return;
  }

  // Polarity flipped or no channel: destroy old and create new
  if (existing) {
    destroyChannel(existing);
    channels.delete(slotIndex);
  }

  const buffer = getBuffer(soundName);
  if (!buffer) return;

  try {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.detune.value = computeDetune(slotIndex, isMismatched);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(masterGain);
    source.start(0);
    channels.set(slotIndex, { source, gain, polarity, mismatched: isMismatched });
  } catch {
    // Silently ignore creation errors
  }
}

/** Set the master gain to handle global mute/unmute smoothly. */
export function setMeterAudioMuted(muted: boolean): void {
  if (!masterGain) return;
  try {
    const ctx = getAudioContext();
    masterGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
  } catch {
    // Ignore
  }
}

/**
 * Fade the transition gain node for zoom transitions.
 * @param targetGain - Target gain value (0 = silent, 1 = full volume)
 * @param rampMs - Duration of the ramp in milliseconds. 0 = snap immediately.
 */
export function setMeterTransitionGain(targetGain: number, rampMs: number): void {
  pendingTransitionGain = targetGain;
  if (!transitionGain) return;
  try {
    const ctx = getAudioContext();
    const param = transitionGain.gain;
    param.cancelScheduledValues(ctx.currentTime);
    param.setValueAtTime(param.value, ctx.currentTime);
    if (rampMs <= 0) {
      param.setValueAtTime(targetGain, ctx.currentTime);
    } else {
      param.linearRampToValueAtTime(targetGain, ctx.currentTime + rampMs / 1000);
    }
  } catch {
    // Ignore
  }
}
