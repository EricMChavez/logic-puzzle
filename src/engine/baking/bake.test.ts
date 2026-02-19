import { describe, it, expect } from 'vitest';
import type { ChipId, ChipState, Path } from '../../shared/types/index.ts';
import { createPath } from '../../shared/types/index.ts';
import { bakeGraph, reconstructFromMetadata } from './bake.ts';
import {
  cpInputId,
  cpOutputId,
  createConnectionPointNode,
} from '../../puzzle/connection-point-nodes.ts';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeChip(
  id: ChipId,
  type: string,
  socketCount: number,
  plugCount: number,
  params: Record<string, number | string> = {},
): ChipState {
  return { id, type, position: { col: 0, row: 0 }, params, socketCount, plugCount };
}

function makePath(
  sourceId: ChipId,
  sourcePort: number,
  targetId: ChipId,
  targetPort: number,
): Path {
  return createPath(
    `${sourceId}:${sourcePort}->${targetId}:${targetPort}`,
    { chipId: sourceId, portIndex: sourcePort, side: 'plug' },
    { chipId: targetId, portIndex: targetPort, side: 'socket' },
  );
}

/** Build a chips Map and paths array from a description. */
function buildGraph(
  socketCount: number,
  plugCount: number,
  processingChips: ChipState[],
  pathSpecs: { from: ChipId; fromPort: number; to: ChipId; toPort: number }[],
) {
  const chips = new Map<ChipId, ChipState>();

  for (let i = 0; i < socketCount; i++) {
    const cp = createConnectionPointNode('input', i);
    chips.set(cp.id, cp);
  }

  for (let i = 0; i < plugCount; i++) {
    const cp = createConnectionPointNode('output', i);
    chips.set(cp.id, cp);
  }

  for (const chip of processingChips) {
    chips.set(chip.id, chip);
  }

  const paths = pathSpecs.map((spec) =>
    makePath(spec.from, spec.fromPort, spec.to, spec.toPort),
  );

  return { chips, paths };
}

// ─── bakeGraph ─────────────────────────────────────────────────────────────

describe('bakeGraph', () => {
  it('returns err for cyclic graphs', () => {
    const chips = new Map<ChipId, ChipState>();
    chips.set('A', makeChip('A', 'offset', 2, 1));
    chips.set('B', makeChip('B', 'offset', 2, 1));

    const paths = [
      makePath('A', 0, 'B', 0),
      makePath('B', 0, 'A', 0),
    ];

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Cycle');
    }
  });

  it('returns ok for valid graphs', () => {
    const { chips, paths } = buildGraph(
      1, 1,
      [makeChip('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.evaluate).toBe('function');
      expect(result.value.metadata).toBeDefined();
    }
  });

  it('handles direct CP-to-CP pass-through', () => {
    const { chips, paths } = buildGraph(
      1, 1,
      [],
      [
        { from: cpInputId(0), fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
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
    const { chips, paths } = buildGraph(
      1, 1,
      [],
      [{ from: cpInputId(0), fromPort: 0, to: cpOutputId(0), toPort: 0 }],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([75]);
    expect(output[0]).toBe(75);
  });

  it('single Add node as passthrough (A + 0 = A)', () => {
    const { chips, paths } = buildGraph(
      1, 1,
      [makeChip('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Add with unconnected X: A + 0 = A (passthrough)
    const output = result.value.evaluate([60]);
    expect(output[0]).toBe(60);
  });

  it('two-input Add', () => {
    const { chips, paths } = buildGraph(
      2, 1,
      [makeChip('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add1', toPort: 1 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([30, 40]);
    expect(output[0]).toBe(70);
  });

  it('Memory node: outputs 0 on first cycle, then echoes previous input', () => {
    const { chips, paths } = buildGraph(
      1, 1,
      [makeChip('mem', 'memory', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mem', toPort: 0 },
        { from: 'mem', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
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
    const { chips, paths } = buildGraph(
      2, 1,
      [makeChip('scl1', 'scale', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'scl1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'scl1', toPort: 1 },
        { from: 'scl1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([80, 50]);
    expect(output[0]).toBe(40);
  });

  it('Threshold node: 50 >= 0 saturates to +100', () => {
    const { chips, paths } = buildGraph(
      2, 1,
      [makeChip('thr', 'threshold', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'thr', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'thr', toPort: 1 },
        { from: 'thr', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Threshold(50, 0): 50 >= 0 → +100
    const output = result.value.evaluate([50, 0]);
    expect(output[0]).toBe(100);
  });

  it('multi-input multi-output graph with Add passthroughs', () => {
    const { chips, paths } = buildGraph(
      2, 2,
      [
        makeChip('add1', 'offset', 2, 1),
        makeChip('add2', 'offset', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add2', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
        { from: 'add2', fromPort: 0, to: cpOutputId(1), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
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
    const { chips, paths } = buildGraph(
      3, 1,
      [
        makeChip('scl', 'scale', 2, 1),
        makeChip('add1', 'offset', 2, 1),
        makeChip('thr', 'threshold', 2, 1),
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

    const result = bakeGraph(chips, paths);
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
    const { chips, paths } = buildGraph(
      2, 1,
      [
        makeChip('add1', 'offset', 2, 1),
        makeChip('add2', 'offset', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: 'add2', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add2', toPort: 1 },
        { from: 'add2', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
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
    const { chips, paths } = buildGraph(
      1, 1,
      [makeChip('mem', 'memory', 1, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'mem', toPort: 0 },
        { from: 'mem', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
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
    const { chips, paths } = buildGraph(
      1, 1,
      [makeChip('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([50]);
    expect(output[0]).toBe(50);
  });

  it('disconnected processing node does not affect output', () => {
    const { chips, paths } = buildGraph(
      1, 1,
      [
        makeChip('add1', 'offset', 2, 1),
        makeChip('orphan', 'scale', 2, 1),
      ],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Add passthrough: 42 + 0 = 42; orphan scale doesn't affect output
    const output = result.value.evaluate([42]);
    expect(output[0]).toBe(42);
  });

  it('empty graph with no nodes produces empty output', () => {
    const chips = new Map<ChipId, ChipState>();
    const paths: Path[] = [];

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([]);
    expect(output).toEqual([]);
  });

  it('Duplicate node produces two identical outputs', () => {
    const { chips, paths } = buildGraph(
      1, 2,
      [makeChip('spl', 'duplicate', 1, 2)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'spl', toPort: 0 },
        { from: 'spl', fromPort: 0, to: cpOutputId(0), toPort: 0 },
        { from: 'spl', fromPort: 1, to: cpOutputId(1), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([80]);
    // Duplicate(80) = [80, 80]
    expect(output[0]).toBe(80);
    expect(output[1]).toBe(80);
  });

  it('clamping: Add with values exceeding range', () => {
    const { chips, paths } = buildGraph(
      2, 1,
      [makeChip('add1', 'offset', 2, 1)],
      [
        { from: cpInputId(0), fromPort: 0, to: 'add1', toPort: 0 },
        { from: cpInputId(1), fromPort: 0, to: 'add1', toPort: 1 },
        { from: 'add1', fromPort: 0, to: cpOutputId(0), toPort: 0 },
      ],
    );

    const result = bakeGraph(chips, paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = result.value.evaluate([80, 80]);
    // Add: 80 + 80 = 160, clamped to 100
    expect(output[0]).toBe(100);
  });
});
