import { describe, it, expect, beforeEach } from 'vitest';
import type { NodeState, Wire, PortRef } from '../../shared/types/index.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';
import {
  computeTabOrder,
  computeValidWiringTargets,
  advanceFocus,
  getFocusTarget,
  setFocusTarget,
  isFocusVisible,
  setFocusVisible,
  _resetForTesting,
} from './keyboard-focus.ts';

function makeNode(id: string, type: string, col: number, row: number, inputs = 1, outputs = 1): NodeState {
  return { id, type, position: { col, row }, params: {}, inputCount: inputs, outputCount: outputs };
}

function makeWire(id: string, sourceNodeId: string, sourcePort: number, targetNodeId: string, targetPort: number): Wire {
  return {
    id,
    source: { nodeId: sourceNodeId, portIndex: sourcePort, side: 'output' },
    target: { nodeId: targetNodeId, portIndex: targetPort, side: 'input' },
    path: [],
    signalBuffer: new Array(16).fill(0),
    writeHead: 0,
  };
}

function makePuzzle(inputs = 2, outputs = 1): PuzzleDefinition {
  return {
    id: 'test',
    title: 'Test',
    description: '',
    activeInputs: inputs,
    activeOutputs: outputs,
    allowedNodes: null,
    testCases: [],
  };
}

describe('keyboard-focus', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('accessors', () => {
    it('initial state is null / false', () => {
      expect(getFocusTarget()).toBeNull();
      expect(isFocusVisible()).toBe(false);
    });

    it('setFocusTarget and getFocusTarget round-trip', () => {
      const target = { type: 'node' as const, nodeId: 'n1' };
      setFocusTarget(target);
      expect(getFocusTarget()).toEqual(target);
    });

    it('setFocusVisible toggles visibility', () => {
      setFocusVisible(true);
      expect(isFocusVisible()).toBe(true);
      setFocusVisible(false);
      expect(isFocusVisible()).toBe(false);
    });
  });

  describe('computeTabOrder', () => {
    it('sorts nodes by row then col', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n2', makeNode('n2', 'invert', 10, 5));
      nodes.set('n1', makeNode('n1', 'multiply', 3, 2));
      nodes.set('n3', makeNode('n3', 'mix', 5, 2));

      const order = computeTabOrder(nodes, [], null, null);
      expect(order.map((t) => (t as { type: 'node'; nodeId: string }).nodeId)).toEqual(['n1', 'n3', 'n2']);
    });

    it('skips connection-point virtual nodes', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2));
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 0, 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 0, 0, 1, 0));

      const order = computeTabOrder(nodes, [], null, null);
      expect(order).toHaveLength(1);
      expect(order[0]).toEqual({ type: 'node', nodeId: 'n1' });
    });

    it('splices ports and wires after expanded node', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'mix', 3, 2, 2, 1));
      nodes.set('n2', makeNode('n2', 'invert', 10, 5));

      const wires = [makeWire('w1', 'n1', 0, 'n2', 0)];

      const order = computeTabOrder(nodes, wires, 'n1', null);

      // n1, n1 input:0, n1 input:1, n1 output:0, w1 (connected to n1), n2
      expect(order).toHaveLength(6);
      expect(order[0]).toEqual({ type: 'node', nodeId: 'n1' });
      expect(order[1]).toEqual({ type: 'port', portRef: { nodeId: 'n1', portIndex: 0, side: 'input' } });
      expect(order[2]).toEqual({ type: 'port', portRef: { nodeId: 'n1', portIndex: 1, side: 'input' } });
      expect(order[3]).toEqual({ type: 'port', portRef: { nodeId: 'n1', portIndex: 0, side: 'output' } });
      expect(order[4]).toEqual({ type: 'wire', wireId: 'w1' });
      expect(order[5]).toEqual({ type: 'node', nodeId: 'n2' });
    });

    it('appends active connection points (inputs then outputs)', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2));

      const puzzle = makePuzzle(2, 1);
      const order = computeTabOrder(nodes, [], null, puzzle);

      // n1, cp-input:0, cp-input:1, cp-output:0
      expect(order).toHaveLength(4);
      expect(order[1]).toEqual({ type: 'connection-point', side: 'input', index: 0 });
      expect(order[2]).toEqual({ type: 'connection-point', side: 'input', index: 1 });
      expect(order[3]).toEqual({ type: 'connection-point', side: 'output', index: 0 });
    });

    it('returns empty for empty board', () => {
      const order = computeTabOrder(new Map(), [], null, null);
      expect(order).toHaveLength(0);
    });
  });

  describe('computeValidWiringTargets', () => {
    it('returns opposite-side ports on different nodes', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2, 1, 1));
      nodes.set('n2', makeNode('n2', 'multiply', 10, 5, 2, 1));

      const fromPort: PortRef = { nodeId: 'n1', portIndex: 0, side: 'output' };
      const targets = computeValidWiringTargets(fromPort, nodes, []);

      // n2 has 2 input ports
      expect(targets).toHaveLength(2);
      expect(targets[0]).toEqual({ nodeId: 'n2', portIndex: 0, side: 'input' });
      expect(targets[1]).toEqual({ nodeId: 'n2', portIndex: 1, side: 'input' });
    });

    it('excludes same-node ports', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'mix', 3, 2, 2, 1));

      const fromPort: PortRef = { nodeId: 'n1', portIndex: 0, side: 'output' };
      const targets = computeValidWiringTargets(fromPort, nodes, []);
      expect(targets).toHaveLength(0);
    });

    it('excludes already-connected port pairs', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2, 1, 1));
      nodes.set('n2', makeNode('n2', 'multiply', 10, 5, 2, 1));

      const wires = [makeWire('w1', 'n1', 0, 'n2', 0)];
      const fromPort: PortRef = { nodeId: 'n1', portIndex: 0, side: 'output' };
      const targets = computeValidWiringTargets(fromPort, nodes, wires);

      // Only n2:input:1 since n2:input:0 already connected to n1:output:0
      expect(targets).toHaveLength(1);
      expect(targets[0]).toEqual({ nodeId: 'n2', portIndex: 1, side: 'input' });
    });

    it('includes connection-point virtual node ports', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2, 1, 1));
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 0, 0, 1));

      const fromPort: PortRef = { nodeId: '__cp_input_0__', portIndex: 0, side: 'output' };
      const targets = computeValidWiringTargets(fromPort, nodes, []);

      // n1 has 1 input port
      expect(targets).toHaveLength(1);
      expect(targets[0]).toEqual({ nodeId: 'n1', portIndex: 0, side: 'input' });
    });
  });

  describe('advanceFocus', () => {
    it('initializes to first item on forward advance from null', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2));

      advanceFocus(1, nodes, [], null, null);
      expect(getFocusTarget()).toEqual({ type: 'node', nodeId: 'n1' });
      expect(isFocusVisible()).toBe(true);
    });

    it('initializes to last item on backward advance from null', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2));
      nodes.set('n2', makeNode('n2', 'multiply', 10, 5));

      advanceFocus(-1, nodes, [], null, null);
      expect(getFocusTarget()).toEqual({ type: 'node', nodeId: 'n2' });
    });

    it('wraps forward from last to first', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2));
      nodes.set('n2', makeNode('n2', 'multiply', 10, 5));

      setFocusTarget({ type: 'node', nodeId: 'n2' });
      advanceFocus(1, nodes, [], null, null);
      expect(getFocusTarget()).toEqual({ type: 'node', nodeId: 'n1' });
    });

    it('wraps backward from first to last', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2));
      nodes.set('n2', makeNode('n2', 'multiply', 10, 5));

      setFocusTarget({ type: 'node', nodeId: 'n1' });
      advanceFocus(-1, nodes, [], null, null);
      expect(getFocusTarget()).toEqual({ type: 'node', nodeId: 'n2' });
    });

    it('advances through ports when node is expanded', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'mix', 3, 2, 2, 1));

      setFocusTarget({ type: 'node', nodeId: 'n1' });
      advanceFocus(1, nodes, [], 'n1', null);
      expect(getFocusTarget()).toEqual({ type: 'port', portRef: { nodeId: 'n1', portIndex: 0, side: 'input' } });
    });

    it('does nothing for empty order', () => {
      advanceFocus(1, new Map(), [], null, null);
      expect(getFocusTarget()).toBeNull();
    });

    it('resets to first when current target not found in order', () => {
      const nodes = new Map<string, NodeState>();
      nodes.set('n1', makeNode('n1', 'invert', 3, 2));

      setFocusTarget({ type: 'node', nodeId: 'deleted' });
      advanceFocus(1, nodes, [], null, null);
      expect(getFocusTarget()).toEqual({ type: 'node', nodeId: 'n1' });
    });
  });
});
