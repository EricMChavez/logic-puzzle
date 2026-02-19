import { describe, it, expect } from 'vitest';
import { SignalGraph } from './signal-graph.ts';
import { createPath } from '../../shared/types/index.ts';
import type { ChipState, Path, ChipId } from '../../shared/types/index.ts';

function makeChip(id: string): ChipState {
  return {
    id,
    type: 'multiply',
    position: { col: 0, row: 0 },
    params: {},
    socketCount: 2,
    plugCount: 1,
  };
}

function makePath(id: string, sourceId: ChipId, targetId: ChipId): Path {
  return createPath(
    id,
    { chipId: sourceId, portIndex: 0, side: 'plug' },
    { chipId: targetId, portIndex: 0, side: 'socket' },
  );
}

describe('SignalGraph', () => {
  it('starts empty', () => {
    const graph = new SignalGraph();
    expect(graph.getOrder()).toEqual([]);
    expect(graph.getChips().size).toBe(0);
    expect(graph.getPaths()).toHaveLength(0);
  });

  it('adds a node and includes it in sort order', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    expect(graph.getOrder()).toEqual(['A']);
    expect(graph.getChip('A')).toBeDefined();
  });

  it('recalculates order when adding a wire', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));

    const result = graph.addPath(makePath('w1', 'A', 'B'));
    expect(result.ok).toBe(true);

    const order = graph.getOrder();
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
  });

  it('rejects a wire that would create a cycle', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addPath(makePath('w1', 'A', 'B'));

    const result = graph.addPath(makePath('w2', 'B', 'A'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath.length).toBeGreaterThanOrEqual(2);
    }

    // Path was not added
    expect(graph.getPaths()).toHaveLength(1);
  });

  it('does not modify sort order on rejected wire', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addPath(makePath('w1', 'A', 'B'));

    const orderBefore = [...graph.getOrder()];
    graph.addPath(makePath('w2', 'B', 'A'));
    expect(graph.getOrder()).toEqual(orderBefore);
  });

  it('recalculates order when removing a wire', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addPath(makePath('w1', 'A', 'B'));

    graph.removePath('w1');
    expect(graph.getPaths()).toHaveLength(0);
    // Both nodes still present
    expect(graph.getOrder()).toHaveLength(2);
  });

  it('removes a node and its connected wires', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addChip(makeChip('C'));
    graph.addPath(makePath('w1', 'A', 'B'));
    graph.addPath(makePath('w2', 'B', 'C'));

    const removed = graph.removeChip('B');
    expect(removed).toHaveLength(2);
    expect(graph.getChips().size).toBe(2);
    expect(graph.getPaths()).toHaveLength(0);
    expect(graph.getOrder()).toHaveLength(2);
    expect(graph.getOrder()).toContain('A');
    expect(graph.getOrder()).toContain('C');
  });

  it('handles diamond merge topology', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addChip(makeChip('C'));
    graph.addChip(makeChip('D'));
    graph.addPath(makePath('w1', 'A', 'B'));
    graph.addPath(makePath('w2', 'A', 'C'));
    graph.addPath(makePath('w3', 'B', 'D'));
    graph.addPath(makePath('w4', 'C', 'D'));

    const order = graph.getOrder();
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });

  it('includes disconnected nodes in sort order', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addChip(makeChip('Disconnected'));
    graph.addPath(makePath('w1', 'A', 'B'));

    const order = graph.getOrder();
    expect(order).toHaveLength(3);
    expect(order).toContain('Disconnected');
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
  });

  it('rejects a self-loop', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));

    const result = graph.addPath(makePath('w1', 'A', 'A'));
    expect(result.ok).toBe(false);
    expect(graph.getPaths()).toHaveLength(0);
  });

  it('detects a 3-node cycle via addPath', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addChip(makeChip('C'));
    graph.addPath(makePath('w1', 'A', 'B'));
    graph.addPath(makePath('w2', 'B', 'C'));

    const result = graph.addPath(makePath('w3', 'C', 'A'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath.length).toBeGreaterThanOrEqual(3);
    }
    // Only the first two wires remain
    expect(graph.getPaths()).toHaveLength(2);
  });

  it('allows a previously-blocked wire after the blocking wire is removed', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addPath(makePath('w1', 'A', 'B'));

    // B → A would create a cycle
    const blocked = graph.addPath(makePath('w2', 'B', 'A'));
    expect(blocked.ok).toBe(false);

    // Remove the original wire
    graph.removePath('w1');

    // Now B → A is valid
    const allowed = graph.addPath(makePath('w2', 'B', 'A'));
    expect(allowed.ok).toBe(true);
    expect(graph.getOrder()).toEqual(['B', 'A']);
  });

  it('handles parallel independent paths', () => {
    const graph = new SignalGraph();
    graph.addChip(makeChip('A'));
    graph.addChip(makeChip('B'));
    graph.addChip(makeChip('C'));
    graph.addChip(makeChip('D'));
    graph.addPath(makePath('w1', 'A', 'B'));
    graph.addPath(makePath('w2', 'C', 'D'));

    const order = graph.getOrder();
    expect(order).toHaveLength(4);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });

  it('getNode returns undefined for missing ID', () => {
    const graph = new SignalGraph();
    expect(graph.getChip('nonexistent')).toBeUndefined();
  });
});
