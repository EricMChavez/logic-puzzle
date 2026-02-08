import { describe, it, expect } from 'vitest';
import { shifterNode } from './shifter';

describe('Shifter node', () => {
  const evaluate = (a: number, x: number) =>
    shifterNode.evaluate({
      inputs: [a, x],
      params: { shift: 0 },
      state: undefined,
      tickIndex: 0,
    });

  it('has correct metadata', () => {
    expect(shifterNode.type).toBe('shifter');
    expect(shifterNode.category).toBe('math');
    expect(shifterNode.inputs).toHaveLength(2);
    expect(shifterNode.outputs).toHaveLength(1);
    expect(shifterNode.size).toEqual({ width: 3, height: 3 });
  });

  it('has X input with bottom side override', () => {
    expect(shifterNode.inputs[1].name).toBe('X');
    expect(shifterNode.inputs[1].side).toBe('bottom');
  });

  it('adds A + X', () => {
    expect(evaluate(30, 20)).toEqual([50]);
    expect(evaluate(50, -25)).toEqual([25]);
    expect(evaluate(-40, 40)).toEqual([0]);
  });

  it('X=0 passes through', () => {
    expect(evaluate(50, 0)).toEqual([50]);
    expect(evaluate(-50, 0)).toEqual([-50]);
    expect(evaluate(0, 0)).toEqual([0]);
  });

  it('clamps positive overflow', () => {
    expect(evaluate(80, 50)).toEqual([100]);
    expect(evaluate(100, 100)).toEqual([100]);
    expect(evaluate(60, 60)).toEqual([100]);
  });

  it('clamps negative overflow', () => {
    expect(evaluate(-80, -50)).toEqual([-100]);
    expect(evaluate(-100, -100)).toEqual([-100]);
    expect(evaluate(-60, -60)).toEqual([-100]);
  });

  it('handles zero input', () => {
    expect(evaluate(0, 100)).toEqual([100]);
    expect(evaluate(0, -100)).toEqual([-100]);
    expect(evaluate(0, 50)).toEqual([50]);
  });

  it('handles all 9 knob positions', () => {
    const a = 40;
    expect(evaluate(a, -100)).toEqual([-60]);
    expect(evaluate(a, -75)).toEqual([-35]);
    expect(evaluate(a, -50)).toEqual([-10]);
    expect(evaluate(a, -25)).toEqual([15]);
    expect(evaluate(a, 0)).toEqual([40]);
    expect(evaluate(a, 25)).toEqual([65]);
    expect(evaluate(a, 50)).toEqual([90]);
    expect(evaluate(a, 75)).toEqual([100]); // clamped from 115
    expect(evaluate(a, 100)).toEqual([100]); // clamped from 140
  });

  it('has shift parameter with correct config', () => {
    expect(shifterNode.params).toHaveLength(1);
    const param = shifterNode.params![0];
    expect(param.key).toBe('shift');
    expect(param.default).toBe(0);
    expect(param.min).toBe(-100);
    expect(param.max).toBe(100);
    expect(param.step).toBe(25);
  });
});
