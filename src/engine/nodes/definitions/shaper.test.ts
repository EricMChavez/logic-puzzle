import { describe, it, expect } from 'vitest';
import { shaperNode, createShaperState } from './shaper';
import type { ShaperState } from './shaper';

describe('Shaper node', () => {
  const evaluate = (a: number, b: number, state?: ShaperState) => {
    const s = state ?? createShaperState();
    return {
      output: shaperNode.evaluate({
        inputs: [a, b],
        params: {},
        state: s,
        tickIndex: 0,
      }),
      state: s,
    };
  };

  describe('Smoother mode (B >= 0)', () => {
    it('passes through with B=0 (window size 1)', () => {
      const { output } = evaluate(75, 0);
      expect(output).toEqual([75]);
    });

    it('passes through with B=1 (window size 1)', () => {
      const { output } = evaluate(75, 1);
      expect(output).toEqual([75]);
    });

    it('averages last 2 samples with B=2', () => {
      const state = createShaperState();

      // First sample: 100
      evaluate(100, 2, state);
      // Second sample: 0 → average of [100, 0] = 50
      const { output } = evaluate(0, 2, state);
      expect(output).toEqual([50]);
    });

    it('averages last 3 samples with B=3', () => {
      const state = createShaperState();

      evaluate(60, 3, state); // [60]
      evaluate(30, 3, state); // [60, 30]
      const { output } = evaluate(0, 3, state); // [60, 30, 0] → 30
      expect(output).toEqual([30]);
    });

    it('clamps window size to 100 max', () => {
      const state = createShaperState();
      // Even with B > 100, window is capped at 100
      // Buffer starts as 100 zeros, so averaging 100 samples with one 50 = 50/100 = 0.5
      const { output } = evaluate(50, 150, state);
      expect(output[0]).toBeCloseTo(0.5);
    });

    it('smooths a changing signal', () => {
      const state = createShaperState();

      // Feed in 10 samples of value 100, then switch to -100
      for (let i = 0; i < 10; i++) {
        evaluate(100, 10, state);
      }

      // Now feed -100, averaging last 10: (9*100 + -100) / 10 = 80
      const { output } = evaluate(-100, 10, state);
      expect(output[0]).toBeCloseTo(80);
    });
  });

  describe('Polarizer mode (B < 0)', () => {
    it('passes through nearly linearly with B=-1 (exponent ~0.99)', () => {
      const { output } = evaluate(50, -1);
      // exponent = 1 - 0.01 = 0.99
      // 50^0.99 ≈ 48.8, scaled by 100
      expect(output[0]).toBeCloseTo(50, 0);
    });

    it('applies square root curve with B=-50 (exponent 0.5)', () => {
      // 50 normalized = 0.5, sqrt(0.5) ≈ 0.707, * 100 ≈ 70.7
      const { output } = evaluate(50, -50);
      expect(output[0]).toBeCloseTo(70.7, 0);
    });

    it('polarizes to extremes with B=-100 (exponent 0)', () => {
      // Any non-zero value^0 = 1, so output is ±100
      expect(evaluate(50, -100).output).toEqual([100]);
      expect(evaluate(1, -100).output).toEqual([100]);
      expect(evaluate(-50, -100).output).toEqual([-100]);
      expect(evaluate(-1, -100).output).toEqual([-100]);
    });

    it('returns zero for zero input', () => {
      expect(evaluate(0, -50).output).toEqual([0]);
      expect(evaluate(0, -100).output).toEqual([0]);
    });

    it('preserves sign', () => {
      const pos = evaluate(50, -50).output[0];
      const neg = evaluate(-50, -50).output[0];
      expect(pos).toBeGreaterThan(0);
      expect(neg).toBeLessThan(0);
      expect(Math.abs(pos)).toBeCloseTo(Math.abs(neg));
    });
  });

  describe('state management', () => {
    it('creates fresh state', () => {
      const state = createShaperState();
      expect(state.buffer).toHaveLength(100);
      expect(state.buffer.every((v) => v === 0)).toBe(true);
      expect(state.writeIndex).toBe(0);
    });

    it('maintains state across mode switches', () => {
      const state = createShaperState();

      // Build up smoother buffer: [100, 100]
      evaluate(100, 5, state);
      evaluate(100, 5, state);

      // Switch to polarizer - this also writes 50 to buffer: [100, 100, 50]
      const { output } = evaluate(50, -50, state);
      expect(output[0]).toBeCloseTo(70.7, 0);

      // Switch back to smoother - writes another 50: [100, 100, 50, 50]
      // Last 3 values: 100, 50, 50 → avg = 200/3 ≈ 66.67
      const { output: output2 } = evaluate(50, 3, state);
      expect(output2[0]).toBeCloseTo(66.67, 0);
    });
  });

  it('has correct metadata', () => {
    expect(shaperNode.type).toBe('shaper');
    expect(shaperNode.category).toBe('shaping');
    expect(shaperNode.inputs).toHaveLength(2);
    expect(shaperNode.outputs).toHaveLength(1);
    expect(shaperNode.size).toEqual({ width: 3, height: 2 });
    expect(shaperNode.createState).toBeDefined();
  });
});
