import { describe, it, expect } from 'vitest';
import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
import { createSchedulerState, advanceTick } from './tick-scheduler.ts';
import { bakeGraph, reconstructFromMetadata } from '../../engine/baking/index.ts';
import { topologicalSort } from '../../engine/graph/topological-sort.ts';
import {
  cpInputId,
  cpOutputId,
  createConnectionPointNode,
} from '../../puzzle/connection-point-nodes.ts';

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

function buildGraph(
  inputCount: number,
  outputCount: number,
  processingNodes: NodeState[],
  wireSpecs: { from: NodeId; fromPort: number; to: NodeId; toPort: number }[],
) {
  const nodes = new Map<NodeId, NodeState>();
  for (let i = 0; i < inputCount; i++) {
    const cp = createConnectionPointNode('input', i);
    nodes.set(cp.id, cp);
  }
  for (let i = 0; i < outputCount; i++) {
    const cp = createConnectionPointNode('output', i);
    nodes.set(cp.id, cp);
  }
  for (const node of processingNodes) {
    nodes.set(node.id, node);
  }
  const wires = wireSpecs.map((spec) =>
    makeWire(spec.from, spec.fromPort, spec.to, spec.toPort),
  );
  return { nodes, wires };
}

/** Bake a simple graph and return its metadata for use as a puzzle node. */
function bakePuzzleMetadata(
  inputCount: number,
  outputCount: number,
  processingNodes: NodeState[],
  wireSpecs: { from: NodeId; fromPort: number; to: NodeId; toPort: number }[],
) {
  const { nodes, wires } = buildGraph(inputCount, outputCount, processingNodes, wireSpecs);
  const result = bakeGraph(nodes, wires);
  if (!result.ok) throw new Error('Failed to bake graph for test');
  return result.value.metadata;
}

/**
 * Run a simulation with a puzzle node embedded in the graph.
 * Drives input CPs with given values for N ticks and returns output CP values.
 */
function runSimulationWithPuzzleNode(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  puzzleNodeClosures: Map<string, (inputs: number[]) => number[]>,
  inputValues: number[],
  ticks: number,
): number[] {
  const sortResult = topologicalSort(Array.from(nodes.keys()), wires);
  if (!sortResult.ok) throw new Error('Cycle in test graph');
  const topoOrder = sortResult.value;

  const simWires: Wire[] = wires.map((w) => ({ ...w, signalBuffer: [...w.signalBuffer] }));
  const state = createSchedulerState(nodes);

  // Attach baked closures to puzzle node runtime states
  for (const [nodeId, node] of nodes) {
    if (node.type.startsWith('puzzle:')) {
      const runtime = state.nodeStates.get(nodeId);
      const closure = puzzleNodeClosures.get(nodeId);
      if (runtime && closure) {
        runtime.bakedEvaluate = closure;
      }
    }
  }

  const inputCpIds: string[] = [];
  for (let i = 0; i < inputValues.length; i++) {
    inputCpIds.push(cpInputId(i));
  }

  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < inputValues.length; i++) {
      const cpId = inputCpIds[i];
      const runtime = state.nodeStates.get(cpId);
      if (runtime) {
        runtime.outputs[0] = inputValues[i];
        for (const wire of simWires) {
          if (wire.source.nodeId === cpId) {
            wire.signalBuffer[wire.writeHead] = inputValues[i];
          }
        }
      }
    }
    advanceTick(simWires, nodes, topoOrder, state);
  }

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

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('puzzle node evaluation in simulation', () => {
  it('puzzle node with baked Inverter graph negates input', () => {
    // Bake an Inverter puzzle: CP_in → Inverter → CP_out
    const metadata = bakePuzzleMetadata(
      1, 1,
      [makeNode('inv', 'inverter', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    // Build a gameboard graph: CP_in → PuzzleNode → CP_out
    const puzzleNode = makeNode('pz1', 'puzzle:test-inverter', 1, 1);
    const { nodes, wires } = buildGraph(
      1, 1,
      [puzzleNode],
      [
        { from: cpInputId(0), fromPort: 0, to: 'pz1', toPort: 0 },
        { from: 'pz1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const { evaluate } = reconstructFromMetadata(metadata);
    const closures = new Map<string, (inputs: number[]) => number[]>();
    closures.set('pz1', evaluate);

    const output = runSimulationWithPuzzleNode(nodes, wires, closures, [60], 100);
    expect(output[0]).toBe(-60);
  });

  it('puzzle node with baked Shifter graph sums two inputs', () => {
    // Bake a Shifter puzzle: 2 CP_ins → Shifter → CP_out
    const metadata = bakePuzzleMetadata(
      2, 1,
      [makeNode('shft1', 'shifter', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'shft1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'shft1', toPort: 1 },
        { from: 'shft1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    // Build gameboard: CP_in0, CP_in1 → PuzzleNode(2 in, 1 out) → CP_out
    const puzzleNode = makeNode('pz1', 'puzzle:test-shifter', 2, 1);
    const { nodes, wires } = buildGraph(
      2, 1,
      [puzzleNode],
      [
        { from: cpInputId(0), fromPort: 0, to: 'pz1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'pz1', toPort: 1 },
        { from: 'pz1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const { evaluate } = reconstructFromMetadata(metadata);
    const closures = new Map<string, (inputs: number[]) => number[]>();
    closures.set('pz1', evaluate);

    const output = runSimulationWithPuzzleNode(nodes, wires, closures, [30, 40], 100);
    expect(output[0]).toBe(70);
  });

  it('puzzle node chained with fundamental node', () => {
    // Bake an Inverter puzzle
    const metadata = bakePuzzleMetadata(
      1, 1,
      [makeNode('inv', 'inverter', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    // Gameboard: CP_in → PuzzleInvert → FundamentalInverter → CP_out
    // Double invert should produce the original value
    const puzzleNode = makeNode('pz1', 'puzzle:test-inverter', 1, 1);
    const invertNode = makeNode('inv2', 'inverter', 1, 1);
    const { nodes, wires } = buildGraph(
      1, 1,
      [puzzleNode, invertNode],
      [
        { from: cpInputId(0), fromPort: 0, to: 'pz1', toPort: 0 },
        { from: 'pz1', fromPort: 0, to: 'inv2', toPort: 0 },
        { from: 'inv2', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const { evaluate } = reconstructFromMetadata(metadata);
    const closures = new Map<string, (inputs: number[]) => number[]>();
    closures.set('pz1', evaluate);

    const output = runSimulationWithPuzzleNode(nodes, wires, closures, [50], 100);
    // Invert(Invert(50)) = 50
    expect(output[0]).toBe(50);
  });

  it('puzzle node without bakedEvaluate produces zeros', () => {
    // Puzzle node with no closure attached — outputs should stay 0
    const puzzleNode = makeNode('pz1', 'puzzle:missing', 1, 1);
    const { nodes, wires } = buildGraph(
      1, 1,
      [puzzleNode],
      [
        { from: cpInputId(0), fromPort: 0, to: 'pz1', toPort: 0 },
        { from: 'pz1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    // No closures attached
    const closures = new Map<string, (inputs: number[]) => number[]>();
    const output = runSimulationWithPuzzleNode(nodes, wires, closures, [50], 100);
    expect(output[0]).toBe(0);
  });

  it('multiple puzzle nodes in same graph', () => {
    // Bake Inverter and Amp puzzles
    const invertMeta = bakePuzzleMetadata(
      1, 1,
      [makeNode('inv', 'inverter', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'inv', toPort: 0 },
        { from: 'inv', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    // Amp puzzle: CP_in0 signal, CP_in1 gain → Amp → CP_out
    const ampMeta = bakePuzzleMetadata(
      2, 1,
      [makeNode('amp1', 'amp', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'amp1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'amp1', toPort: 1 },
        { from: 'amp1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    // Gameboard: CP_in0 → PuzzleInvert → PuzzleAmp(port0), CP_in1 → PuzzleAmp(port1) → CP_out
    // Invert(50) = -50, Amp(-50, 100) = -50 * (1 + 100/100) = -50 * 2 = -100
    const pzInvert = makeNode('pzInv', 'puzzle:test-inverter', 1, 1);
    const pzAmp = makeNode('pzAmp', 'puzzle:test-amp', 2, 1);
    const { nodes, wires } = buildGraph(
      2, 1,
      [pzInvert, pzAmp],
      [
        { from: cpInputId(0), fromPort: 0, to: 'pzInv', toPort: 0 },
        { from: 'pzInv', fromPort: 0, to: 'pzAmp', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'pzAmp', toPort: 1 },
        { from: 'pzAmp', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const closures = new Map<string, (inputs: number[]) => number[]>();
    closures.set('pzInv', reconstructFromMetadata(invertMeta).evaluate);
    closures.set('pzAmp', reconstructFromMetadata(ampMeta).evaluate);

    const output = runSimulationWithPuzzleNode(nodes, wires, closures, [50, 100], 100);
    // Invert(50) = -50, Amp(-50, 100) = -50 * 2 = -100
    expect(output[0]).toBe(-100);
  });
});
