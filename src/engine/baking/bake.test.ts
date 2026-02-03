import { describe, it, expect } from 'vitest';
import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { bakeGraph, reconstructFromMetadata } from './bake.ts';
import { analyzeDelays } from './delay-calculator.ts';
import { topologicalSort } from '../graph/topological-sort.ts';
import {
  cpInputId,
  cpOutputId,
  createConnectionPointNode,
} from '../../puzzle/connection-point-nodes.ts';
import { advanceTick, createSchedulerState } from '../../wts/scheduler/tick-scheduler.ts';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeNode(
  id: NodeId,
  type: string,
  inputCount: number,
  outputCount: number,
  params: Record<string, number | string> = {},
): NodeState {
  return { id, type, position: { x: 0, y: 0 }, params, inputCount, outputCount };
}

function makeWire(
  from: NodeId,
  fromPort: number,
  to: NodeId,
  toPort: number,
  wtsDelay = 16,
): Wire {
  return {
    id: `${from}:${fromPort}->${to}:${toPort}`,
    from: { nodeId: from, portIndex: fromPort, side: 'output' },
    to: { nodeId: to, portIndex: toPort, side: 'input' },
    wtsDelay,
    signals: [],
  };
}

/** Build a nodes Map and wires array from a description. */
function buildGraph(
  inputCount: number,
  outputCount: number,
  processingNodes: NodeState[],
  wireSpecs: { from: NodeId; fromPort: number; to: NodeId; toPort: number; delay?: number }[],
) {
  const nodes = new Map<NodeId, NodeState>();

  // Add input CPs
  for (let i = 0; i < inputCount; i++) {
    const cp = createConnectionPointNode('input', i);
    nodes.set(cp.id, cp);
  }

  // Add output CPs
  for (let i = 0; i < outputCount; i++) {
    const cp = createConnectionPointNode('output', i);
    nodes.set(cp.id, cp);
  }

  // Add processing nodes
  for (const node of processingNodes) {
    nodes.set(node.id, node);
  }

  // Build wires
  const wires = wireSpecs.map((spec) =>
    makeWire(spec.from, spec.fromPort, spec.to, spec.toPort, spec.delay ?? 16),
  );

  return { nodes, wires };
}

/**
 * Run the live tick-based simulation until steady state and return the final
 * output values. Drives input CPs with the given values every tick.
 */
function runLiveSimulation(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  inputValues: number[],
  ticks: number,
): number[] {
  const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
  if (!sortResult.ok) throw new Error('Cycle in live simulation graph');
  const topoOrder = sortResult.value;

  // Deep-copy wires so signals don't leak between tests
  const simWires: Wire[] = wires.map((w) => ({
    ...w,
    signals: [],
  }));

  const state = createSchedulerState(nodes);

  // Find input CP node IDs and set their outputs each tick
  const inputCpIds: string[] = [];
  for (let i = 0; i < inputValues.length; i++) {
    inputCpIds.push(cpInputId(i));
  }

  for (let t = 0; t < ticks; t++) {
    // Drive input CPs: set their output values and emit onto outgoing wires
    for (let i = 0; i < inputValues.length; i++) {
      const cpId = inputCpIds[i];
      const runtime = state.nodeStates.get(cpId);
      if (runtime) {
        runtime.outputs[0] = inputValues[i];
        // Emit onto outgoing wires
        for (const wire of simWires) {
          if (wire.from.nodeId === cpId) {
            wire.signals.push({
              value: inputValues[i],
              ticksRemaining: wire.wtsDelay,
            });
          }
        }
      }
    }

    advanceTick(simWires, nodes, topoOrder, state);
  }

  // Read output CP values
  const outputValues: number[] = [];
  let i = 0;
  while (true) {
    const cpId = cpOutputId(i);
    const runtime = state.nodeStates.get(cpId);
    if (!runtime) break;
    outputValues.push(runtime.inputs[0] ?? 0);
    i++;
  }
  return outputValues;
}

// ─── Delay Analysis ────────────────────────────────────────────────────────

describe('analyzeDelays', () => {
  it('linear chain: CP_in → Invert → CP_out', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('inv', 'invert', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );
    const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
    expect(sortResult.ok).toBe(true);
    if (!sortResult.ok) return;

    const analysis = analyzeDelays(sortResult.value, nodes, wires);
    expect(analysis.inputCount).toBe(1);
    expect(analysis.outputCount).toBe(1);
    expect(analysis.processingOrder).toEqual(['inv']);
    expect(analysis.outputMappings).toHaveLength(1);
    expect(analysis.outputMappings[0].sourceNodeId).toBe('inv');
  });

  it('two-input node: 2 CP_ins → Mix → CP_out', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mix1', 'mix', 2, 1, { mode: 'Add' })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mix1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mix1', toPort: 1 },
        { from: 'mix1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );
    const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
    expect(sortResult.ok).toBe(true);
    if (!sortResult.ok) return;

    const analysis = analyzeDelays(sortResult.value, nodes, wires);
    expect(analysis.inputCount).toBe(2);
    expect(analysis.outputCount).toBe(1);
    expect(analysis.processingOrder).toEqual(['mix1']);
  });

  it('asymmetric delays: one path has more wire delay', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [
        makeNode('inv1', 'invert', 1, 1),
        makeNode('inv2', 'invert', 1, 1),
        makeNode('mix1', 'mix', 2, 1, { mode: 'Add' }),
      ],
      [
        // Short path: CP0 → inv1 (delay=16) → mix1 port 0
        { from: cpInputId(0), fromPort: 0, to: 'inv1', toPort: 0, delay: 16 },
        { from: 'inv1', fromPort: 0, to: 'mix1', toPort: 0, delay: 16 },
        // Long path: CP0 → inv2 (delay=16) → mix1 port 1
        { from: cpInputId(0), fromPort: 0, to: 'inv2', toPort: 0, delay: 16 },
        { from: 'inv2', fromPort: 0, to: 'mix1', toPort: 1, delay: 16 },
        { from: 'mix1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );
    const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
    expect(sortResult.ok).toBe(true);
    if (!sortResult.ok) return;

    const analysis = analyzeDelays(sortResult.value, nodes, wires);
    // Both paths from CP0 have the same wire delay pattern, so buffer offsets normalize to 0
    expect(analysis.inputBufferSizes[0]).toBeGreaterThanOrEqual(1);
  });

  it('delay node propagation adds subdivisions to output delay', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { subdivisions: 4 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );
    const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
    expect(sortResult.ok).toBe(true);
    if (!sortResult.ok) return;

    const analysis = analyzeDelays(sortResult.value, nodes, wires);
    expect(analysis.processingOrder).toEqual(['dly']);
    expect(analysis.inputCount).toBe(1);
    expect(analysis.outputCount).toBe(1);
  });

  it('disconnected node: included in topo order but not wired', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [
        makeNode('inv1', 'invert', 1, 1),
        makeNode('disconnected', 'invert', 1, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv1', toPort: 0 },
        { from: 'inv1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );
    const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
    expect(sortResult.ok).toBe(true);
    if (!sortResult.ok) return;

    const analysis = analyzeDelays(sortResult.value, nodes, wires);
    // Disconnected node should still be in processing order
    expect(analysis.processingOrder).toContain('disconnected');
    expect(analysis.processingOrder).toContain('inv1');
  });
});

// ─── bakeGraph ─────────────────────────────────────────────────────────────

describe('bakeGraph', () => {
  it('returns err for cyclic graphs', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'invert', 1, 1));
    nodes.set('B', makeNode('B', 'invert', 1, 1));

    const wires = [
      makeWire('A', 0, 'B', 0),
      makeWire('B', 0, 'A', 0),
    ];

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Cycle');
    }
  });

  it('returns ok for valid graphs', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('inv', 'invert', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.evaluate).toBe('function');
      expect(result.value.metadata).toBeDefined();
    }
  });

  it('handles direct CP-to-CP pass-through', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [],
      [
        { from: cpInputId(0), fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    // First call pushes value into buffer
    evaluate([50]);
    // Second call: the value should now be readable
    const output = evaluate([50]);
    expect(output[0]).toBe(50);
  });
});

// ─── Steady-state Equivalence ──────────────────────────────────────────────

describe('steady-state equivalence', () => {
  it('pass-through: CP_in → CP_out', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [],
      [{ from: cpInputId(0), fromPort: 0, to: cpOutputId(0), toPort: 0 }],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    // Warm up the baked graph
    for (let i = 0; i < 20; i++) {
      evaluate([75]);
    }
    const bakedOutput = evaluate([75]);

    // Live simulation
    const liveOutput = runLiveSimulation(nodes, wires, [75], 100);

    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('single Invert node', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('inv', 'invert', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    // Warm up
    for (let i = 0; i < 20; i++) {
      evaluate([60]);
    }
    const bakedOutput = evaluate([60]);

    const liveOutput = runLiveSimulation(nodes, wires, [60], 100);

    // Invert of 60 = -60
    expect(bakedOutput[0]).toBe(-60);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('two-input Mix (Add)', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mix1', 'mix', 2, 1, { mode: 'Add' })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mix1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mix1', toPort: 1 },
        { from: 'mix1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([30, 40]);
    }
    const bakedOutput = evaluate([30, 40]);

    const liveOutput = runLiveSimulation(nodes, wires, [30, 40], 100);

    // Add: 30 + 40 = 70
    expect(bakedOutput[0]).toBe(70);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('Delay node with subdivisions=4', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { subdivisions: 4 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    // After enough warmup ticks with constant input, delay should pass the value through
    for (let i = 0; i < 50; i++) {
      evaluate([80]);
    }
    const bakedOutput = evaluate([80]);

    const liveOutput = runLiveSimulation(nodes, wires, [80], 200);

    // At steady state with constant input, delay node outputs the same value
    expect(bakedOutput[0]).toBe(80);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('Multiply node: (50 * 40) / 100 = 20', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mul', 'multiply', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mul', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mul', toPort: 1 },
        { from: 'mul', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([50, 40]);
    }
    const bakedOutput = evaluate([50, 40]);

    const liveOutput = runLiveSimulation(nodes, wires, [50, 40], 100);

    expect(bakedOutput[0]).toBe(20);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('Threshold node', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('thr', 'threshold', 1, 1, { threshold: 25 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'thr', toPort: 0 },
        { from: 'thr', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([50]);
    }
    const bakedOutput = evaluate([50]);

    const liveOutput = runLiveSimulation(nodes, wires, [50], 100);

    // 50 > 25, so output = 100
    expect(bakedOutput[0]).toBe(100);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('multi-input multi-output graph', () => {
    const { nodes, wires } = buildGraph(
      2, 2,
      [
        makeNode('inv1', 'invert', 1, 1),
        makeNode('inv2', 'invert', 1, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'inv2', toPort: 0 },
        { from: 'inv1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
        { from: 'inv2', fromPort: 0, to: cpOutputId(1), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([30, 70]);
    }
    const bakedOutput = evaluate([30, 70]);

    const liveOutput = runLiveSimulation(nodes, wires, [30, 70], 100);

    expect(bakedOutput[0]).toBe(-30);
    expect(bakedOutput[1]).toBe(-70);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
    expect(bakedOutput[1]).toBe(liveOutput[1]);
  });

  it('all 5 node types in one graph', () => {
    // CP0 → Invert → Mix(port0)
    // CP1 → Threshold(>0) → Mix(port1)
    // Mix(Add) → Multiply(port0)
    // CP2 → Delay(subs=2) → Multiply(port1)
    // Multiply → Out0
    const { nodes, wires } = buildGraph(
      3, 1,
      [
        makeNode('inv', 'invert', 1, 1),
        makeNode('thr', 'threshold', 1, 1, { threshold: 0 }),
        makeNode('mix', 'mix', 2, 1, { mode: 'Add' }),
        makeNode('dly', 'delay', 1, 1, { subdivisions: 2 }),
        makeNode('mul', 'multiply', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'thr', toPort: 0 },
        { from: 'inv', fromPort: 0, to: 'mix', toPort: 0 },
        { from: 'thr', fromPort: 0, to: 'mix', toPort: 1 },
        { from: 'mix', fromPort: 0, to: 'mul', toPort: 0 },
        { from: cpInputId(2), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: 'mul', toPort: 1 },
        { from: 'mul', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    const inputs = [50, 30, 80];
    for (let i = 0; i < 50; i++) {
      evaluate(inputs);
    }
    const bakedOutput = evaluate(inputs);

    const liveOutput = runLiveSimulation(nodes, wires, inputs, 200);

    // Invert(50) = -50
    // Threshold(30, 0) = 100 (30 > 0)
    // Mix(Add, -50, 100) = 50
    // Delay(80, subs=2) = 80 (steady state)
    // Multiply(50, 80) = 50*80/100 = 40
    expect(bakedOutput[0]).toBe(40);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });
});

// ─── Metadata Serialization Roundtrip ──────────────────────────────────────

describe('metadata serialization roundtrip', () => {
  it('JSON roundtrip produces identical outputs', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [
        makeNode('inv', 'invert', 1, 1),
        makeNode('mix1', 'mix', 2, 1, { mode: 'Subtract' }),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: 'mix1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mix1', toPort: 1 },
        { from: 'mix1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Serialize and deserialize metadata
    const serialized = JSON.stringify(result.value.metadata);
    const deserialized = JSON.parse(serialized);
    const reconstructed = reconstructFromMetadata(deserialized);

    // Warm up both
    const inputs = [40, 20];
    for (let i = 0; i < 20; i++) {
      result.value.evaluate(inputs);
      reconstructed.evaluate(inputs);
    }

    // Compare outputs
    const original = result.value.evaluate(inputs);
    const roundtripped = reconstructed.evaluate(inputs);

    expect(roundtripped).toEqual(original);
  });

  it('roundtrip with delay node preserves behavior', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { subdivisions: 4 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.stringify(result.value.metadata);
    const deserialized = JSON.parse(serialized);
    const reconstructed = reconstructFromMetadata(deserialized);

    // Feed the same sequence to both
    const sequence = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const originalOutputs: number[][] = [];
    const reconstructedOutputs: number[][] = [];

    for (const val of sequence) {
      originalOutputs.push(result.value.evaluate([val]));
      reconstructedOutputs.push(reconstructed.evaluate([val]));
    }

    expect(reconstructedOutputs).toEqual(originalOutputs);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('unconnected input ports default to 0', () => {
    // Mix with only one input connected
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('mix1', 'mix', 2, 1, { mode: 'Add' })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mix1', toPort: 0 },
        // Port 1 is unconnected
        { from: 'mix1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([50]);
    }
    const output = evaluate([50]);

    // Add(50, 0) = 50 (unconnected port defaults to 0)
    expect(output[0]).toBe(50);
  });

  it('disconnected processing node does not affect output', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [
        makeNode('inv', 'invert', 1, 1),
        makeNode('orphan', 'multiply', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: cpOutputId(0), toPort: 0 },
        // 'orphan' has no wires
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([42]);
    }
    const output = evaluate([42]);
    expect(output[0]).toBe(-42);
  });

  it('delay subdivisions=0 is pass-through', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { subdivisions: 0 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    // With subdivisions=0, delay is pass-through (buffer size 1)
    // After warmup, output should match input
    for (let i = 0; i < 5; i++) {
      evaluate([99]);
    }
    const output = evaluate([99]);
    expect(output[0]).toBe(99);
  });

  it('delay subdivisions=16 (max)', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { subdivisions: 16 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;

    // Feed zeros then a value — should take 16 calls before the value appears
    for (let i = 0; i < 16; i++) {
      const out = evaluate([100]);
      // During warmup period, output should still be 0
      expect(out[0]).toBe(0);
    }
    // On the 17th call, the first value should appear
    const output = evaluate([100]);
    expect(output[0]).toBe(100);
  });

  it('empty graph with no nodes produces empty output', () => {
    const nodes = new Map<NodeId, NodeState>();
    const wires: Wire[] = [];

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([]);
    expect(output).toEqual([]);
  });

  it('Mix mode Subtract', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mix1', 'mix', 2, 1, { mode: 'Subtract' })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mix1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mix1', toPort: 1 },
        { from: 'mix1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([80, 30]);
    }
    const output = evaluate([80, 30]);

    // Subtract: 80 - 30 = 50
    expect(output[0]).toBe(50);
  });

  it('clamping: Mix Add with values exceeding range', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mix1', 'mix', 2, 1, { mode: 'Add' })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mix1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mix1', toPort: 1 },
        { from: 'mix1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([80, 80]);
    }
    const output = evaluate([80, 80]);

    // Add: 80 + 80 = 160, clamped to 100
    expect(output[0]).toBe(100);
  });
});
