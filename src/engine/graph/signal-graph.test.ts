import { describe, it, expect } from 'vitest';
import { SignalGraph } from './signal-graph.ts';
import { createWire } from '../../shared/types/index.ts';
import type { NodeState, Wire, NodeId } from '../../shared/types/index.ts';

function makeNode(id: string): NodeState {
  return {
    id,
    type: 'multiply',
    position: { col: 0, row: 0 },
    params: {},
    inputCount: 2,
    outputCount: 1,
  };
}

function makeWire(id: string, sourceId: NodeId, targetId: NodeId): Wire {
  return createWire(
    id,
    { nodeId: sourceId, portIndex: 0, side: 'output' },
    { nodeId: targetId, portIndex: 0, side: 'input' },
  );
}

describe('SignalGraph', () => {
  it('starts empty', () => {
    const graph = new SignalGraph();
    expect(graph.getOrder()).toEqual([]);
    expect(graph.getNodes().size).toBe(0);
    expect(graph.getWires()).toHaveLength(0);
  });

  it('adds a node and includes it in sort order', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    expect(graph.getOrder()).toEqual(['A']);
    expect(graph.getNode('A')).toBeDefined();
  });

  it('recalculates order when adding a wire', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));

    const result = graph.addWire(makeWire('w1', 'A', 'B'));
    expect(result.ok).toBe(true);

    const order = graph.getOrder();
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
  });

  it('rejects a wire that would create a cycle', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addWire(makeWire('w1', 'A', 'B'));

    const result = graph.addWire(makeWire('w2', 'B', 'A'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath.length).toBeGreaterThanOrEqual(2);
    }

    // Wire was not added
    expect(graph.getWires()).toHaveLength(1);
  });

  it('does not modify sort order on rejected wire', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addWire(makeWire('w1', 'A', 'B'));

    const orderBefore = [...graph.getOrder()];
    graph.addWire(makeWire('w2', 'B', 'A'));
    expect(graph.getOrder()).toEqual(orderBefore);
  });

  it('recalculates order when removing a wire', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addWire(makeWire('w1', 'A', 'B'));

    graph.removeWire('w1');
    expect(graph.getWires()).toHaveLength(0);
    // Both nodes still present
    expect(graph.getOrder()).toHaveLength(2);
  });

  it('removes a node and its connected wires', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addNode(makeNode('C'));
    graph.addWire(makeWire('w1', 'A', 'B'));
    graph.addWire(makeWire('w2', 'B', 'C'));

    const removed = graph.removeNode('B');
    expect(removed).toHaveLength(2);
    expect(graph.getNodes().size).toBe(2);
    expect(graph.getWires()).toHaveLength(0);
    expect(graph.getOrder()).toHaveLength(2);
    expect(graph.getOrder()).toContain('A');
    expect(graph.getOrder()).toContain('C');
  });

  it('handles diamond merge topology', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addNode(makeNode('C'));
    graph.addNode(makeNode('D'));
    graph.addWire(makeWire('w1', 'A', 'B'));
    graph.addWire(makeWire('w2', 'A', 'C'));
    graph.addWire(makeWire('w3', 'B', 'D'));
    graph.addWire(makeWire('w4', 'C', 'D'));

    const order = graph.getOrder();
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });

  it('includes disconnected nodes in sort order', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addNode(makeNode('Disconnected'));
    graph.addWire(makeWire('w1', 'A', 'B'));

    const order = graph.getOrder();
    expect(order).toHaveLength(3);
    expect(order).toContain('Disconnected');
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
  });

  it('rejects a self-loop', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));

    const result = graph.addWire(makeWire('w1', 'A', 'A'));
    expect(result.ok).toBe(false);
    expect(graph.getWires()).toHaveLength(0);
  });

  it('detects a 3-node cycle via addWire', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addNode(makeNode('C'));
    graph.addWire(makeWire('w1', 'A', 'B'));
    graph.addWire(makeWire('w2', 'B', 'C'));

    const result = graph.addWire(makeWire('w3', 'C', 'A'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cyclePath.length).toBeGreaterThanOrEqual(3);
    }
    // Only the first two wires remain
    expect(graph.getWires()).toHaveLength(2);
  });

  it('allows a previously-blocked wire after the blocking wire is removed', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addWire(makeWire('w1', 'A', 'B'));

    // B → A would create a cycle
    const blocked = graph.addWire(makeWire('w2', 'B', 'A'));
    expect(blocked.ok).toBe(false);

    // Remove the original wire
    graph.removeWire('w1');

    // Now B → A is valid
    const allowed = graph.addWire(makeWire('w2', 'B', 'A'));
    expect(allowed.ok).toBe(true);
    expect(graph.getOrder()).toEqual(['B', 'A']);
  });

  it('handles parallel independent paths', () => {
    const graph = new SignalGraph();
    graph.addNode(makeNode('A'));
    graph.addNode(makeNode('B'));
    graph.addNode(makeNode('C'));
    graph.addNode(makeNode('D'));
    graph.addWire(makeWire('w1', 'A', 'B'));
    graph.addWire(makeWire('w2', 'C', 'D'));

    const order = graph.getOrder();
    expect(order).toHaveLength(4);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });

  it('getNode returns undefined for missing ID', () => {
    const graph = new SignalGraph();
    expect(graph.getNode('nonexistent')).toBeUndefined();
  });
});
