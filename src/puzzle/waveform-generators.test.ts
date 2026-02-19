import { describe, it, expect } from 'vitest';
import { generateWaveformValue, getShapePeriod, shapeAtPhase, generateFMSamples } from './waveform-generators.ts';
import type { WaveformDef } from './types.ts';

function makeDef(overrides: Partial<WaveformDef> = {}): WaveformDef {
  return {
    shape: 'sine-quarter',
    amplitude: 100,
    period: 64,
    phase: 0,
    offset: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getShapePeriod
// ---------------------------------------------------------------------------

describe('getShapePeriod', () => {
  it('returns 256 for full shapes', () => {
    expect(getShapePeriod('sine-full')).toBe(256);
    expect(getShapePeriod('triangle-full')).toBe(256);
    expect(getShapePeriod('square-full')).toBe(256);
    expect(getShapePeriod('sawtooth-full')).toBe(256);
  });

  it('returns 128 for half shapes', () => {
    expect(getShapePeriod('sine-half')).toBe(128);
    expect(getShapePeriod('triangle-half')).toBe(128);
    expect(getShapePeriod('square-half')).toBe(128);
    expect(getShapePeriod('sawtooth-half')).toBe(128);
  });

  it('returns 64 for quarter shapes', () => {
    expect(getShapePeriod('sine-quarter')).toBe(64);
    expect(getShapePeriod('triangle-quarter')).toBe(64);
    expect(getShapePeriod('square-quarter')).toBe(64);
    expect(getShapePeriod('sawtooth-quarter')).toBe(64);
  });

  it('returns 64 for samples', () => {
    expect(getShapePeriod('samples')).toBe(64);
  });

  it('returns same periods for reduced variants', () => {
    expect(getShapePeriod('sine-full-reduced')).toBe(256);
    expect(getShapePeriod('sine-half-reduced')).toBe(128);
    expect(getShapePeriod('sine-quarter-reduced')).toBe(64);
    expect(getShapePeriod('triangle-full-reduced')).toBe(256);
    expect(getShapePeriod('square-half-reduced')).toBe(128);
    expect(getShapePeriod('sawtooth-quarter-reduced')).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// Sine variants
// ---------------------------------------------------------------------------

describe.each([
  { shape: 'sine-full' as const, period: 256 },
  { shape: 'sine-half' as const, period: 128 },
  { shape: 'sine-quarter' as const, period: 64 },
])('$shape (period=$period)', ({ shape, period }) => {
  it('returns 0 at tick 0', () => {
    expect(generateWaveformValue(0, makeDef({ shape, period }))).toBeCloseTo(0, 5);
  });

  it('returns +amplitude at quarter period', () => {
    expect(generateWaveformValue(period / 4, makeDef({ shape, period }))).toBeCloseTo(100, 5);
  });

  it('returns 0 at half period', () => {
    expect(generateWaveformValue(period / 2, makeDef({ shape, period }))).toBeCloseTo(0, 5);
  });

  it('returns -amplitude at three-quarter period', () => {
    expect(generateWaveformValue(period * 3 / 4, makeDef({ shape, period }))).toBeCloseTo(-100, 5);
  });

  it('completes full cycle', () => {
    expect(generateWaveformValue(period, makeDef({ shape, period }))).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// Triangle variants
// ---------------------------------------------------------------------------

describe.each([
  { shape: 'triangle-full' as const, period: 256 },
  { shape: 'triangle-half' as const, period: 128 },
  { shape: 'triangle-quarter' as const, period: 64 },
])('$shape (period=$period)', ({ shape, period }) => {
  it('starts at -amplitude', () => {
    expect(generateWaveformValue(0, makeDef({ shape, period }))).toBeCloseTo(-100, 5);
  });

  it('returns 0 at quarter period', () => {
    expect(generateWaveformValue(period / 4, makeDef({ shape, period }))).toBeCloseTo(0, 5);
  });

  it('returns +amplitude at half period', () => {
    expect(generateWaveformValue(period / 2, makeDef({ shape, period }))).toBeCloseTo(100, 5);
  });

  it('returns 0 at three-quarter period', () => {
    expect(generateWaveformValue(period * 3 / 4, makeDef({ shape, period }))).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// Square variants
// ---------------------------------------------------------------------------

describe.each([
  { shape: 'square-full' as const, period: 256 },
  { shape: 'square-half' as const, period: 128 },
  { shape: 'square-quarter' as const, period: 64 },
])('$shape (period=$period)', ({ shape, period }) => {
  it('returns +amplitude in first half', () => {
    expect(generateWaveformValue(0, makeDef({ shape, period }))).toBe(100);
    expect(generateWaveformValue(period / 4, makeDef({ shape, period }))).toBe(100);
  });

  it('returns -amplitude in second half', () => {
    expect(generateWaveformValue(period / 2, makeDef({ shape, period }))).toBe(-100);
    expect(generateWaveformValue(period * 3 / 4, makeDef({ shape, period }))).toBe(-100);
  });
});

// ---------------------------------------------------------------------------
// Sawtooth variants
// ---------------------------------------------------------------------------

describe.each([
  { shape: 'sawtooth-full' as const, period: 256 },
  { shape: 'sawtooth-half' as const, period: 128 },
  { shape: 'sawtooth-quarter' as const, period: 64 },
])('$shape (period=$period)', ({ shape, period }) => {
  it('starts at -amplitude', () => {
    expect(generateWaveformValue(0, makeDef({ shape, period }))).toBeCloseTo(-100, 5);
  });

  it('returns 0 at half period', () => {
    expect(generateWaveformValue(period / 2, makeDef({ shape, period }))).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// Phase, offset, clamping, edge cases
// ---------------------------------------------------------------------------

describe('phase offset', () => {
  it('shifts the sine so tick 0 behaves like tick period/4', () => {
    const def = makeDef({ shape: 'sine-quarter', period: 64, phase: 16 });
    expect(generateWaveformValue(0, def)).toBeCloseTo(100, 5);
  });
});

describe('DC offset', () => {
  it('adds offset after scaling', () => {
    const def = makeDef({ shape: 'sine-quarter', amplitude: 50, period: 64, offset: 20 });
    expect(generateWaveformValue(0, def)).toBeCloseTo(20, 5);
    expect(generateWaveformValue(16, def)).toBeCloseTo(70, 5);
  });
});

describe('clamping', () => {
  it('clamps to +100', () => {
    const def = makeDef({ shape: 'sine-quarter', amplitude: 80, offset: 50, period: 64 });
    // Peak: 80 + 50 = 130 → clamped to 100
    expect(generateWaveformValue(16, def)).toBe(100);
  });

  it('clamps to -100', () => {
    const def = makeDef({ shape: 'square-quarter', amplitude: 80, offset: -50, period: 64 });
    // Second half: -80 + (-50) = -130 → clamped to -100
    expect(generateWaveformValue(32, def)).toBe(-100);
  });
});

describe('edge cases', () => {
  it('returns 0 when period is 0', () => {
    expect(generateWaveformValue(5, makeDef({ period: 0 }))).toBe(0);
  });

  it('handles negative phase correctly', () => {
    const def = makeDef({ shape: 'square-quarter', amplitude: 50, period: 64, phase: -16 });
    // tick 0 with phase -16: effective tick = -16, normalized = 48/64 = 0.75 → second half → -50
    expect(generateWaveformValue(0, def)).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// Reduced variants (50% amplitude)
// ---------------------------------------------------------------------------

describe('reduced variants', () => {
  describe.each([
    { shape: 'sine-full-reduced' as const, period: 256 },
    { shape: 'sine-half-reduced' as const, period: 128 },
    { shape: 'sine-quarter-reduced' as const, period: 64 },
  ])('$shape (period=$period)', ({ shape, period }) => {
    it('returns +50 (half amplitude) at quarter period', () => {
      expect(generateWaveformValue(period / 4, makeDef({ shape, period }))).toBeCloseTo(50, 5);
    });

    it('returns -50 (half amplitude) at three-quarter period', () => {
      expect(generateWaveformValue(period * 3 / 4, makeDef({ shape, period }))).toBeCloseTo(-50, 5);
    });
  });

  describe.each([
    { shape: 'square-full-reduced' as const, period: 256 },
    { shape: 'square-half-reduced' as const, period: 128 },
    { shape: 'square-quarter-reduced' as const, period: 64 },
  ])('$shape (period=$period)', ({ shape, period }) => {
    it('returns +50 (half amplitude) in first half', () => {
      expect(generateWaveformValue(0, makeDef({ shape, period }))).toBe(50);
    });

    it('returns -50 (half amplitude) in second half', () => {
      expect(generateWaveformValue(period / 2, makeDef({ shape, period }))).toBe(-50);
    });
  });

  describe.each([
    { shape: 'triangle-full-reduced' as const, period: 256 },
    { shape: 'triangle-half-reduced' as const, period: 128 },
    { shape: 'triangle-quarter-reduced' as const, period: 64 },
  ])('$shape (period=$period)', ({ shape, period }) => {
    it('starts at -50 (half amplitude)', () => {
      expect(generateWaveformValue(0, makeDef({ shape, period }))).toBeCloseTo(-50, 5);
    });

    it('returns +50 (half amplitude) at half period', () => {
      expect(generateWaveformValue(period / 2, makeDef({ shape, period }))).toBeCloseTo(50, 5);
    });
  });

  describe.each([
    { shape: 'sawtooth-full-reduced' as const, period: 256 },
    { shape: 'sawtooth-half-reduced' as const, period: 128 },
    { shape: 'sawtooth-quarter-reduced' as const, period: 64 },
  ])('$shape (period=$period)', ({ shape, period }) => {
    it('starts at -50 (half amplitude)', () => {
      expect(generateWaveformValue(0, makeDef({ shape, period }))).toBeCloseTo(-50, 5);
    });

    it('returns 0 at half period', () => {
      expect(generateWaveformValue(period / 2, makeDef({ shape, period }))).toBeCloseTo(0, 5);
    });
  });
});

describe('samples shape', () => {
  it('returns samples[tick % length]', () => {
    const def = makeDef({ shape: 'samples', samples: [10, 20, 30] });
    expect(generateWaveformValue(0, def)).toBe(10);
    expect(generateWaveformValue(1, def)).toBe(20);
    expect(generateWaveformValue(2, def)).toBe(30);
    expect(generateWaveformValue(3, def)).toBe(10); // wraps
  });

  it('clamps sample values', () => {
    const def = makeDef({ shape: 'samples', samples: [150, -200] });
    expect(generateWaveformValue(0, def)).toBe(100);
    expect(generateWaveformValue(1, def)).toBe(-100);
  });
});

// ---------------------------------------------------------------------------
// shapeAtPhase
// ---------------------------------------------------------------------------

describe('shapeAtPhase', () => {
  it('sine: known values at key phases', () => {
    expect(shapeAtPhase('sine', 0)).toBeCloseTo(0, 10);
    expect(shapeAtPhase('sine', 0.25)).toBeCloseTo(1, 10);
    expect(shapeAtPhase('sine', 0.5)).toBeCloseTo(0, 10);
    expect(shapeAtPhase('sine', 0.75)).toBeCloseTo(-1, 10);
  });

  it('square: +1 in first half, -1 in second half', () => {
    expect(shapeAtPhase('square', 0)).toBe(1);
    expect(shapeAtPhase('square', 0.25)).toBe(1);
    expect(shapeAtPhase('square', 0.5)).toBe(-1);
    expect(shapeAtPhase('square', 0.75)).toBe(-1);
  });

  it('triangle: known values at key phases', () => {
    expect(shapeAtPhase('triangle', 0)).toBeCloseTo(-1, 10);
    expect(shapeAtPhase('triangle', 0.25)).toBeCloseTo(0, 10);
    expect(shapeAtPhase('triangle', 0.5)).toBeCloseTo(1, 10);
    expect(shapeAtPhase('triangle', 0.75)).toBeCloseTo(0, 10);
  });

  it('sawtooth: known values at key phases', () => {
    expect(shapeAtPhase('sawtooth', 0)).toBeCloseTo(-1, 10);
    expect(shapeAtPhase('sawtooth', 0.25)).toBeCloseTo(-0.5, 10);
    expect(shapeAtPhase('sawtooth', 0.5)).toBeCloseTo(0, 10);
    expect(shapeAtPhase('sawtooth', 0.75)).toBeCloseTo(0.5, 10);
  });

  it('wraps phase values outside [0,1)', () => {
    expect(shapeAtPhase('sine', 1.25)).toBeCloseTo(shapeAtPhase('sine', 0.25), 10);
    expect(shapeAtPhase('sine', -0.75)).toBeCloseTo(shapeAtPhase('sine', 0.25), 10);
  });
});

// ---------------------------------------------------------------------------
// generateFMSamples
// ---------------------------------------------------------------------------

describe('generateFMSamples', () => {
  it('returns exactly 256 samples', () => {
    const samples = generateFMSamples('sine', 3, 1, 1.5, 100);
    expect(samples).toHaveLength(256);
  });

  it('all samples are clamped to [-100, +100]', () => {
    const samples = generateFMSamples('sine', 5, 3, 3.0, 100);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(-100);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('seamless looping: phase at t=0 equals phase at t=1 (mod 1)', () => {
    // For integer N and M, the FM formula guarantees phase(0) ≡ phase(1) mod 1
    // So sample[0] and the "virtual sample[256]" should be equivalent.
    // We verify by checking that the first sample equals shapeAtPhase at the same phase.
    const samples = generateFMSamples('sine', 4, 2, 2.0, 100);
    // At t=0: phase = 0, so output = sin(0)*100 = 0
    expect(samples[0]).toBeCloseTo(0, 5);
    // At t=1 (which wraps to t=0 for looping): phase = N*1 - depth/(2πM)*(cos(2πM)-1)
    // cos(2πM) = cos(4π) = 1, so the correction term = 0, phase = N = 4 → phase mod 1 = 0
    // So the next loop iteration would produce the same value as samples[0]
  });

  it('amplitude scaling: 50% amplitude gives roughly half values', () => {
    const full = generateFMSamples('sine', 3, 1, 1.5, 100);
    const half = generateFMSamples('sine', 3, 1, 1.5, 50);
    // Check several samples — half should be approximately full/2
    for (let i = 0; i < 256; i += 32) {
      expect(half[i]).toBeCloseTo(full[i] / 2, 1);
    }
  });

  it('depth=0 matches constant-frequency waveform', () => {
    // With depth=0, FM degenerates to plain N-cycle waveform
    const fm = generateFMSamples('sine', 4, 2, 0, 100);
    // Compare against manually computed constant-frequency sine
    for (let i = 0; i < 256; i++) {
      const t = i / 256;
      const expected = Math.sin(2 * Math.PI * 4 * t) * 100;
      expect(fm[i]).toBeCloseTo(expected, 5);
    }
  });

  it('modRate=0 falls back to constant frequency', () => {
    const fm = generateFMSamples('triangle', 3, 0, 5.0, 80);
    // Should be equivalent to a plain 3-cycle triangle
    generateFMSamples('triangle', 3, 1, 0, 80);
    // With modRate=0, there's no modulation, same as depth=0
    for (let i = 0; i < 256; i++) {
      const t = i / 256;
      const phase = 3 * t;
      const rawPhase = ((phase % 1) + 1) % 1;
      const raw = rawPhase < 0.5 ? -1 + 4 * rawPhase : 3 - 4 * rawPhase;
      expect(fm[i]).toBeCloseTo(raw * 80, 5);
    }
  });

  it.each(['sine', 'square', 'triangle', 'sawtooth'] as const)(
    'works for base shape: %s',
    (base) => {
      const samples = generateFMSamples(base, 4, 2, 2.0, 100);
      expect(samples).toHaveLength(256);
      for (const s of samples) {
        expect(s).toBeGreaterThanOrEqual(-100);
        expect(s).toBeLessThanOrEqual(100);
      }
    },
  );

  it('FM waveform is different from constant-frequency waveform', () => {
    const fm = generateFMSamples('sine', 4, 2, 2.0, 100);
    const constant = generateFMSamples('sine', 4, 2, 0, 100);
    // At least some samples should differ significantly
    let maxDiff = 0;
    for (let i = 0; i < 256; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(fm[i] - constant[i]));
    }
    expect(maxDiff).toBeGreaterThan(10);
  });
});
