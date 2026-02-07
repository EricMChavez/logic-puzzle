import { describe, it, expect } from 'vitest';
import { generateWaveformValue } from './waveform-generators.ts';
import type { WaveformDef } from './types.ts';

function makeDef(overrides: Partial<WaveformDef> = {}): WaveformDef {
  return {
    shape: 'sine',
    amplitude: 50,
    period: 16,
    phase: 0,
    offset: 0,
    ...overrides,
  };
}

describe('generateWaveformValue', () => {
  describe('constant shape', () => {
    it('returns amplitude + offset at any tick', () => {
      const def = makeDef({ shape: 'constant', amplitude: 30, offset: 10 });
      expect(generateWaveformValue(0, def)).toBe(40);
      expect(generateWaveformValue(99, def)).toBe(40);
    });
  });

  describe('sine shape', () => {
    it('returns 0 at tick 0 with period 16', () => {
      const def = makeDef({ shape: 'sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(0, 5);
    });

    it('returns +amplitude at quarter period', () => {
      const def = makeDef({ shape: 'sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(4, def)).toBeCloseTo(50, 5);
    });

    it('returns 0 at half period', () => {
      const def = makeDef({ shape: 'sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(8, def)).toBeCloseTo(0, 5);
    });

    it('returns -amplitude at three-quarter period', () => {
      const def = makeDef({ shape: 'sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(12, def)).toBeCloseTo(-50, 5);
    });

    it('applies phase offset', () => {
      // Phase of 4 shifts the sine so tick 0 behaves like tick 4
      const def = makeDef({ shape: 'sine', amplitude: 50, period: 16, phase: 4 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(50, 5);
    });

    it('applies DC offset', () => {
      const def = makeDef({ shape: 'sine', amplitude: 50, period: 16, offset: 20 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(20, 5);
      expect(generateWaveformValue(4, def)).toBeCloseTo(70, 5);
    });
  });

  describe('square shape', () => {
    it('returns +amplitude in first half, -amplitude in second half', () => {
      const def = makeDef({ shape: 'square', amplitude: 40, period: 16 });
      expect(generateWaveformValue(0, def)).toBe(40);
      expect(generateWaveformValue(3, def)).toBe(40);
      expect(generateWaveformValue(8, def)).toBe(-40);
      expect(generateWaveformValue(15, def)).toBe(-40);
    });
  });

  describe('triangle shape', () => {
    it('starts at -amplitude, peaks at half period, returns to -amplitude', () => {
      const def = makeDef({ shape: 'triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(-50, 5);
      expect(generateWaveformValue(4, def)).toBeCloseTo(0, 5);
      expect(generateWaveformValue(8, def)).toBeCloseTo(50, 5);
      expect(generateWaveformValue(12, def)).toBeCloseTo(0, 5);
    });
  });

  describe('sawtooth shape', () => {
    it('rises linearly from -amplitude to +amplitude', () => {
      const def = makeDef({ shape: 'sawtooth', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(-50, 5);
      expect(generateWaveformValue(8, def)).toBeCloseTo(0, 5);
    });
  });

  describe('rectified-sine shape', () => {
    it('returns 0 at tick 0 (sin(0) = 0)', () => {
      const def = makeDef({ shape: 'rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(0, 5);
    });

    it('returns +amplitude at quarter period', () => {
      const def = makeDef({ shape: 'rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(4, def)).toBeCloseTo(50, 5);
    });

    it('returns 0 at half period', () => {
      const def = makeDef({ shape: 'rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(8, def)).toBeCloseTo(0, 5);
    });

    it('returns 0 in negative half (three-quarter period)', () => {
      const def = makeDef({ shape: 'rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(12, def)).toBeCloseTo(0, 5);
    });

    it('never goes negative across a full period', () => {
      const def = makeDef({ shape: 'rectified-sine', amplitude: 100, period: 32 });
      for (let t = 0; t < 32; t++) {
        expect(generateWaveformValue(t, def)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('rectified-triangle shape', () => {
    it('returns 0 at tick 0 (triangle starts at -1, clamped to 0)', () => {
      const def = makeDef({ shape: 'rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(0, 5);
    });

    it('returns +amplitude at half period (triangle peak)', () => {
      const def = makeDef({ shape: 'rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(8, def)).toBeCloseTo(50, 5);
    });

    it('returns 0 at quarter period (triangle crosses zero rising)', () => {
      const def = makeDef({ shape: 'rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(4, def)).toBeCloseTo(0, 5);
    });

    it('returns 0 at three-quarter period (triangle crosses zero falling)', () => {
      const def = makeDef({ shape: 'rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(12, def)).toBeCloseTo(0, 5);
    });

    it('never goes negative across a full period', () => {
      const def = makeDef({ shape: 'rectified-triangle', amplitude: 100, period: 32 });
      for (let t = 0; t < 32; t++) {
        expect(generateWaveformValue(t, def)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('clipped-sine shape', () => {
    it('returns 0 at tick 0 (sin(0) = 0)', () => {
      const def = makeDef({ shape: 'clipped-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(0, 5);
    });

    it('clips at +amplitude at quarter period (sin*2 > 1 → 1)', () => {
      const def = makeDef({ shape: 'clipped-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(4, def)).toBeCloseTo(50, 5);
    });

    it('clips at -amplitude at three-quarter period (sin*2 < -1 → -1)', () => {
      const def = makeDef({ shape: 'clipped-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(12, def)).toBeCloseTo(-50, 5);
    });

    it('stays in [-amplitude, +amplitude] across a full period', () => {
      const def = makeDef({ shape: 'clipped-sine', amplitude: 80, period: 32 });
      for (let t = 0; t < 32; t++) {
        const val = generateWaveformValue(t, def);
        expect(val).toBeGreaterThanOrEqual(-80);
        expect(val).toBeLessThanOrEqual(80);
      }
    });

    it('is symmetric: value at t mirrors value at t+half_period', () => {
      const def = makeDef({ shape: 'clipped-sine', amplitude: 50, period: 32 });
      for (let t = 0; t < 16; t++) {
        const v1 = generateWaveformValue(t, def);
        const v2 = generateWaveformValue(t + 16, def);
        expect(v1).toBeCloseTo(-v2, 5);
      }
    });
  });

  describe('fullwave-rectified-sine shape', () => {
    it('returns 0 at tick 0 (sin(0) = 0)', () => {
      const def = makeDef({ shape: 'fullwave-rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(0, 5);
    });

    it('returns +amplitude at quarter period', () => {
      const def = makeDef({ shape: 'fullwave-rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(4, def)).toBeCloseTo(50, 5);
    });

    it('returns 0 at half period', () => {
      const def = makeDef({ shape: 'fullwave-rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(8, def)).toBeCloseTo(0, 5);
    });

    it('returns +amplitude at three-quarter period (abs of negative half)', () => {
      const def = makeDef({ shape: 'fullwave-rectified-sine', amplitude: 50, period: 16 });
      expect(generateWaveformValue(12, def)).toBeCloseTo(50, 5);
    });

    it('never goes negative across a full period', () => {
      const def = makeDef({ shape: 'fullwave-rectified-sine', amplitude: 100, period: 32 });
      for (let t = 0; t < 32; t++) {
        expect(generateWaveformValue(t, def)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('fullwave-rectified-triangle shape', () => {
    it('returns +amplitude at tick 0 (abs of -1) = 1)', () => {
      const def = makeDef({ shape: 'fullwave-rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(0, def)).toBeCloseTo(50, 5);
    });

    it('returns +amplitude at half period (triangle peak)', () => {
      const def = makeDef({ shape: 'fullwave-rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(8, def)).toBeCloseTo(50, 5);
    });

    it('returns 0 at quarter period (triangle crosses zero)', () => {
      const def = makeDef({ shape: 'fullwave-rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(4, def)).toBeCloseTo(0, 5);
    });

    it('returns 0 at three-quarter period (triangle crosses zero)', () => {
      const def = makeDef({ shape: 'fullwave-rectified-triangle', amplitude: 50, period: 16 });
      expect(generateWaveformValue(12, def)).toBeCloseTo(0, 5);
    });

    it('never goes negative across a full period', () => {
      const def = makeDef({ shape: 'fullwave-rectified-triangle', amplitude: 100, period: 32 });
      for (let t = 0; t < 32; t++) {
        expect(generateWaveformValue(t, def)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('clamping', () => {
    it('clamps to +100', () => {
      const def = makeDef({ shape: 'constant', amplitude: 80, offset: 50 });
      expect(generateWaveformValue(0, def)).toBe(100);
    });

    it('clamps to -100', () => {
      // Try negative amplitude case
      const def2 = makeDef({ shape: 'square', amplitude: 80, offset: -50 });
      // second half: -80 + (-50) = -130 → clamped to -100
      expect(generateWaveformValue(8, def2)).toBe(-100);
    });
  });

  describe('edge cases', () => {
    it('returns 0 when period is 0', () => {
      const def = makeDef({ shape: 'sine', amplitude: 50, period: 0 });
      expect(generateWaveformValue(5, def)).toBe(0);
    });

    it('handles negative phase correctly', () => {
      const def = makeDef({ shape: 'square', amplitude: 50, period: 16, phase: -4 });
      // tick 0 with phase -4: effective tick = -4, normalized = 12/16 = 0.75 → second half → -50
      expect(generateWaveformValue(0, def)).toBe(-50);
    });
  });
});
