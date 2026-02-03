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

  describe('clamping', () => {
    it('clamps to +100', () => {
      const def = makeDef({ shape: 'constant', amplitude: 80, offset: 50 });
      expect(generateWaveformValue(0, def)).toBe(100);
    });

    it('clamps to -100', () => {
      const def = makeDef({ shape: 'constant', amplitude: 80, offset: -50 });
      // constant returns 1 * 80 + (-50) = 30, that's within range
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
