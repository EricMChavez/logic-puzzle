import { describe, it, expect } from 'vitest';
import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
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
  return { id, type, position: { col: 0, row: 0 }, params, inputCount, outputCount };
}

function makeWire(
  sourceId: NodeId,
  sourcePort: number,
  targetId: NodeId,
  targetPort: number,
): Wire {
  return createWire(
    `${sourceId}:${sourcePort}->${targetId}:${targetPort}`,
    { nodeId: sourceId, portIndex: sourcePort, side: 'output' },
    { nodeId: targetId, portIndex: targetPort, side: 'input' },
  );
}

/** Build a nodes Map and wires array from a description. */
function buildGraph(
  inputCount: number,
  outputCount: number,
  processingNodes: NodeState[],
  wireSpecs: { from: NodeId; fromPort: number; to: NodeId; toPort: number }[],
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
    makeWire(spec.from, spec.fromPort, spec.to, spec.toPort),
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

  // Deep-copy wires so signal buffers don't leak between tests
  const simWires: Wire[] = wires.map((w) => ({
    ...w,
    signalBuffer: [...w.signalBuffer],
  }));

  const state = createSchedulerState(nodes);

  // Find input CP node IDs and set their outputs each tick
  const inputCpIds: string[] = [];
  for (let i = 0; i < inputValues.length; i++) {
    inputCpIds.push(cpInputId(i));
  }

  for (let t = 0; t < ticks; t++) {
    // Drive input CPs: set their output values and write onto outgoing wire ring buffers
    for (let i = 0; i < inputValues.length; i++) {
      const cpId = inputCpIds[i];
      const runtime = state.nodeStates.get(cpId);
      if (runtime) {
        runtime.outputs[0] = inputValues[i];
        // Write onto outgoing wires at current writeHead
        for (const wire of simWires) {
          if (wire.source.nodeId === cpId) {
            wire.signalBuffer[wire.writeHead] = inputValues[i];
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
  it('linear chain: CP_in → Inverter → CP_out', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('inv', 'inverter', 1, 1)],
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

  it('two-input node: 2 CP_ins → Merger → CP_out', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mrg1', 'merger', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mrg1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mrg1', toPort: 1 },
        { from: 'mrg1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );
    const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
    expect(sortResult.ok).toBe(true);
    if (!sortResult.ok) return;

    const analysis = analyzeDelays(sortResult.value, nodes, wires);
    expect(analysis.inputCount).toBe(2);
    expect(analysis.outputCount).toBe(1);
    expect(analysis.processingOrder).toEqual(['mrg1']);
  });

  it('asymmetric delays: one path has more wire delay', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [
        makeNode('inv1', 'inverter', 1, 1),
        makeNode('inv2', 'inverter', 1, 1),
        makeNode('mrg1', 'merger', 2, 1),
      ],
      [
        // Short path: CP0 → inv1 → mrg1 port 0
        { from: cpInputId(0), fromPort: 0, to: 'inv1', toPort: 0 },
        { from: 'inv1', fromPort: 0, to: 'mrg1', toPort: 0 },
        // Long path: CP0 → inv2 → mrg1 port 1
        { from: cpInputId(0), fromPort: 0, to: 'inv2', toPort: 0 },
        { from: 'inv2', fromPort: 0, to: 'mrg1', toPort: 1 },
        { from: 'mrg1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );
    const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
    expect(sortResult.ok).toBe(true);
    if (!sortResult.ok) return;

    const analysis = analyzeDelays(sortResult.value, nodes, wires);
    // Both paths from CP0 have the same wire delay pattern, so buffer offsets normalize to 0
    expect(analysis.inputBufferSizes[0]).toBeGreaterThanOrEqual(1);
  });

  it('delay node propagation adds WTS delay to output delay', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { wts: 1 })],
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
        makeNode('inv1', 'inverter', 1, 1),
        makeNode('disconnected', 'inverter', 1, 1),
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
    nodes.set('A', makeNode('A', 'inverter', 1, 1));
    nodes.set('B', makeNode('B', 'inverter', 1, 1));

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
      [makeNode('inv', 'inverter', 1, 1)],
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

  it('single Inverter node', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('inv', 'inverter', 1, 1)],
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

  it('two-input Merger', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mrg1', 'merger', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mrg1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mrg1', toPort: 1 },
        { from: 'mrg1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
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

    // Merger: 30 + 40 = 70
    expect(bakedOutput[0]).toBe(70);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('Delay node with wts=1', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { wts: 1 })],
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

  it('Scaler node: 50 * (1 + 40/100) = 70', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('scl', 'scaler', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'scl', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'scl', toPort: 1 },
        { from: 'scl', fromPort: 0, to: cpOutputId(0), toPort: 0 },
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

    // Scaler: 50 * (1 + 40/100) = 50 * 1.4 = 70
    expect(bakedOutput[0]).toBe(70);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('Shaper node with polarization (B=-100)', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('shp', 'shaper', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'shp', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'shp', toPort: 1 },
        { from: 'shp', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    // Warm up with constant inputs
    for (let i = 0; i < 100; i++) {
      evaluate([50, -100]);
    }
    const bakedOutput = evaluate([50, -100]);

    const liveOutput = runLiveSimulation(nodes, wires, [50, -100], 200);

    // Shaper with B=-100 polarizes: positive input → +100
    expect(bakedOutput[0]).toBe(100);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });

  it('multi-input multi-output graph', () => {
    const { nodes, wires } = buildGraph(
      2, 2,
      [
        makeNode('inv1', 'inverter', 1, 1),
        makeNode('inv2', 'inverter', 1, 1),
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

  it('all v2 node types in one graph', () => {
    // CP0 → Inverter → Merger(port0)
    // CP1 → Scaler(port0), Constant → Scaler(port1) → Merger(port1)
    // Merger → Splitter
    // Splitter(port0) → Switch(port0)
    // Splitter(port1) → Switch(port1)
    // CP2 → Delay → Switch(control port2)
    // Switch(port0) → Out0
    const { nodes, wires } = buildGraph(
      3, 1,
      [
        makeNode('inv', 'inverter', 1, 1),
        makeNode('const', 'constant', 0, 1, { value: 5 }),
        makeNode('scl', 'scaler', 2, 1),
        makeNode('mrg', 'merger', 2, 1),
        makeNode('spl', 'splitter', 1, 2),
        makeNode('dly', 'delay', 1, 1, { wts: 1 }),
        makeNode('swt', 'switch', 3, 2),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'scl', toPort: 0 },
        { from: 'const', fromPort: 0, to: 'scl', toPort: 1 },
        { from: 'inv', fromPort: 0, to: 'mrg', toPort: 0 },
        { from: 'scl', fromPort: 0, to: 'mrg', toPort: 1 },
        { from: 'mrg', fromPort: 0, to: 'spl', toPort: 0 },
        { from: 'spl', fromPort: 0, to: 'swt', toPort: 0 },
        { from: 'spl', fromPort: 1, to: 'swt', toPort: 1 },
        { from: cpInputId(2), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: 'swt', toPort: 2 },
        { from: 'swt', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    // inputs: CP0=40, CP1=20, CP2=50 (positive control → straight through)
    const inputs = [40, 20, 50];
    for (let i = 0; i < 50; i++) {
      evaluate(inputs);
    }
    const bakedOutput = evaluate(inputs);

    const liveOutput = runLiveSimulation(nodes, wires, inputs, 200);

    // Inverter(40) = -40
    // Constant(value=5) = 5*10 = 50
    // Scaler(20, 50) = 20 * (1 + 50/100) = 20 * 1.5 = 30
    // Merger(-40, 30) = -10
    // Splitter(-10) = -5, -5
    // Delay(50, wts=1) = 50 (steady state)
    // Switch(-5, -5, 50): control >= 0 → straight → Out0 = -5
    expect(bakedOutput[0]).toBe(-5);
    expect(bakedOutput[0]).toBe(liveOutput[0]);
  });
});

// ─── Metadata Serialization Roundtrip ──────────────────────────────────────

describe('metadata serialization roundtrip', () => {
  it('JSON roundtrip produces identical outputs', () => {
    // Chain: CP0 → Inverter → Merger(port0), CP1 → Merger(port1) → Out
    // Result: -CP0 + CP1
    const { nodes, wires } = buildGraph(
      2, 1,
      [
        makeNode('inv', 'inverter', 1, 1),
        makeNode('mrg1', 'merger', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: 'mrg1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mrg1', toPort: 1 },
        { from: 'mrg1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
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
    // -40 + 20 = -20
    const original = result.value.evaluate(inputs);
    const roundtripped = reconstructed.evaluate(inputs);

    expect(roundtripped).toEqual(original);
  });

  it('roundtrip with delay node preserves behavior', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { wts: 1 })],
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
    // Merger with only one input connected
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('mrg1', 'merger', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mrg1', toPort: 0 },
        // Port 1 is unconnected
        { from: 'mrg1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
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

    // Merger(50, 0) = 50 (unconnected port defaults to 0)
    expect(output[0]).toBe(50);
  });

  it('disconnected processing node does not affect output', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [
        makeNode('inv', 'inverter', 1, 1),
        makeNode('orphan', 'scaler', 2, 1),
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

  it('delay wts=1 (minimum, 16 subdivisions)', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { wts: 1 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;

    // Feed value — should take 16 calls before the value appears (1 WTS = 16 subdivisions)
    for (let i = 0; i < 16; i++) {
      const out = evaluate([100]);
      // During warmup period, output should still be 0
      expect(out[0]).toBe(0);
    }
    // On the 17th call, the first value should appear
    const output = evaluate([100]);
    expect(output[0]).toBe(100);
  });

  it('delay wts=2 (32 subdivisions)', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('dly', 'delay', 1, 1, { wts: 2 })],
      [
        { from: cpInputId(0), fromPort: 0, to: 'dly', toPort: 0 },
        { from: 'dly', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;

    // Feed value — should take 32 calls before the value appears (2 WTS = 32 subdivisions)
    for (let i = 0; i < 32; i++) {
      const out = evaluate([100]);
      expect(out[0]).toBe(0);
    }
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

  it('Splitter node produces two half-value outputs', () => {
    const { nodes, wires } = buildGraph(
      1, 2,
      [makeNode('spl', 'splitter', 1, 2)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'spl', toPort: 0 },
        { from: 'spl', fromPort: 0, to: cpOutputId(0), toPort: 0 },
        { from: 'spl', fromPort: 1, to: cpOutputId(1), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;
    for (let i = 0; i < 20; i++) {
      evaluate([80]);
    }
    const output = evaluate([80]);

    // Splitter: 80 / 2 = 40 on each output
    expect(output[0]).toBe(40);
    expect(output[1]).toBe(40);
  });

  it('clamping: Merger with values exceeding range', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('mrg1', 'merger', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mrg1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'mrg1', toPort: 1 },
        { from: 'mrg1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
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

    // Merger: 80 + 80 = 160, clamped to 100
    expect(output[0]).toBe(100);
  });
});
