import { describe, it, expect } from 'vitest';
import { thresholdChip } from './threshold';

describe('Threshold node', () => {
  const evaluate = (a: number, x: number) =>
    thresholdChip.evaluate({
      inputs: [a, x],
      params: { level: 0 },
      state: undefined,
      tickIndex: 0,
    });

  it('has correct metadata', () => {
    expect(thresholdChip.type).toBe('threshold');
    expect(thresholdChip.category).toBe('math');
    expect(thresholdChip.sockets).toHaveLength(2);
    expect(thresholdChip.plugs).toHaveLength(1);
    expect(thresholdChip.size).toEqual({ width: 4, height: 3 });
  });

  it('has X input with bottom side override and knob', () => {
    expect(thresholdChip.sockets[1].name).toBe('X');
    expect(thresholdChip.sockets[1].side).toBe('bottom');
    expect(thresholdChip.sockets[1].knob).toBe('level');
  });

  it('outputs +100 when signal is above threshold', () => {
    expect(evaluate(50, 0)).toEqual([100]);
    expect(evaluate(100, 50)).toEqual([100]);
    expect(evaluate(1, 0)).toEqual([100]);
  });

  it('outputs -100 when signal is below threshold', () => {
    expect(evaluate(-50, 0)).toEqual([-100]);
    expect(evaluate(0, 50)).toEqual([-100]);
    expect(evaluate(-1, 0)).toEqual([-100]);
  });

  it('outputs +100 when signal equals threshold (>=)', () => {
    expect(evaluate(0, 0)).toEqual([100]);
    expect(evaluate(50, 50)).toEqual([100]);
    expect(evaluate(-100, -100)).toEqual([100]);
    expect(evaluate(100, 100)).toEqual([100]);
  });

  it('handles different threshold values', () => {
    // Threshold at 50
    expect(evaluate(60, 50)).toEqual([100]);
    expect(evaluate(49, 50)).toEqual([-100]);

    // Threshold at -50
    expect(evaluate(-49, -50)).toEqual([100]);
    expect(evaluate(-51, -50)).toEqual([-100]);
  });

  it('handles boundary values', () => {
    expect(evaluate(100, -100)).toEqual([100]);
    expect(evaluate(-100, 100)).toEqual([-100]);
    expect(evaluate(-100, -100)).toEqual([100]);
    expect(evaluate(100, 100)).toEqual([100]);
  });

  it('has level parameter with correct config', () => {
    expect(thresholdChip.params).toHaveLength(1);
    const param = thresholdChip.params![0];
    expect(param.key).toBe('level');
    expect(param.default).toBe(0);
    expect(param.min).toBe(-100);
    expect(param.max).toBe(100);
    expect(param.step).toBe(25);
  });
});
