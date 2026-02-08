import { describe, it, expect } from 'vitest';
import { mixerNode } from './mixer';

describe('Mixer node', () => {
  const evaluate = (a: number, b: number, x: number) =>
    mixerNode.evaluate({
      inputs: [a, b, x],
      params: { mix: 0 },
      state: undefined,
      tickIndex: 0,
    });

  it('has correct metadata', () => {
    expect(mixerNode.type).toBe('mixer');
    expect(mixerNode.category).toBe('routing');
    expect(mixerNode.inputs).toHaveLength(3);
    expect(mixerNode.outputs).toHaveLength(1);
    expect(mixerNode.size).toEqual({ width: 3, height: 3 });
  });

  it('has X input with bottom side override', () => {
    expect(mixerNode.inputs[2].name).toBe('X');
    expect(mixerNode.inputs[2].side).toBe('bottom');
  });

  it('X=+100 outputs 100% A', () => {
    expect(evaluate(80, 20, 100)).toEqual([80]);
  });

  it('X=-100 outputs 100% B', () => {
    expect(evaluate(80, 20, -100)).toEqual([20]);
  });

  it('X=0 outputs 50/50 mix', () => {
    // t = (0+100)/200 = 0.5
    // output = 80*0.5 + 20*0.5 = 50
    expect(evaluate(80, 20, 0)).toEqual([50]);
  });

  it('crossfades at all 9 knob positions', () => {
    const a = 100;
    const b = -100;
    // X=-100: t=0, out = 100*0 + (-100)*1 = -100
    expect(evaluate(a, b, -100)).toEqual([-100]);
    // X=-75: t=0.125, out = 100*0.125 + (-100)*0.875 = 12.5 - 87.5 = -75
    expect(evaluate(a, b, -75)).toEqual([-75]);
    // X=-50: t=0.25, out = 25 - 75 = -50
    expect(evaluate(a, b, -50)).toEqual([-50]);
    // X=-25: t=0.375, out = 37.5 - 62.5 = -25
    expect(evaluate(a, b, -25)).toEqual([-25]);
    // X=0: t=0.5, out = 50 - 50 = 0
    expect(evaluate(a, b, 0)).toEqual([0]);
    // X=25: t=0.625, out = 62.5 - 37.5 = 25
    expect(evaluate(a, b, 25)).toEqual([25]);
    // X=50: t=0.75, out = 75 - 25 = 50
    expect(evaluate(a, b, 50)).toEqual([50]);
    // X=75: t=0.875, out = 87.5 - 12.5 = 75
    expect(evaluate(a, b, 75)).toEqual([75]);
    // X=100: t=1, out = 100 - 0 = 100
    expect(evaluate(a, b, 100)).toEqual([100]);
  });

  it('outputs zero when both inputs are zero', () => {
    expect(evaluate(0, 0, -100)).toEqual([0]);
    expect(evaluate(0, 0, 0)).toEqual([0]);
    expect(evaluate(0, 0, 100)).toEqual([0]);
  });

  it('clamps positive overflow', () => {
    // A=100, B=100, X=0: t=0.5, out = 100*0.5+100*0.5 = 100 (no overflow)
    expect(evaluate(100, 100, 0)).toEqual([100]);
    // A=100, B=50, X=50: t=0.75, out = 100*0.75+50*0.25 = 87.5
    expect(evaluate(100, 50, 50)).toEqual([87.5]);
  });

  it('clamps negative overflow', () => {
    expect(evaluate(-100, -100, 0)).toEqual([-100]);
  });

  it('handles unconnected X (defaults to 0)', () => {
    // When X is unconnected it defaults to 0, giving 50/50 mix
    expect(evaluate(60, 40, 0)).toEqual([50]);
  });

  it('has mix parameter with correct config', () => {
    expect(mixerNode.params).toHaveLength(1);
    const param = mixerNode.params![0];
    expect(param.key).toBe('mix');
    expect(param.default).toBe(0);
    expect(param.min).toBe(-100);
    expect(param.max).toBe(100);
    expect(param.step).toBe(25);
  });
});
