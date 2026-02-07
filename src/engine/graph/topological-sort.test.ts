import { describe, it, expect } from 'vitest';
import { topologicalSort } from './topological-sort.ts';
import { createWire } from '../../shared/types/index.ts';
import type { Wire, NodeId } from '../../shared/types/index.ts';

/** Helper to create a minimal wire between two nodes */
function wire(sourceId: NodeId, targetId: NodeId): Wire {
  return createWire(
    `${sourceId}->${targetId}`,
    { nodeId: sourceId, portIndex: 0, side: 'output' },
    { nodeId: targetId, portIndex: 0, side: 'input' },
  );
}

/** Check that `a` appears before `b` in the sorted order */
function assertBefore(sorted: NodeId[], a: NodeId, b: NodeId) {
  const ia = sorted.indexOf(a);
  const ib = sorted.indexOf(b);
  expect(ia).not.toBe(-1);
  expect(ib).not.toBe(-1);
  expect(ia).toBeLessThan(ib);
}

describe('topologicalSort', () => {
  it('handles a single node with no edges', () => {
    const result = topologicalSort(['A'], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['A']);
    }
  });

  it('handles an empty graph', () => {
    const result = topologicalSort([], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('sorts a linear chain: A → B → C', () => {
    const result = topologicalSort(
      ['A', 'B', 'C'],
      [wire('A', 'B'), wire('B', 'C')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['A', 'B', 'C']);
    }
  });

  it('sorts a diamond merge: A → B, A → C, B → D, C → D', () => {
    const result = topologicalSort(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'B'), wire('A', 'C'), wire('B', 'D'), wire('C', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      assertBefore(result.value, 'A', 'B');
      assertBefore(result.value, 'A', 'C');
      assertBefore(result.value, 'B', 'D');
      assertBefore(result.value, 'C', 'D');
      expect(result.value).toHaveLength(4);
    }
  });

  it('sorts parallel paths: A → C, B → D (independent)', () => {
    const result = topologicalSort(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'C'), wire('B', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      assertBefore(result.value, 'A', 'C');
      assertBefore(result.value, 'B', 'D');
      expect(result.value).toHaveLength(4);
    }
  });

  it('includes disconnected nodes with no edges', () => {
    const result = topologicalSort(
      ['A', 'B', 'C'],
      [wire('A', 'B')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      assertBefore(result.value, 'A', 'B');
      expect(result.value).toContain('C');
      expect(result.value).toHaveLength(3);
    }
  });

  it('handles multiple disconnected components', () => {
    const result = topologicalSort(
      ['A', 'B', 'C', 'D', 'E'],
      [wire('A', 'B'), wire('C', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      assertBefore(result.value, 'A', 'B');
      assertBefore(result.value, 'C', 'D');
      expect(result.value).toContain('E');
      expect(result.value).toHaveLength(5);
    }
  });

  it('detects a simple cycle: A → B → A', () => {
    const result = topologicalSort(
      ['A', 'B'],
      [wire('A', 'B'), wire('B', 'A')],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath.length).toBeGreaterThanOrEqual(2);
      expect(result.error.message).toContain('Cycle detected');
    }
  });

  it('detects a 3-node cycle: A → B → C → A', () => {
    const result = topologicalSort(
      ['A', 'B', 'C'],
      [wire('A', 'B'), wire('B', 'C'), wire('C', 'A')],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('detects a cycle even when non-cyclic nodes exist', () => {
    // X → A → B → C → A (cycle), plus standalone Y
    const result = topologicalSort(
      ['X', 'A', 'B', 'C', 'Y'],
      [wire('X', 'A'), wire('A', 'B'), wire('B', 'C'), wire('C', 'A')],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('detects a self-loop: A → A', () => {
    const result = topologicalSort(
      ['A'],
      [wire('A', 'A')],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath).toContain('A');
    }
  });

  it('handles a fan-out: A → B, A → C, A → D', () => {
    const result = topologicalSort(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'B'), wire('A', 'C'), wire('A', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      assertBefore(result.value, 'A', 'B');
      assertBefore(result.value, 'A', 'C');
      assertBefore(result.value, 'A', 'D');
    }
  });

  it('handles a fan-in: B → D, C → D, A → D', () => {
    const result = topologicalSort(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'D'), wire('B', 'D'), wire('C', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      assertBefore(result.value, 'A', 'D');
      assertBefore(result.value, 'B', 'D');
      assertBefore(result.value, 'C', 'D');
    }
  });
});
