import { defineNode } from '../framework';
import type { NodeRuntimeState } from '../framework';
import { clamp } from '../../../shared/math';

const BUFFER_SIZE = 100;

export interface ShaperState extends NodeRuntimeState {
  buffer: number[];
  writeIndex: number;
}

export function createShaperState(): ShaperState {
  return {
    buffer: new Array(BUFFER_SIZE).fill(0),
    writeIndex: 0,
  };
}

export const shaperNode = defineNode({
  type: 'shaper',
  category: 'shaping',

  inputs: [
    { name: 'A', description: 'Signal input' },
    { name: 'B', description: '≥0: Smoother (window size 1-100), <0: Polarizer (intensity)' },
  ],
  outputs: [{ name: 'Out' }],

  createState: createShaperState,

  evaluate: ({ inputs, state }) => {
    const [a, b] = inputs;
    const s = state as ShaperState;

    if (b >= 0) {
      // ─── Smoother Mode ────────────────────────────────────────────────────────
      // Store current sample in rolling buffer
      s.buffer[s.writeIndex] = a;
      s.writeIndex = (s.writeIndex + 1) % BUFFER_SIZE;

      // Window size: B=0 or B=1 → 1 sample, B=100 → 100 samples
      const windowSize = Math.max(1, Math.min(BUFFER_SIZE, Math.round(b)));

      // Average the last windowSize samples
      let sum = 0;
      for (let i = 0; i < windowSize; i++) {
        const idx = (s.writeIndex - 1 - i + BUFFER_SIZE) % BUFFER_SIZE;
        sum += s.buffer[idx];
      }

      return [clamp(sum / windowSize)];
    } else {
      // ─── Polarizer Mode ───────────────────────────────────────────────────────
      // Still write to buffer (maintains state consistency if mode switches)
      s.buffer[s.writeIndex] = a;
      s.writeIndex = (s.writeIndex + 1) % BUFFER_SIZE;

      // Intensity from 0 (linear) to 1 (extreme polarization)
      const intensity = Math.min(1, Math.abs(b) / 100);
      // Exponent: 1 (linear) down to 0 (all values become ±100)
      const exponent = 1 - intensity;

      if (a === 0) return [0];

      const normalized = Math.abs(a) / 100; // 0 to 1
      const shaped = Math.pow(normalized, exponent) * 100;

      return [clamp(Math.sign(a) * shaped)];
    }
  },

  size: { width: 3, height: 2 },
});
