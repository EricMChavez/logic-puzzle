import { describe, it, expect } from 'vitest';
import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
import { bakeGraph, reconstructFromMetadata } from './bake.ts';
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

/** Build a nodes Map and wires array from a description. */
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

// ─── bakeGraph ─────────────────────────────────────────────────────────────

describe('bakeGraph', () => {
  it('returns err for cyclic graphs', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'offset', 2, 1));
    nodes.set('B', makeNode('B', 'offset', 2, 1));

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
      [makeNode('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
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
    // Cycle-based: output appears on first call
    const output = evaluate([50]);
    expect(output[0]).toBe(50);
  });
});

// ─── Cycle-Based Evaluation ───────────────────────────────────────────────

describe('cycle-based evaluation', () => {
  it('pass-through: CP_in → CP_out', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [],
      [{ from: cpInputId(0), fromPort: 0, to: cpOutputId(0), toPort: 0 }],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([75]);
    expect(output[0]).toBe(75);
  });

  it('single Add node as passthrough (A + 0 = A)', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Add with unconnected X: A + 0 = A (passthrough)
    const output = result.value.evaluate([60]);
    expect(output[0]).toBe(60);
  });

  it('two-input Add', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add1', toPort: 1 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([30, 40]);
    expect(output[0]).toBe(70);
  });

  it('Memory node: outputs 0 on first cycle, then echoes previous input', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('mem', 'memory', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mem', toPort: 0 },
        { from: 'mem', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { evaluate } = result.value;

    // Cycle 0: Memory outputs previousValue (0)
    expect(evaluate([80])[0]).toBe(0);
    // Cycle 1: Memory outputs previous input (80)
    expect(evaluate([50])[0]).toBe(80);
    // Cycle 2: Memory outputs previous input (50)
    expect(evaluate([30])[0]).toBe(50);
  });

  it('Scale node: 80 * 50 / 100 = 40', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('scl1', 'scale', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'scl1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'scl1', toPort: 1 },
        { from: 'scl1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([80, 50]);
    expect(output[0]).toBe(40);
  });

  it('Threshold node: 50 >= 0 saturates to +100', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('thr', 'threshold', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'thr', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'thr', toPort: 1 },
        { from: 'thr', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Threshold(50, 0): 50 >= 0 → +100
    const output = result.value.evaluate([50, 0]);
    expect(output[0]).toBe(100);
  });

  it('multi-input multi-output graph with Add passthroughs', () => {
    const { nodes, wires } = buildGraph(
      2, 2,
      [
        makeNode('add1', 'offset', 2, 1),
        makeNode('add2', 'offset', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add2', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
        { from: 'add2', fromPort: 0, to: cpOutputId(1), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Add with unconnected X is passthrough: A + 0 = A
    const output = result.value.evaluate([30, 70]);
    expect(output[0]).toBe(30);
    expect(output[1]).toBe(70);
  });

  it('all node types in one graph', () => {
    // CP0 → Scale(port0), CP1 → Scale(port1) → Add(port0)
    // CP2 → Add(port1)
    // Add → Threshold(port0), constant 0 → Threshold(port1) → Out0
    const { nodes, wires } = buildGraph(
      3, 1,
      [
        makeNode('scl', 'scale', 2, 1),
        makeNode('add1', 'offset', 2, 1),
        makeNode('thr', 'threshold', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'scl', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'scl', toPort: 1 },
        { from: 'scl', fromPort: 0, to: 'add1', toPort: 0 },
        { from: cpInputId(2), fromPort: 0, to: 'add1', toPort: 1 },
        { from: 'add1', fromPort: 0, to: 'thr', toPort: 0 },
        { from: 'thr', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // inputs: CP0=40, CP1=50, CP2=10
    const output = result.value.evaluate([40, 50, 10]);

    // Scale(40, 50) = 40 * 50 / 100 = 20
    // Add(20, 10) = 30
    // Threshold(30, 0): 30 >= 0 → +100 (X unconnected = 0)
    expect(output[0]).toBe(100);
  });
});

// ─── Metadata Serialization Roundtrip ──────────────────────────────────────

describe('metadata serialization roundtrip', () => {
  it('JSON roundtrip produces identical outputs', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [
        makeNode('add1', 'offset', 2, 1),
        makeNode('add2', 'offset', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: 'add2', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add2', toPort: 1 },
        { from: 'add2', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.stringify(result.value.metadata);
    const deserialized = JSON.parse(serialized);
    const reconstructed = reconstructFromMetadata(deserialized);

    const inputs = [40, 20];
    // Add1(40, 0) = 40 (passthrough), Add2(40, 20) = 60
    const original = result.value.evaluate(inputs);
    const roundtripped = reconstructed.evaluate(inputs);

    expect(roundtripped).toEqual(original);
    expect(original[0]).toBe(60);
  });

  it('roundtrip with memory node preserves behavior', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('mem', 'memory', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mem', toPort: 0 },
        { from: 'mem', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.stringify(result.value.metadata);
    const deserialized = JSON.parse(serialized);
    const reconstructed = reconstructFromMetadata(deserialized);

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
    const { nodes, wires } = buildGraph(
      1, 1,
      [makeNode('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([50]);
    expect(output[0]).toBe(50);
  });

  it('disconnected processing node does not affect output', () => {
    const { nodes, wires } = buildGraph(
      1, 1,
      [
        makeNode('add1', 'offset', 2, 1),
        makeNode('orphan', 'scale', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Add passthrough: 42 + 0 = 42; orphan scale doesn't affect output
    const output = result.value.evaluate([42]);
    expect(output[0]).toBe(42);
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

  it('Split node produces two identical outputs', () => {
    const { nodes, wires } = buildGraph(
      1, 2,
      [makeNode('spl', 'split', 1, 2)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'spl', toPort: 0 },
        { from: 'spl', fromPort: 0, to: cpOutputId(0), toPort: 0 },
        { from: 'spl', fromPort: 1, to: cpOutputId(1), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([80]);
    // Split(80) = [80, 80]
    expect(output[0]).toBe(80);
    expect(output[1]).toBe(80);
  });

  it('clamping: Add with values exceeding range', () => {
    const { nodes, wires } = buildGraph(
      2, 1,
      [makeNode('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add1', toPort: 1 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(nodes, wires);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([80, 80]);
    // Add: 80 + 80 = 160, clamped to 100
    expect(output[0]).toBe(100);
  });
});
