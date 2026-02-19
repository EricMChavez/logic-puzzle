import { describe, it, expect } from 'vitest';
import { evaluateAllCycles } from './cycle-evaluator';
import type { CycleResults } from './cycle-evaluator';
import type { ChipId, ChipState, Path } from '../../shared/types/index';

// Helper to create a minimal ChipState
function makeChip(
  id: ChipId,
  type: string,
  socketCount: number,
  plugCount: number,
  params: Record<string, number | string | boolean> = {},
): ChipState {
  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params,
    socketCount,
    plugCount,
  };
}

// Helper to create a path
function makePath(
  id: string,
  sourceChipId: string,
  sourcePort: number,
  targetChipId: string,
  targetPort: number,
): Path {
  return {
    id,
    source: { chipId: sourceChipId, portIndex: sourcePort, side: 'plug' },
    target: { chipId: targetChipId, portIndex: targetPort, side: 'socket' },
    route: [],
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
    it('evaluates a scale node (as inverter) for 256 cycles', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      // Scale with X=-100 acts as inverter: A * -100 / 100 = -A
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100); // X = -100 for inversion

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        constantInputs([50]),
        256,
      ));

      // Every cycle should output -50
      for (let i = 0; i < 256; i++) {
        expect(result.outputValues[i][0]).toBe(-50);
      }
    });

    it('evaluates with varying inputs', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        (cycle) => [cycle - 128], // -128 to 127
        256,
      ));

      // Output should be clamped negation: A * -100 / 100 = -A
      expect(result.outputValues[0][0]).toBe(100); // clamp(-(-128)) = clamp(128) → 100
      expect(result.outputValues[128][0]).toBe(0); // -(128-128) = 0
      // input=78-128=-50, inverted=50
      expect(result.outputValues[78][0]).toBe(50);
    });
  });

  describe('memory node', () => {
    it('outputs last cycle input on cycle 0 (wrap-around)', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('mem', makeChip('mem', 'memory', 1, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'mem', 0),
        makePath('w2', 'mem', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        (cycle) => [cycle * 10], // 0, 10, 20, ...
        10,
      ));

      // Warm-up pass establishes wrap-around: cycle 9 input = 90
      // Cycle 0: memory outputs 90 (wrap-around from cycle 9), stores 0
      expect(result.outputValues[0][0]).toBe(90);
      // Cycle 1: memory outputs 0 (previous=0), stores 10
      expect(result.outputValues[1][0]).toBe(0);
      // Cycle 2: memory outputs 10 (previous=10), stores 20
      expect(result.outputValues[2][0]).toBe(10);
      // Cycle 3: memory outputs 20
      expect(result.outputValues[3][0]).toBe(20);
      // Cycle 9: memory outputs 80 (previous input was 80 at cycle 8)
      expect(result.outputValues[9][0]).toBe(80);
    });

    it('seamless loop with constant input (all outputs equal)', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('mem', makeChip('mem', 'memory', 1, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'mem', 0),
        makePath('w2', 'mem', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        constantInputs([42]),
        256,
      ));

      // With warm-up, Memory gets constant 42 every cycle.
      // After warm-up, previousValue = 42. All 256 outputs should be 42.
      for (let i = 0; i < 256; i++) {
        expect(result.outputValues[i][0]).toBe(42);
      }
    });
  });

  describe('chain of nodes', () => {
    it('evaluates a chain: input → scale(-100) → scale(-100) → output', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('inv1', makeChip('inv1', 'scale', 2, 1));
      chips.set('inv2', makeChip('inv2', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv1', 0),
        makePath('w2', 'inv1', 0, 'inv2', 0),
        makePath('w3', 'inv2', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv1:1', -100);
      portConstants.set('inv2:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
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
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      // Offset node: A + X — wire input CP to A, use port constant for X
      chips.set('add1', makeChip('add1', 'offset', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'add1', 0),
        makePath('w2', 'add1', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('add1:1', 25); // constant 25 to X knob input

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        constantInputs([50]),
        4,
      ));

      // Offset: 50 + 25 = 75
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(75);
      }
    });
  });

  describe('parameter wires', () => {
    it('forward parameter wire resolves same-cycle', () => {
      // Input CP → scale input A
      // Another input CP → scale factor knob (forward = same-cycle)
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_input_1__', makeChip('__cp_input_1__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      // Scale has inputs [A(0), X(1)] and output [Out(0)]
      chips.set('sc1', makeChip('sc1', 'scale', 2, 1, { factor: 100 }));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'sc1', 0), // signal to A
        makePath('w2', '__cp_input_1__', 0, 'sc1', 1), // signal to factor knob port
        makePath('w3', 'sc1', 0, '__cp_output_0__', 0),
      ];

      // Input 0 = 80, Input 1 = 50
      // Scale formula: clamp(A * X / 100) = clamp(80 * 50 / 100) = 40
      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        constantInputs([80, 50]),
        4,
      ));

      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(40);
      }
    });

    it('backward parameter wire resolves cross-cycle', () => {
      // Setup: scale → scale(as inverter) → scale (knob), creating a feedback on the parameter
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('sc1', makeChip('sc1', 'scale', 2, 1, { factor: 100 }));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'sc1', 0), // signal to scale A
        makePath('w2', 'sc1', 0, 'inv', 0),            // scale out → inverter
        makePath('w3', 'inv', 0, 'sc1', 1),            // inverter → scale factor (backward param wire)
        makePath('w4', 'inv', 0, '__cp_output_0__', 0), // inverter → output
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100); // inverter: X=-100

      // Scale formula: clamp(A * X / 100)
      // Cycle 0: sc1 gets cross-cycle value for X = 0 (initial)
      //   sc1 output = clamp(100 * 0 / 100) = 0
      //   inverter output = clamp(0 * -100 / 100) = 0
      //   cross-cycle update: inv output = 0
      // Cycle 1: sc1 gets cross-cycle X = 0
      //   sc1 output = clamp(100 * 0 / 100) = 0
      //   inverter output = 0
      // Stays at 0,0,0,0

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        constantInputs([100]),
        4,
      ));

      // All zeros since feedback starts at 0 and stays there
      expect(result.outputValues[0][0]).toBe(0);
      expect(result.outputValues[1][0]).toBe(0);
      expect(result.outputValues[2][0]).toBe(0);
      expect(result.outputValues[3][0]).toBe(0);
    });
  });

  describe('signal cycle detection', () => {
    it('detects signal cycles', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('a', makeChip('a', 'offset', 2, 1));
      chips.set('b', makeChip('b', 'offset', 2, 1));

      const paths: Path[] = [
        makePath('w1', 'a', 0, 'b', 0),
        makePath('w2', 'b', 0, 'a', 0),
      ];

      const result = evaluateAllCycles(
        chips,
        paths,
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
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        (cycle) => [cycle],
        4,
      ));

      // Wire w1 carries input signal
      const w1Values = result.pathValues.get('w1')!;
      expect(w1Values).toEqual([0, 1, 2, 3]);

      // Wire w2 carries inverted signal
      const w2Values = result.pathValues.get('w2')!;
      expect(w2Values).toEqual([0, -1, -2, -3]);
    });
  });

  describe('node outputs tracking', () => {
    it('records per-node outputs per cycle', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        (cycle) => [cycle * 10],
        4,
      ));

      const invOutputs = result.chipOutputs.get('inv')!;
      expect(invOutputs[0]).toEqual([0]);
      expect(invOutputs[1]).toEqual([-10]);
      expect(invOutputs[2]).toEqual([-20]);
      expect(invOutputs[3]).toEqual([-30]);
    });
  });

  describe('multiple outputs', () => {
    it('handles multiple output CPs', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('__cp_output_1__', makeChip('__cp_output_1__', 'connection-output', 1, 0));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_output_0__', 0),
        makePath('w3', '__cp_input_0__', 0, '__cp_output_1__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
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
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_creative_0__', makeChip('__cp_creative_0__', 'connection-input', 0, 1));
      chips.set('__cp_creative_3__', makeChip('__cp_creative_3__', 'connection-output', 1, 0));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_creative_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_creative_3__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        constantInputs([60]),
        4,
      ));

      // Slot 3 → output index 3 (slot index used directly)
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][3]).toBe(-60);
      }
    });

    it('handles multiple creative output slots', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_creative_0__', makeChip('__cp_creative_0__', 'connection-input', 0, 1));
      chips.set('__cp_creative_3__', makeChip('__cp_creative_3__', 'connection-output', 1, 0));
      chips.set('__cp_creative_4__', makeChip('__cp_creative_4__', 'connection-output', 1, 0));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_creative_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_creative_3__', 0),
        makePath('w3', '__cp_creative_0__', 0, '__cp_creative_4__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        constantInputs([40]),
        4,
      ));

      // Slots 3,4 → output indices 3,4
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][3]).toBe(-40); // inverted
        expect(result.outputValues[i][4]).toBe(40);  // passthrough
      }
    });

    it('preserves output index when a slot is missing (gap)', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_creative_0__', makeChip('__cp_creative_0__', 'connection-input', 0, 1));
      chips.set('__cp_creative_4__', makeChip('__cp_creative_4__', 'connection-output', 1, 0));
      chips.set('__cp_creative_5__', makeChip('__cp_creative_5__', 'connection-output', 1, 0));
      chips.set('inv', makeChip('inv', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_creative_0__', 0, 'inv', 0),
        makePath('w2', 'inv', 0, '__cp_creative_4__', 0),
        makePath('w3', '__cp_creative_0__', 0, '__cp_creative_5__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        constantInputs([50]),
        4,
      ));

      // Slots 4,5 → output indices 4,5; indices 0-3 are 0 (no slots)
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][3]).toBe(0);   // no slot 3
        expect(result.outputValues[i][4]).toBe(-50);  // inverted
        expect(result.outputValues[i][5]).toBe(50);   // passthrough
      }
    });
  });

  describe('processingOrder', () => {
    it('includes non-CP nodes in topological order', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('inv1', makeChip('inv1', 'scale', 2, 1));
      chips.set('inv2', makeChip('inv2', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv1', 0),
        makePath('w2', 'inv1', 0, 'inv2', 0),
        makePath('w3', 'inv2', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('inv1:1', -100);
      portConstants.set('inv2:1', -100);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        portConstants,
        constantInputs([42]),
        4,
      ));

      expect(result.processingOrder).toContain('inv1');
      expect(result.processingOrder).toContain('inv2');
      expect(result.processingOrder).not.toContain('__cp_input_0__');
      expect(result.processingOrder).not.toContain('__cp_output_0__');
      expect(result.processingOrder.indexOf('inv1')).toBeLessThan(
        result.processingOrder.indexOf('inv2'),
      );
    });

    it('is empty for graph with only CPs', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        constantInputs([77]),
        4,
      ));

      expect(result.processingOrder).toEqual([]);
    });
  });

  describe('nodeDepths', () => {
    it('assigns depths for linear chain', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('inv1', makeChip('inv1', 'scale', 2, 1));
      chips.set('inv2', makeChip('inv2', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv1', 0),
        makePath('w2', 'inv1', 0, 'inv2', 0),
        makePath('w3', 'inv2', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips, paths, new Map(), constantInputs([42]), 4,
      ));

      expect(result.chipDepths.get('__cp_input_0__')).toBe(0);
      expect(result.chipDepths.get('inv1')).toBe(1);
      expect(result.chipDepths.get('inv2')).toBe(2);
      expect(result.chipDepths.get('__cp_output_0__')).toBe(3);
      expect(result.maxDepth).toBe(3);
    });

    it('assigns same depth to parallel nodes', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('__cp_output_1__', makeChip('__cp_output_1__', 'connection-output', 1, 0));
      chips.set('inv1', makeChip('inv1', 'scale', 2, 1));
      chips.set('inv2', makeChip('inv2', 'scale', 2, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'inv1', 0),
        makePath('w2', '__cp_input_0__', 0, 'inv2', 0),
        makePath('w3', 'inv1', 0, '__cp_output_0__', 0),
        makePath('w4', 'inv2', 0, '__cp_output_1__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips, paths, new Map(), constantInputs([42]), 4,
      ));

      expect(result.chipDepths.get('inv1')).toBe(1);
      expect(result.chipDepths.get('inv2')).toBe(1);
      expect(result.maxDepth).toBe(2);
    });

    it('maxDepth is 0 for CP-only graph', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips, paths, new Map(), constantInputs([77]), 4,
      ));

      expect(result.chipDepths.get('__cp_input_0__')).toBe(0);
      expect(result.chipDepths.get('__cp_output_0__')).toBe(1);
      expect(result.maxDepth).toBe(1);
    });
  });

  describe('node liveness', () => {
    it('disconnected threshold(0) produces 0 output (not +100)', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      // Disconnected threshold node — not wired to any input
      chips.set('thresh', makeChip('thresh', 'threshold', 2, 1, { level: 0 }));

      // Only wire connects thresh to output, but nothing feeds thresh
      const paths: Path[] = [
        makePath('w1', 'thresh', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips, paths, new Map(), constantInputs([50]), 4,
      ));

      // Threshold is NOT live (no input source reaches it), so it outputs 0
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(0);
      }
    });

    it('liveNodeIds includes connected nodes and excludes disconnected', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('connected', makeChip('connected', 'scale', 2, 1));
      chips.set('disconnected', makeChip('disconnected', 'threshold', 2, 1, { level: 0 }));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'connected', 0),
        makePath('w2', 'connected', 0, '__cp_output_0__', 0),
      ];

      const portConstants = new Map<string, number>();
      portConstants.set('connected:1', 100); // unity scale

      const result = unwrap(evaluateAllCycles(
        chips, paths, portConstants, constantInputs([42]), 4,
      ));

      expect(result.liveChipIds.has('__cp_input_0__')).toBe(true);
      expect(result.liveChipIds.has('connected')).toBe(true);
      expect(result.liveChipIds.has('__cp_output_0__')).toBe(true);
      expect(result.liveChipIds.has('disconnected')).toBe(false);
    });

    it('connected threshold evaluates normally', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('thresh', makeChip('thresh', 'threshold', 2, 1, { level: 0 }));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'thresh', 0),
        makePath('w2', 'thresh', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips, paths, new Map(), constantInputs([50]), 4,
      ));

      // Connected threshold(level=0): 50 >= 0 → +100
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(100);
      }
      expect(result.liveChipIds.has('thresh')).toBe(true);
    });
  });

  describe('empty graph', () => {
    it('handles graph with no processing nodes', () => {
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        constantInputs([77]),
        4,
      ));

      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(77);
      }
    });
  });

  describe('custom baked node evaluation', () => {
    it('evaluates a custom node using bake metadata', () => {
      // Build a bake metadata for a "negate" node:
      // Internal graph: CP_in_0 → negate → CP_out_0
      const bakeMetadata = {
        topoOrder: ['__cp_input_0__', 'inner-negate', '__cp_output_0__'],
        chipConfigs: [
          { id: '__cp_input_0__', type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
          { id: 'inner-negate', type: 'negate', params: {}, socketCount: 1, plugCount: 1 },
          { id: '__cp_output_0__', type: 'connection-output', params: {}, socketCount: 1, plugCount: 0 },
        ],
        edges: [
          { fromChipId: '__cp_input_0__', fromPort: 0, toChipId: 'inner-negate', toPort: 0 },
          { fromChipId: 'inner-negate', fromPort: 0, toChipId: '__cp_output_0__', toPort: 0 },
        ],
        socketCount: 1,
        plugCount: 1,
      };

      // Outer graph: CP_in_0 → custom_node → CP_out_0
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('custom1', makeChip('custom1', 'puzzle:my-negate', 1, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'custom1', 0),
        makePath('w2', 'custom1', 0, '__cp_output_0__', 0),
      ];

      const customNodeMetadata = new Map();
      customNodeMetadata.set('puzzle:my-negate', bakeMetadata);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        constantInputs([50]),
        4,
        customNodeMetadata,
      ));

      // Custom negate node: output = -input = -50
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(-50);
      }
    });

    it('evaluates direct CP-to-CP pass-through in baked custom node', () => {
      // Bake metadata for pass-through: CP_in_0 → CP_out_0 (no processing nodes)
      const bakeMetadata = {
        topoOrder: ['__cp_input_0__', '__cp_output_0__'],
        chipConfigs: [
          { id: '__cp_input_0__', type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
          { id: '__cp_output_0__', type: 'connection-output', params: {}, socketCount: 1, plugCount: 0 },
        ],
        edges: [
          { fromChipId: '__cp_input_0__', fromPort: 0, toChipId: '__cp_output_0__', toPort: 0 },
        ],
        socketCount: 1,
        plugCount: 1,
      };

      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('passthru', makeChip('passthru', 'puzzle:passthru', 1, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'passthru', 0),
        makePath('w2', 'passthru', 0, '__cp_output_0__', 0),
      ];

      const customNodeMetadata = new Map();
      customNodeMetadata.set('puzzle:passthru', bakeMetadata);

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        constantInputs([75]),
        4,
        customNodeMetadata,
      ));

      // Pass-through: output = input = 75
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(75);
      }
    });

    it('skips unknown custom nodes gracefully', () => {
      // Custom node with no metadata — should produce zero outputs
      const chips = new Map<ChipId, ChipState>();
      chips.set('__cp_input_0__', makeChip('__cp_input_0__', 'connection-input', 0, 1));
      chips.set('__cp_output_0__', makeChip('__cp_output_0__', 'connection-output', 1, 0));
      chips.set('unknown', makeChip('unknown', 'puzzle:nonexistent', 1, 1));

      const paths: Path[] = [
        makePath('w1', '__cp_input_0__', 0, 'unknown', 0),
        makePath('w2', 'unknown', 0, '__cp_output_0__', 0),
      ];

      const result = unwrap(evaluateAllCycles(
        chips,
        paths,
        new Map(),
        constantInputs([50]),
        4,
        new Map(), // no metadata for this type
      ));

      // Unknown custom node skipped — output stays 0
      for (let i = 0; i < 4; i++) {
        expect(result.outputValues[i][0]).toBe(0);
      }
    });
  });
});
