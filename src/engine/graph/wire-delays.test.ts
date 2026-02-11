import { describe, it, expect } from 'vitest';
import { computeWireDelays } from './wire-delays.ts';
import type { NodeId, Wire, NodeState } from '../../shared/types/index.ts';

/** Helper to create a minimal NodeState */
function makeNode(id: NodeId, type = 'multiply'): NodeState {
  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params: {},
    inputCount: 1,
    outputCount: 1,
  };
}

/** Helper to create a Wire */
function makeWire(
  id: string,
  sourceNodeId: NodeId,
  targetNodeId: NodeId,
  sourcePort = 0,
  targetPort = 0,
): Wire {
  return {
    id,
    source: { nodeId: sourceNodeId, portIndex: sourcePort, side: 'output' },
    target: { nodeId: targetNodeId, portIndex: targetPort, side: 'input' },
    path: [],
    signalBuffer: [0],
    writeHead: 0,
  };
}

const TOTAL_TICKS = 64;

describe('computeWireDelays', () => {
  describe('empty and trivial graphs', () => {
    it('returns empty map for no wires', () => {
      const nodes = new Map([['a', makeNode('a')]]);
      const result = computeWireDelays(['a'], [], nodes, TOTAL_TICKS);
      expect(result.wireDelays.size).toBe(0);
      expect(result.nodeDepths.get('a')).toBe(0);
      expect(result.outputMaxDepth).toBe(0);
    });

    it('returns empty map for empty topo order', () => {
      const nodes = new Map<NodeId, NodeState>();
      const result = computeWireDelays([], [], nodes, TOTAL_TICKS);
      expect(result.wireDelays.size).toBe(0);
      expect(result.outputMaxDepth).toBe(0);
    });

    it('single wire gets delay = totalTicks', () => {
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
      ]);
      const wires = [makeWire('w1', 'a', 'b')];
      const result = computeWireDelays(['a', 'b'], wires, nodes, TOTAL_TICKS);
      expect(result.wireDelays.get('w1')).toBe(TOTAL_TICKS);
    });
  });

  describe('linear chain', () => {
    it('distributes delays evenly across a 3-node chain', () => {
      // A → B → C (2 wires, depths 0, 1, 2)
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
      ]);
      const wires = [makeWire('w1', 'a', 'b'), makeWire('w2', 'b', 'c')];
      const result = computeWireDelays(['a', 'b', 'c'], wires, nodes, TOTAL_TICKS);

      const d1 = result.wireDelays.get('w1')!;
      const d2 = result.wireDelays.get('w2')!;

      // Total should equal TOTAL_TICKS
      expect(d1 + d2).toBe(TOTAL_TICKS);
      // Each should be roughly half
      expect(d1).toBe(32);
      expect(d2).toBe(32);
    });

    it('distributes delays across a 4-node chain', () => {
      // A → B → C → D (3 wires, depths 0, 1, 2, 3)
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
        ['d', makeNode('d')],
      ]);
      const wires = [
        makeWire('w1', 'a', 'b'),
        makeWire('w2', 'b', 'c'),
        makeWire('w3', 'c', 'd'),
      ];
      const result = computeWireDelays(['a', 'b', 'c', 'd'], wires, nodes, TOTAL_TICKS);

      const d1 = result.wireDelays.get('w1')!;
      const d2 = result.wireDelays.get('w2')!;
      const d3 = result.wireDelays.get('w3')!;

      // Total = TOTAL_TICKS
      expect(d1 + d2 + d3).toBe(TOTAL_TICKS);
      // Each ~21.33, rounding should give 21, 22, 21 or similar
      expect(d1).toBeGreaterThanOrEqual(1);
      expect(d2).toBeGreaterThanOrEqual(1);
      expect(d3).toBeGreaterThanOrEqual(1);
    });
  });

  describe('fan-out', () => {
    it('branches from one source get equal total path delay', () => {
      // A → B and A → C (fan-out from A)
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
      ]);
      const wires = [makeWire('w1', 'a', 'b'), makeWire('w2', 'a', 'c')];
      const result = computeWireDelays(['a', 'b', 'c'], wires, nodes, TOTAL_TICKS);

      // Both wires should get the same delay (both paths are depth 1)
      expect(result.wireDelays.get('w1')).toBe(TOTAL_TICKS);
      expect(result.wireDelays.get('w2')).toBe(TOTAL_TICKS);
    });
  });

  describe('fan-in', () => {
    it('merging paths arrive simultaneously', () => {
      // A → C and B → C (fan-in to C)
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
      ]);
      const wires = [makeWire('w1', 'a', 'c'), makeWire('w2', 'b', 'c')];
      const result = computeWireDelays(['a', 'b', 'c'], wires, nodes, TOTAL_TICKS);

      // Both wires lead to same depth node, so both get same delay
      expect(result.wireDelays.get('w1')).toBe(TOTAL_TICKS);
      expect(result.wireDelays.get('w2')).toBe(TOTAL_TICKS);
    });
  });

  describe('diamond merge', () => {
    it('both paths through diamond total to same delay', () => {
      //   A
      //  / \
      // B   C
      //  \ /
      //   D
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
        ['d', makeNode('d')],
      ]);
      const wires = [
        makeWire('w1', 'a', 'b'),
        makeWire('w2', 'a', 'c'),
        makeWire('w3', 'b', 'd'),
        makeWire('w4', 'c', 'd'),
      ];
      const result = computeWireDelays(['a', 'b', 'c', 'd'], wires, nodes, TOTAL_TICKS);

      // Path A→B→D = w1 + w3
      // Path A→C→D = w2 + w4
      const pathABD = result.wireDelays.get('w1')! + result.wireDelays.get('w3')!;
      const pathACD = result.wireDelays.get('w2')! + result.wireDelays.get('w4')!;

      expect(pathABD).toBe(TOTAL_TICKS);
      expect(pathACD).toBe(TOTAL_TICKS);
    });
  });

  describe('asymmetric diamond', () => {
    it('short and long paths through asymmetric diamond total to same delay', () => {
      // A → B → C → D (long path, depth 3)
      // A → D (short path, depth 1 — but D is at depth 3)
      // D is at max depth (3 because of long path)
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
        ['d', makeNode('d')],
      ]);
      const wires = [
        makeWire('w1', 'a', 'b'),
        makeWire('w2', 'b', 'c'),
        makeWire('w3', 'c', 'd'),
        makeWire('w4', 'a', 'd'), // shortcut
      ];
      const result = computeWireDelays(['a', 'b', 'c', 'd'], wires, nodes, TOTAL_TICKS);

      // Long path: w1 + w2 + w3 = 64
      const longPath = result.wireDelays.get('w1')! + result.wireDelays.get('w2')! + result.wireDelays.get('w3')!;
      // Short path: w4 = 64
      const shortPath = result.wireDelays.get('w4')!;

      expect(longPath).toBe(TOTAL_TICKS);
      expect(shortPath).toBe(TOTAL_TICKS);
    });
  });

  describe('min-1 enforcement', () => {
    it('all wire delays are at least 1', () => {
      // Many nodes in a chain with small totalTicks
      const nodeIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const nodes = new Map(nodeIds.map((id) => [id, makeNode(id)]));
      const wires = [];
      for (let i = 0; i < nodeIds.length - 1; i++) {
        wires.push(makeWire(`w${i}`, nodeIds[i], nodeIds[i + 1]));
      }
      // With 7 wires and totalTicks = 5, some wires would get 0 without min-1
      const result = computeWireDelays(nodeIds, wires, nodes, 5);

      for (const wire of wires) {
        expect(result.wireDelays.get(wire.id)).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('multiple outputs at different depths', () => {
    it('all paths terminate at correct total delay', () => {
      // A → B → C (output at depth 2)
      // A → D (output at depth 1)
      // maxDepth = 2, so A→D path should also total 64
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
        ['d', makeNode('d')],
      ]);
      const wires = [
        makeWire('w1', 'a', 'b'),
        makeWire('w2', 'b', 'c'),
        makeWire('w3', 'a', 'd'),
      ];
      const result = computeWireDelays(['a', 'b', 'c', 'd'], wires, nodes, TOTAL_TICKS);

      // Path to C: w1 + w2
      const pathC = result.wireDelays.get('w1')! + result.wireDelays.get('w2')!;
      // Path to D: w3
      const pathD = result.wireDelays.get('w3')!;

      expect(pathC).toBe(TOTAL_TICKS);
      expect(pathD).toBe(TOTAL_TICKS);
    });
  });

  describe('node depths', () => {
    it('computes correct depths for linear chain', () => {
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
      ]);
      const wires = [makeWire('w1', 'a', 'b'), makeWire('w2', 'b', 'c')];
      const result = computeWireDelays(['a', 'b', 'c'], wires, nodes, TOTAL_TICKS);

      expect(result.nodeDepths.get('a')).toBe(0);
      expect(result.nodeDepths.get('b')).toBe(1);
      expect(result.nodeDepths.get('c')).toBe(2);
      expect(result.outputMaxDepth).toBe(2);
    });

    it('computes max depth at fan-in merge point', () => {
      // A → C (depth 1)
      // B → D → C (C gets max depth 2 from longer path)
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
        ['d', makeNode('d')],
      ]);
      const wires = [
        makeWire('w1', 'a', 'c'),
        makeWire('w2', 'b', 'd'),
        makeWire('w3', 'd', 'c'),
      ];
      const result = computeWireDelays(['a', 'b', 'd', 'c'], wires, nodes, TOTAL_TICKS);

      expect(result.nodeDepths.get('a')).toBe(0);
      expect(result.nodeDepths.get('b')).toBe(0);
      expect(result.nodeDepths.get('d')).toBe(1);
      expect(result.nodeDepths.get('c')).toBe(2); // max(1, 2)
    });
  });

  describe('all-dead-end graph', () => {
    it('treats entire graph as one subgraph with full budget', () => {
      // A → B → C, but all nodes form a complete dead-end
      // (no distinction between output-reachable and dead-end since terminal = dead-end)
      // Actually, in our algorithm terminal nodes ARE the outputs.
      // This test just verifies the basic case works.
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
      ]);
      const wires = [makeWire('w1', 'a', 'b')];
      const result = computeWireDelays(['a', 'b'], wires, nodes, TOTAL_TICKS);

      expect(result.wireDelays.get('w1')).toBe(TOTAL_TICKS);
    });
  });

  describe('disconnected components', () => {
    it('handles multiple disconnected subgraphs', () => {
      // Subgraph 1: A → B
      // Subgraph 2: C → D
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
        ['c', makeNode('c')],
        ['d', makeNode('d')],
      ]);
      const wires = [
        makeWire('w1', 'a', 'b'),
        makeWire('w2', 'c', 'd'),
      ];
      const result = computeWireDelays(['a', 'c', 'b', 'd'], wires, nodes, TOTAL_TICKS);

      expect(result.wireDelays.get('w1')).toBe(TOTAL_TICKS);
      expect(result.wireDelays.get('w2')).toBe(TOTAL_TICKS);
    });
  });

  describe('parallel wires between same nodes', () => {
    it('handles multiple wires from same source to same target', () => {
      // A has 2 output ports, B has 2 input ports, both connected
      const nodes = new Map([
        ['a', makeNode('a')],
        ['b', makeNode('b')],
      ]);
      const wires = [
        makeWire('w1', 'a', 'b', 0, 0),
        makeWire('w2', 'a', 'b', 1, 1),
      ];
      const result = computeWireDelays(['a', 'b'], wires, nodes, TOTAL_TICKS);

      expect(result.wireDelays.get('w1')).toBe(TOTAL_TICKS);
      expect(result.wireDelays.get('w2')).toBe(TOTAL_TICKS);
    });
  });

  describe('rounding consistency', () => {
    it('arrival-time rounding ensures path totals equal totalTicks exactly', () => {
      // 5-node chain: depths 0,1,2,3,4 — 4 wires
      // totalTicks = 64, delays should be 16,16,16,16
      const nodeIds = ['a', 'b', 'c', 'd', 'e'];
      const nodes = new Map(nodeIds.map((id) => [id, makeNode(id)]));
      const wires = [
        makeWire('w1', 'a', 'b'),
        makeWire('w2', 'b', 'c'),
        makeWire('w3', 'c', 'd'),
        makeWire('w4', 'd', 'e'),
      ];
      const result = computeWireDelays(nodeIds, wires, nodes, TOTAL_TICKS);

      const total = wires.reduce((sum, w) => sum + result.wireDelays.get(w.id)!, 0);
      expect(total).toBe(TOTAL_TICKS);
    });

    it('odd division rounds correctly', () => {
      // 4-node chain with totalTicks = 64: depths 0,1,2,3
      // delays: round(1*64/3)-round(0*64/3) = 21-0=21
      //         round(2*64/3)-round(1*64/3) = 43-21=22
      //         round(3*64/3)-round(2*64/3) = 64-43=21
      const nodeIds = ['a', 'b', 'c', 'd'];
      const nodes = new Map(nodeIds.map((id) => [id, makeNode(id)]));
      const wires = [
        makeWire('w1', 'a', 'b'),
        makeWire('w2', 'b', 'c'),
        makeWire('w3', 'c', 'd'),
      ];
      const result = computeWireDelays(nodeIds, wires, nodes, TOTAL_TICKS);

      const d1 = result.wireDelays.get('w1')!;
      const d2 = result.wireDelays.get('w2')!;
      const d3 = result.wireDelays.get('w3')!;

      expect(d1 + d2 + d3).toBe(TOTAL_TICKS);
      // With arrival-time rounding: 21, 22, 21
      expect(d1).toBe(21);
      expect(d2).toBe(22);
      expect(d3).toBe(21);
    });
  });
});
