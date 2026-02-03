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
    default:
      return 0;
  }
}

/**
 * Generate a waveform value at a given tick, clamped to [-100, +100].
 * output = clamp(shape(tick) * amplitude + offset)
 */
export function generateWaveformValue(tick: number, def: WaveformDef): number {
  const raw = generateShape(def.shape, tick, def.period, def.phase);
  const scaled = raw * def.amplitude + def.offset;
  return clamp(scaled);
}
