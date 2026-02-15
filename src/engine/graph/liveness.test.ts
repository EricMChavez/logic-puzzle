import { describe, it, expect } from 'vitest';
import { computeLiveNodes } from './liveness.ts';
import { createWire } from '../../shared/types/index.ts';
import type { Wire, NodeId } from '../../shared/types/index.ts';

/** Helper to create a minimal wire between two nodes */
function wire(sourceId: NodeId, targetId: NodeId, id?: string): Wire {
  return createWire(
    id ?? `${sourceId}->${targetId}`,
    { chipId: sourceId, portIndex: 0, side: 'output' },
    { chipId: targetId, portIndex: 0, side: 'input' },
  );
}

describe('computeLiveNodes', () => {
  it('returns empty set for empty graph', () => {
    const result = computeLiveNodes([], new Set());
    expect(result.size).toBe(0);
  });

  it('returns only sources when no wires exist', () => {
    const result = computeLiveNodes([], new Set(['src1', 'src2']));
    expect(result).toEqual(new Set(['src1', 'src2']));
  });

  it('linear chain: source → A → B → C — all live', () => {
    const wires = [wire('src', 'A'), wire('A', 'B'), wire('B', 'C')];
    const result = computeLiveNodes(wires, new Set(['src']));
    expect(result).toEqual(new Set(['src', 'A', 'B', 'C']));
  });

  it('disconnected island: source → A, isolated B → C — only source + A live', () => {
    const wires = [wire('src', 'A'), wire('B', 'C')];
    const result = computeLiveNodes(wires, new Set(['src']));
    expect(result).toEqual(new Set(['src', 'A']));
    expect(result.has('B')).toBe(false);
    expect(result.has('C')).toBe(false);
  });

  it('diamond: source → A, source → B, A → C, B → C — all live', () => {
    const wires = [
      wire('src', 'A', 'w1'),
      wire('src', 'B', 'w2'),
      wire('A', 'C', 'w3'),
      wire('B', 'C', 'w4'),
    ];
    const result = computeLiveNodes(wires, new Set(['src']));
    expect(result).toEqual(new Set(['src', 'A', 'B', 'C']));
  });

  it('no sources: empty source set — none live', () => {
    const wires = [wire('A', 'B'), wire('B', 'C')];
    const result = computeLiveNodes(wires, new Set());
    expect(result.size).toBe(0);
  });

  it('multiple sources reach different branches', () => {
    const wires = [wire('src1', 'A'), wire('src2', 'B')];
    const result = computeLiveNodes(wires, new Set(['src1', 'src2']));
    expect(result).toEqual(new Set(['src1', 'src2', 'A', 'B']));
  });

  it('parameter wire from live source makes target live', () => {
    // Simulates a knob wire: src → A (signal), A → B (parameter wire to knob port)
    const wires = [
      wire('src', 'A', 'signal-wire'),
      createWire('param-wire',
        { chipId: 'A', portIndex: 0, side: 'output' },
        { chipId: 'B', portIndex: 1, side: 'input' }, // knob port
      ),
    ];
    const result = computeLiveNodes(wires, new Set(['src']));
    expect(result).toEqual(new Set(['src', 'A', 'B']));
  });

  it('partially connected graph: some nodes live, some not', () => {
    const wires = [
      wire('src', 'A'),
      wire('A', 'B'),
      wire('X', 'Y'), // disconnected
      wire('Y', 'Z'), // disconnected
    ];
    const result = computeLiveNodes(wires, new Set(['src']));
    expect(result).toEqual(new Set(['src', 'A', 'B']));
    expect(result.has('X')).toBe(false);
    expect(result.has('Y')).toBe(false);
    expect(result.has('Z')).toBe(false);
  });
});
