import { describe, it, expect } from 'vitest';
import { computeWireAnimationCache } from './wire-animation';
import type { CycleResults } from '../../engine/evaluation/index';
import type { Wire } from '../../shared/types/index';

function makeWire(
  id: string,
  sourceNodeId: string,
  sourcePort: number,
  targetNodeId: string,
  targetPort: number,
): Wire {
  return {
    id,
    source: { nodeId: sourceNodeId, portIndex: sourcePort, side: 'output' },
    target: { nodeId: targetNodeId, portIndex: targetPort, side: 'input' },
    path: [],
  };
}

function makeCycleResults(
  processingOrder: string[],
  wireValues?: Map<string, number[]>,
): CycleResults {
  return {
    outputValues: [],
    wireValues: wireValues ?? new Map(),
    nodeOutputs: new Map(),
    crossCycleState: new Map(),
    processingOrder,
  };
}

describe('computeWireAnimationCache', () => {
  it('returns empty timings for empty graph', () => {
    const cache = computeWireAnimationCache(
      [],
      new Map(),
      makeCycleResults([]),
      0,
    );
    expect(cache.timings.size).toBe(0);
  });

  it('linear chain: phases monotonically increase', () => {
    // input_cp -> nodeA -> nodeB -> output_cp
    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'nodeA', 0),
      makeWire('w2', 'nodeA', 0, 'nodeB', 0),
      makeWire('w3', 'nodeB', 0, '__cp_output_0__', 0),
    ];
    const results = makeCycleResults(['nodeA', 'nodeB']);

    const cache = computeWireAnimationCache(wires, new Map(), results, 0);

    const t1 = cache.timings.get('w1')!;
    const t2 = cache.timings.get('w2')!;
    const t3 = cache.timings.get('w3')!;

    // w1: CP source → nodeA
    expect(t1.departPhase).toBe(0);
    expect(t1.arrivePhase).toBeCloseTo(1 / 3); // (0+1)/3

    // w2: nodeA → nodeB
    expect(t2.departPhase).toBeCloseTo(1 / 3); // (0+1)/3
    expect(t2.arrivePhase).toBeCloseTo(2 / 3); // (1+1)/3

    // w3: nodeB → output CP
    expect(t3.departPhase).toBeCloseTo(2 / 3); // (1+1)/3
    expect(t3.arrivePhase).toBe(1);

    // Monotonically increasing
    expect(t1.departPhase).toBeLessThan(t1.arrivePhase);
    expect(t2.departPhase).toBeLessThan(t2.arrivePhase);
    expect(t3.departPhase).toBeLessThan(t3.arrivePhase);
    expect(t1.arrivePhase).toBeLessThanOrEqual(t2.departPhase);
    expect(t2.arrivePhase).toBeLessThanOrEqual(t3.departPhase);
  });

  it('input CP wires: departPhase = 0', () => {
    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'nodeA', 0),
    ];
    const results = makeCycleResults(['nodeA']);
    const cache = computeWireAnimationCache(wires, new Map(), results, 0);
    expect(cache.timings.get('w1')!.departPhase).toBe(0);
  });

  it('output CP wires: arrivePhase = 1', () => {
    const wires: Wire[] = [
      makeWire('w1', 'nodeA', 0, '__cp_output_0__', 0),
    ];
    const results = makeCycleResults(['nodeA']);
    const cache = computeWireAnimationCache(wires, new Map(), results, 0);
    expect(cache.timings.get('w1')!.arrivePhase).toBe(1);
  });

  it('direct CP-to-CP wire: full range', () => {
    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, '__cp_output_0__', 0),
    ];
    const results = makeCycleResults([]);
    const cache = computeWireAnimationCache(wires, new Map(), results, 0);
    const t = cache.timings.get('w1')!;
    expect(t.departPhase).toBe(0);
    expect(t.arrivePhase).toBe(1);
  });

  it('cross-cycle feedback: arrivePhase wraps to 1', () => {
    // nodeB is earlier in topo order than nodeA but wire goes nodeA → nodeB
    // This can happen with parameter wires — simulate by manually ordering
    // processingOrder: [nodeB, nodeA] with wire from nodeA → nodeB
    const wires: Wire[] = [
      makeWire('w1', 'nodeA', 0, 'nodeB', 0),
    ];
    const results = makeCycleResults(['nodeB', 'nodeA']);
    const cache = computeWireAnimationCache(wires, new Map(), results, 0);
    const t = cache.timings.get('w1')!;

    // nodeA depart: (1+1)/3 = 2/3
    // nodeB arrive: (0+1)/3 = 1/3 — but 1/3 <= 2/3, so wraps to 1
    expect(t.departPhase).toBeCloseTo(2 / 3);
    expect(t.arrivePhase).toBe(1);
  });

  it('reads signal value from wireValues at playpoint', () => {
    const wireValues = new Map<string, number[]>();
    wireValues.set('w1', [10, 20, 30, 40]);

    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'nodeA', 0),
    ];
    const results = makeCycleResults(['nodeA'], wireValues);

    const cache = computeWireAnimationCache(wires, new Map(), results, 2);
    expect(cache.timings.get('w1')!.signalValue).toBe(30);
  });

  it('signal value defaults to 0 when wire not in wireValues', () => {
    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'nodeA', 0),
    ];
    const results = makeCycleResults(['nodeA']);
    const cache = computeWireAnimationCache(wires, new Map(), results, 0);
    expect(cache.timings.get('w1')!.signalValue).toBe(0);
  });

  it('creative slot CPs are treated as connection points', () => {
    const wires: Wire[] = [
      makeWire('w1', '__cp_creative_0__', 0, 'nodeA', 0),
      makeWire('w2', 'nodeA', 0, '__cp_creative_3__', 0),
    ];
    const results = makeCycleResults(['nodeA']);
    const cache = computeWireAnimationCache(wires, new Map(), results, 0);

    // Creative input CP → depart at 0
    expect(cache.timings.get('w1')!.departPhase).toBe(0);
    // Creative output CP → arrive at 1
    expect(cache.timings.get('w2')!.arrivePhase).toBe(1);
  });
});
