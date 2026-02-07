import { describe, it, expect } from 'vitest';
import { delayNode, createDelayState } from './delay';
import type { DelayState } from './delay';

describe('Delay node', () => {
  const evaluate = (
    input: number,
    wts: number,
    state?: DelayState,
  ) => {
    const s = state ?? createDelayState();
    return {
      output: delayNode.evaluate({
        inputs: [input],
        params: { wts },
        state: s,
        tickIndex: 0,
      }),
      state: s,
    };
  };

  describe('minimum delay (1 WTS = 16 subdivisions)', () => {
    it('delays by 16 subdivisions with wts=1', () => {
      const state = createDelayState();

      // First 16 inputs should output 0 (buffer initialized to 0)
      for (let i = 0; i < 16; i++) {
        expect(evaluate(100, 1, state).output).toEqual([0]);
      }
      // 17th input: should get the first value back
      expect(evaluate(50, 1, state).output).toEqual([100]);
    });
  });

  describe('delayed output', () => {
    it('delays by 2 WTS (32 subdivisions)', () => {
      const state = createDelayState();

      // Feed values with wts=2 (32 subdivisions delay)
      for (let i = 0; i < 32; i++) {
        expect(evaluate(100, 2, state).output).toEqual([0]);
      }
      // After 32 ticks, should get the first value back
      expect(evaluate(50, 2, state).output).toEqual([100]);
    });

    it('delays by 4 WTS (64 subdivisions)', () => {
      const state = createDelayState();

      // Feed values with wts=4 (64 subdivisions delay)
      for (let i = 0; i < 64; i++) {
        expect(evaluate(100, 4, state).output).toEqual([0]);
      }
      expect(evaluate(50, 4, state).output).toEqual([100]);
    });

    it('delays by max 8 WTS (128 subdivisions)', () => {
      const state = createDelayState();

      // Feed 128 zeros, then a value
      for (let i = 0; i < 128; i++) {
        evaluate(0, 8, state);
      }

      // Now feed 100, should still get 0 (delayed by 128)
      expect(evaluate(100, 8, state).output).toEqual([0]);

      // Feed 127 more values
      for (let i = 0; i < 127; i++) {
        evaluate(0, 8, state);
      }

      // Now should get the 100
      expect(evaluate(0, 8, state).output).toEqual([100]);
    });
  });

  describe('parameter handling', () => {
    it('clamps wts to 1 minimum', () => {
      const state = createDelayState();
      // wts=0 should be treated as 1 (16 subdivisions)
      for (let i = 0; i < 16; i++) {
        expect(evaluate(100, 0, state).output).toEqual([0]);
      }
      expect(evaluate(50, 0, state).output).toEqual([100]);
    });

    it('clamps wts to 8 maximum', () => {
      const state = createDelayState();
      // wts=10 should be capped at 8 (128 subdivisions)
      // Just verify it doesn't crash and respects the cap
      const result = evaluate(100, 10, state);
      expect(result.output).toEqual([0]);
    });

    it('rounds fractional wts', () => {
      const state = createDelayState();

      // wts=1.4 rounds to 1 (16 subdivisions)
      for (let i = 0; i < 16; i++) {
        evaluate(100, 1.4, state);
      }
      expect(evaluate(50, 1.4, state).output).toEqual([100]);
    });
  });

  describe('state management', () => {
    it('creates fresh state', () => {
      const state = createDelayState();
      expect(state.buffer).toHaveLength(129); // 128 + 1
      expect(state.buffer.every((v) => v === 0)).toBe(true);
      expect(state.writeIndex).toBe(0);
    });

    it('wraps buffer correctly', () => {
      const state = createDelayState();

      // Fill buffer and wrap around multiple times with wts=1 (16 subdivisions)
      for (let i = 0; i < 50; i++) {
        evaluate(i, 1, state);
      }

      // Output should be input from 16 ticks ago
      expect(evaluate(100, 1, state).output).toEqual([34]);
    });
  });

  it('has correct metadata', () => {
    expect(delayNode.type).toBe('delay');
    expect(delayNode.category).toBe('timing');
    expect(delayNode.inputs).toHaveLength(1);
    expect(delayNode.outputs).toHaveLength(1);
    expect(delayNode.size).toEqual({ width: 2, height: 2 });
    expect(delayNode.createState).toBeDefined();
    expect(delayNode.params).toHaveLength(1);
    expect(delayNode.params![0]).toMatchObject({
      key: 'wts',
      type: 'number',
      default: 1,
      min: 1,
      max: 8,
    });
  });
});
