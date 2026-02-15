import { describe, it, expect } from 'vitest';
import { topologicalSort, topologicalSortWithDepths } from './topological-sort.ts';
import { createWire } from '../../shared/types/index.ts';
import type { Wire, NodeId } from '../../shared/types/index.ts';

/** Helper to create a minimal wire between two nodes */
function wire(sourceId: NodeId, targetId: NodeId): Wire {
  return createWire(
    `${sourceId}->${targetId}`,
    { chipId: sourceId, portIndex: 0, side: 'output' },
    { chipId: targetId, portIndex: 0, side: 'input' },
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

describe('topologicalSortWithDepths', () => {
  it('handles empty graph', () => {
    const result = topologicalSortWithDepths([], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.order).toEqual([]);
      expect(result.value.depths.size).toBe(0);
      expect(result.value.maxDepth).toBe(0);
    }
  });

  it('single node: depth 0', () => {
    const result = topologicalSortWithDepths(['A'], []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.maxDepth).toBe(0);
    }
  });

  it('linear chain: A→B→C → depths {A:0, B:1, C:2}', () => {
    const result = topologicalSortWithDepths(
      ['A', 'B', 'C'],
      [wire('A', 'B'), wire('B', 'C')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.depths.get('B')).toBe(1);
      expect(result.value.depths.get('C')).toBe(2);
      expect(result.value.maxDepth).toBe(2);
    }
  });

  it('diamond: A→B, A→C, B→D, C→D → depths {A:0, B:1, C:1, D:2}', () => {
    const result = topologicalSortWithDepths(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'B'), wire('A', 'C'), wire('B', 'D'), wire('C', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.depths.get('B')).toBe(1);
      expect(result.value.depths.get('C')).toBe(1);
      expect(result.value.depths.get('D')).toBe(2);
      expect(result.value.maxDepth).toBe(2);
    }
  });

  it('parallel independent: {A:0, B:0, C:1, D:1}', () => {
    const result = topologicalSortWithDepths(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'C'), wire('B', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.depths.get('B')).toBe(0);
      expect(result.value.depths.get('C')).toBe(1);
      expect(result.value.depths.get('D')).toBe(1);
      expect(result.value.maxDepth).toBe(1);
    }
  });

  it('fan-out: A→B, A→C, A→D → depths {A:0, B:1, C:1, D:1}', () => {
    const result = topologicalSortWithDepths(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'B'), wire('A', 'C'), wire('A', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.depths.get('B')).toBe(1);
      expect(result.value.depths.get('C')).toBe(1);
      expect(result.value.depths.get('D')).toBe(1);
      expect(result.value.maxDepth).toBe(1);
    }
  });

  it('fan-in: A→D, B→D, C→D → depths {A:0, B:0, C:0, D:1}', () => {
    const result = topologicalSortWithDepths(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'D'), wire('B', 'D'), wire('C', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.depths.get('B')).toBe(0);
      expect(result.value.depths.get('C')).toBe(0);
      expect(result.value.depths.get('D')).toBe(1);
      expect(result.value.maxDepth).toBe(1);
    }
  });

  it('longest path determines depth: A→B→D, A→C→D with A→D shortcut', () => {
    // A→B (depth 1), B→D (depth 2), A→C (depth 1), C→D (depth 2), A→D (depth 1)
    // D depth should be max(B+1, C+1, A+1) = 2
    const result = topologicalSortWithDepths(
      ['A', 'B', 'C', 'D'],
      [wire('A', 'B'), wire('B', 'D'), wire('A', 'C'), wire('C', 'D'), wire('A', 'D')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.depths.get('B')).toBe(1);
      expect(result.value.depths.get('C')).toBe(1);
      expect(result.value.depths.get('D')).toBe(2);
    }
  });

  it('disconnected node has depth 0', () => {
    const result = topologicalSortWithDepths(
      ['A', 'B', 'X'],
      [wire('A', 'B')],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.depths.get('X')).toBe(0);
      expect(result.value.depths.get('A')).toBe(0);
      expect(result.value.depths.get('B')).toBe(1);
    }
  });

  it('detects cycles (same as topologicalSort)', () => {
    const result = topologicalSortWithDepths(
      ['A', 'B'],
      [wire('A', 'B'), wire('B', 'A')],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Cycle detected');
    }
  });
});
