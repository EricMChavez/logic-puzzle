import type { WaveformDef, WaveformShape } from './types.ts';
import { clamp } from '../shared/math/index.ts';

/**
 * Generate a raw shape value in the range [-1, +1] for a given tick.
 * The shape completes one cycle every `period` ticks, offset by `phase`.
 */
function generateShape(shape: WaveformShape, tick: number, period: number, phase: number): number {
  if (shape === 'constant') return 1;
  if (period <= 0) return 0;

  // Normalized position within the cycle [0, 1)
  const t = (((tick + phase) % period) + period) % period / period;

  switch (shape) {
    case 'sine':
      return Math.sin(2 * Math.PI * t);
    case 'square':
      return t < 0.5 ? 1 : -1;
    case 'triangle':
      // Rises from -1 to +1 in the first half, falls from +1 to -1 in the second
      if (t < 0.5) return -1 + 4 * t;
      return 3 - 4 * t;
    case 'sawtooth':
      // Rises from -1 to +1 over the period
      return -1 + 2 * t;
    case 'rectified-sine':
      return Math.max(Math.sin(2 * Math.PI * t), 0);
    case 'rectified-triangle': {
      const tri = t < 0.5 ? -1 + 4 * t : 3 - 4 * t;
      return Math.max(tri, 0);
    }
    case 'clipped-sine':
      return Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * t) * 2));
    case 'fullwave-rectified-sine':
      return Math.abs(Math.sin(2 * Math.PI * t));
    case 'fullwave-rectified-triangle': {
      const triVal = t < 0.5 ? -1 + 4 * t : 3 - 4 * t;
      return Math.abs(triVal);
    }
    default:
      return 0;
  }
}

/**
 * Generate a waveform value at a given tick, clamped to [-100, +100].
 * output = clamp(shape(tick) * amplitude + offset)
 *
 * For 'samples' shape, returns samples[tick % samples.length] directly.
 */
export function generateWaveformValue(tick: number, def: WaveformDef): number {
  // Special case: samples shape returns raw sample values
  if (def.shape === 'samples' && def.samples && def.samples.length > 0) {
    const index = ((tick % def.samples.length) + def.samples.length) % def.samples.length;
    return clamp(def.samples[index]);
  }

  const raw = generateShape(def.shape, tick, def.period, def.phase);
  const scaled = raw * def.amplitude + def.offset;
  return clamp(scaled);
}
