import { describe, it, expect } from 'vitest';
import { evaluateAllCycles } from './cycle-evaluator';
import type { CycleResults } from './cycle-evaluator';
import type { NodeId, NodeState, Wire } from '../../shared/types/index';

// Helper to create a minimal NodeState
function makeNode(
  id: NodeId,
  type: string,
  inputCount: number,
  outputCount: number,
  params: Record<string, number | string | boolean> = {},
): NodeState {
  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params,
    inputCount,
    outputCount,
  };
}

// Helper to create a wire
function makeWire(
  id: string,
  sourceNodeId: string,
  sourcePort: number,
  targetNodeId: string,
  targetPort: number,
): Wire {
  return {
    id,
    source: { nodeId: sourceNodeId, portIndex: sourcePort, side: 'output' },
    target: { nodeId: targetNodeId, portIndex: targetPort, side: 'input' },
    path: [],
  };
}

// Helper for constant input generator
function constantInputs(values: number[]) {
  return (_cycle: number) => values;
}

// Helper to extract result or fail
function unwrap(result: ReturnType<typeof evaluateAllCycles>): CycleResults {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('evaluateAllCycles', () => {
  describe('single node evaluation', () => {
    it('evaluates an inverter for 256 cycles', () => {
      const nodes = new Map<NodeId, NodeState>();
      // Input CP
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      // Output CP
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      // Inverter
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([50]),
        256,
      ));

      // Every cycle should output -50
      for (let i = 0; i < 256; i++) {
        expect(result.outputValues[i][0]).toBe(-50);
      }
    });

    it('evaluates with varying inputs', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        (cycle) => [cycle - 128], // -128 to 127
        256,
      ));

      // Output should be clamped negation
      expect(result.outputValues[0][0]).toBe(100); // clamp(-(-128)) = clamp(128) → 100
      expect(result.outputValues[128][0]).toBe(0); // -(128-128) = 0
      expect(result.outputValues[255][0]).toBe(-100); // clamp(-(127)) → -100... wait
      // Actually: input at cycle 255 is 255-128=127, inverted = -127, clamped = -100
      // No wait, clamp range is [-100, 100], but input is already within?
      // input = 255-128 = 127. But signals are [-100, 100]. The input generator can
      // produce out of range values. The evaluator doesn't clamp inputs, only outputs.
      // inverter does clamp(-input) where clamp defaults to [-100,100]. So -127 → -100.
      // Hmm, actually the clamp in the evaluate result should catch that.
      // Let's just check some values that are in range:
      expect(result.outputValues[78][0]).toBe(50); // input=78-128=-50, inverted=50
    });
  });

  describe('memory node', () => {
    it('outputs 0 on cycle 0, then echoes previous input', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('mem', makeNode('mem', 'memory', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'mem', 0),
        makeWire('w2', 'mem', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        (cycle) => [cycle * 10], // 0, 10, 20, ...
        10,
      ));

      // Cycle 0: memory outputs 0 (initial state), stores 0
      expect(result.outputValues[0][0]).toBe(0);
      // Cycle 1: memory outputs 0 (previous=0), stores 10
      expect(result.outputValues[1][0]).toBe(0);
      // Cycle 2: memory outputs 10 (previous=10), stores 20
      expect(result.outputValues[2][0]).toBe(10);
      // Cycle 3: memory outputs 20
      expect(result.outputValues[3][0]).toBe(20);
      // Cycle 9: memory outputs 80 (previous input was 80 at cycle 8)
      expect(result.outputValues[9][0]).toBe(80);
    });
  });

  describe('chain of nodes', () => {
    it('evaluates a chain: input → inverter → inverter → output', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('inv1', makeNode('inv1', 'inverter', 1, 1));
      nodes.set('inv2', makeNode('inv2', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'inv1', 0),
        makeWire('w2', 'inv1', 0, 'inv2', 0),
        makeWire('w3', 'inv2', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([42]),
        4,
      ));

      // Double inversion = identity
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(42);
      }
    });
  });

  describe('unconnected inputs use port constants', () => {
    it('uses port constant when no wire connected', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      // Amp: 2 inputs (A=0, gain knob=1), 1 output
      // But let's use inverter with a constant-fed input (no CP)
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', 'inv', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:0', 75); // constant 75 to inverter input

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        portConstants,
        constantInputs([]),
        4,
      ));

      // Inverter should output -75
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(-75);
      }
    });
  });

  describe('parameter wires', () => {
    it('forward parameter wire resolves same-cycle', () => {
      // Input → amp (with gain wired from another node)
      // Input CP → amp input A
      // Another input CP → amp gain knob (forward = same-cycle)
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_input_1__', makeNode('__cp_input_1__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      // Amp has inputs [A(0), gain(1)] and output [Out(0)]
      nodes.set('amp1', makeNode('amp1', 'amp', 2, 1, { gain: 0 }));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'amp1', 0), // signal to A
        makeWire('w2', '__cp_input_1__', 0, 'amp1', 1), // signal to gain knob port
        makeWire('w3', 'amp1', 0, '__cp_output_0__', 0),
      ];

      // Input 0 = 80, Input 1 = -50 (gain control)
      // Amp formula: clamp(A * (1 + X/100)) = clamp(80 * (1 + -50/100)) = clamp(80 * 0.5) = 40
      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([80, -50]),
        4,
      ));

      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(40);
      }
    });

    it('backward parameter wire resolves cross-cycle', () => {
      // Setup: amp → inverter → amp (knob), creating a feedback on the parameter
      // The amp's gain is set by the inverter which is downstream in signal flow
      // but feeds back to amp's knob port
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('amp1', makeNode('amp1', 'amp', 2, 1, { gain: 0 }));
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'amp1', 0), // signal to amp A
        makeWire('w2', 'amp1', 0, 'inv', 0),            // amp out → inverter
        makeWire('w3', 'inv', 0, 'amp1', 1),            // inverter → amp gain (backward param wire)
        makeWire('w4', 'inv', 0, '__cp_output_0__', 0), // inverter → output
      ];

      // Amp formula: clamp(A * (1 + X/100))
      // Cycle 0: amp gets cross-cycle value for X = 0 (initial)
      //   amp output = clamp(100 * (1 + 0/100)) = 100
      //   inverter output = -100
      //   cross-cycle update: inv output = -100
      // Cycle 1: amp gets cross-cycle X = -100
      //   amp output = clamp(100 * (1 + -100/100)) = clamp(100 * 0) = 0
      //   inverter output = 0
      //   cross-cycle update: inv output = 0
      // Cycle 2: amp X = 0 again → oscillates

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([100]),
        4,
      ));

      // Oscillates: -100, 0, -100, 0
      expect(result.outputValues[0][0]).toBe(-100);
      expect(result.outputValues[1][0]).toBe(0);
      expect(result.outputValues[2][0]).toBe(-100);
      expect(result.outputValues[3][0]).toBe(0);
    });
  });

  describe('signal cycle detection', () => {
    it('detects signal cycles', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('a', makeNode('a', 'inverter', 1, 1));
      nodes.set('b', makeNode('b', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', 'a', 0, 'b', 0),
        makeWire('w2', 'b', 0, 'a', 0),
      ];

      const result = evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([]),
        4,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Cycle');
      }
    });
  });

  describe('wire values tracking', () => {
    it('records wire values per cycle', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        (cycle) => [cycle],
        4,
      ));

      // Wire w1 carries input signal
      const w1Values = result.wireValues.get('w1')!;
      expect(w1Values).toEqual([0, 1, 2, 3]);

      // Wire w2 carries inverted signal
      const w2Values = result.wireValues.get('w2')!;
      expect(w2Values).toEqual([0, -1, -2, -3]);
    });
  });

  describe('node outputs tracking', () => {
    it('records per-node outputs per cycle', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        (cycle) => [cycle * 10],
        4,
      ));

      const invOutputs = result.nodeOutputs.get('inv')!;
      expect(invOutputs[0]).toEqual([0]);
      expect(invOutputs[1]).toEqual([-10]);
      expect(invOutputs[2]).toEqual([-20]);
      expect(invOutputs[3]).toEqual([-30]);
    });
  });

  describe('multiple outputs', () => {
    it('handles multiple output CPs', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('__cp_output_1__', makeNode('__cp_output_1__', 'connection-output', 1, 0));
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_output_0__', 0),
        makeWire('w3', '__cp_input_0__', 0, '__cp_output_1__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([30]),
        4,
      ));

      // Output 0: inverted = -30
      // Output 1: direct passthrough = 30
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(-30);
        expect(result.outputValues[i][1]).toBe(30);
      }
    });
  });

  describe('creative slot nodes', () => {
    it('recognizes creative input and output slots', () => {
      const nodes = new Map<NodeId, NodeState>();
      // Creative input slot 0 (left side, acts as input CP)
      nodes.set('__cp_creative_0__', makeNode('__cp_creative_0__', 'connection-input', 0, 1));
      // Creative output slot 3 (right side, acts as output CP)
      nodes.set('__cp_creative_3__', makeNode('__cp_creative_3__', 'connection-output', 1, 0));
      // Inverter in between
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_creative_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_creative_3__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([60]),
        4,
      ));

      // Output should be inverted input
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(-60);
      }
    });

    it('handles multiple creative output slots', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_creative_0__', makeNode('__cp_creative_0__', 'connection-input', 0, 1));
      nodes.set('__cp_creative_3__', makeNode('__cp_creative_3__', 'connection-output', 1, 0));
      nodes.set('__cp_creative_4__', makeNode('__cp_creative_4__', 'connection-output', 1, 0));
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_creative_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_creative_3__', 0),
        makeWire('w3', '__cp_creative_0__', 0, '__cp_creative_4__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([40]),
        4,
      ));

      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(-40); // inverted
        expect(result.outputValues[i][1]).toBe(40);  // passthrough
      }
    });

    it('preserves output index when a slot is missing (gap)', () => {
      // Slot 3 is off (no node), slots 4 and 5 are outputs
      // Output index 0 should be empty (no slot 3), index 1 = slot 4, index 2 = slot 5
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_creative_0__', makeNode('__cp_creative_0__', 'connection-input', 0, 1));
      // No __cp_creative_3__ (slot 3 is off)
      nodes.set('__cp_creative_4__', makeNode('__cp_creative_4__', 'connection-output', 1, 0));
      nodes.set('__cp_creative_5__', makeNode('__cp_creative_5__', 'connection-output', 1, 0));
      nodes.set('inv', makeNode('inv', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_creative_0__', 0, 'inv', 0),
        makeWire('w2', 'inv', 0, '__cp_creative_4__', 0),
        makeWire('w3', '__cp_creative_0__', 0, '__cp_creative_5__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([50]),
        4,
      ));

      // outputCount = 3 (slot 5 → index 2, so outputCount >= 3)
      // Output 0 (slot 3 missing) = 0
      // Output 1 (slot 4) = inverted = -50
      // Output 2 (slot 5) = passthrough = 50
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(0);   // no slot 3
        expect(result.outputValues[i][1]).toBe(-50);  // inverted
        expect(result.outputValues[i][2]).toBe(50);   // passthrough
      }
    });
  });

  describe('processingOrder', () => {
    it('includes non-CP nodes in topological order', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
      nodes.set('inv1', makeNode('inv1', 'inverter', 1, 1));
      nodes.set('inv2', makeNode('inv2', 'inverter', 1, 1));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, 'inv1', 0),
        makeWire('w2', 'inv1', 0, 'inv2', 0),
        makeWire('w3', 'inv2', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([42]),
        4,
      ));

      // processingOrder should contain only non-CP nodes
      expect(result.processingOrder).toContain('inv1');
      expect(result.processingOrder).toContain('inv2');
      expect(result.processingOrder).not.toContain('__cp_input_0__');
      expect(result.processingOrder).not.toContain('__cp_output_0__');
      // inv1 should come before inv2 (topological order)
      expect(result.processingOrder.indexOf('inv1')).toBeLessThan(
        result.processingOrder.indexOf('inv2'),
      );
    });

    it('is empty for graph with only CPs', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));

      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([77]),
        4,
      ));

      expect(result.processingOrder).toEqual([]);
    });
  });

  describe('empty graph', () => {
    it('handles graph with no processing nodes', () => {
      const nodes = new Map<NodeId, NodeState>();
      nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
      nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));

      // Direct CP to CP wire
      const wires: Wire[] = [
        makeWire('w1', '__cp_input_0__', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        nodes,
        wires,
        new Map(),
        constantInputs([77]),
        4,
      ));

      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(77);
      }
    });
  });
});
