import { describe, it, expect } from 'vitest';
import { evaluateAllCycles } from '../../engine/evaluation/cycle-evaluator';
import type { NodeState, Wire, NodeId } from '../../shared/types/index';
import { generateWaveformValue } from '../waveform-generators';
import {
  TUTORIAL_01,
  TUTORIAL_02,
  TUTORIAL_03,
  TUTORIAL_04,
  TUTORIAL_05,
  TUTORIAL_06,
} from './tutorial-levels';
import type { PuzzleDefinition, WaveformDef } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function makeNode(
  id: string,
  type: string,
  inputCount: number,
  outputCount: number,
  params: Record<string, number | string | boolean> = {},
): NodeState {
  return { id, type, position: { col: 0, row: 0 }, params, inputCount, outputCount };
}

function makeWire(
  id: string,
  sourceNodeId: string,
  sourcePort: number,
  targetNodeId: string,
  targetPort: number,
): Wire {
  return {
    id,
    source: { chipId: sourceNodeId, portIndex: sourcePort, side: 'output' },
    target: { chipId: targetNodeId, portIndex: targetPort, side: 'input' },
    route: [],
  };
}

function getExpectedSamples(def: WaveformDef): number[] {
  return Array.from({ length: 256 }, (_, i) => generateWaveformValue(i, def));
}

/** Verify that a solution graph produces outputs matching the puzzle's expected outputs (±5 tolerance). */
function assertOutputsMatch(
  puzzle: PuzzleDefinition,
  nodes: Map<NodeId, NodeState>,
  wires: Wire[],
  portConstants: Map<string, number>,
) {
  const testCase = puzzle.testCases[0];
  const inputGenerator = (cycle: number) =>
    testCase.inputs.map((def) => generateWaveformValue(cycle, def));

  const result = evaluateAllCycles(nodes, wires, portConstants, inputGenerator, 256);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const { outputValues } = result.value;

  for (let outIdx = 0; outIdx < testCase.expectedOutputs.length; outIdx++) {
    const expected = getExpectedSamples(testCase.expectedOutputs[outIdx]);
    for (let cycle = 0; cycle < 256; cycle++) {
      const actual = outputValues[cycle][outIdx];
      const exp = expected[cycle];
      expect(Math.abs(actual - exp)).toBeLessThanOrEqual(5);
    }
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Tutorial levels solvability', () => {
  it('Tutorial 01: First Signal — direct wire', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
    nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));

    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, '__cp_output_0__', 0),
    ];

    assertOutputsMatch(TUTORIAL_01, nodes, wires, new Map());
  });

  it('Tutorial 02: Shift — offset node with amount=50', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
    nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
    nodes.set('offset1', makeNode('offset1', 'offset', 2, 1, { amount: 50 }));

    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'offset1', 0),
      makeWire('w2', 'offset1', 0, '__cp_output_0__', 0),
    ];

    const portConstants = new Map<string, number>();
    portConstants.set('offset1:1', 50);

    assertOutputsMatch(TUTORIAL_02, nodes, wires, portConstants);
  });

  it('Tutorial 03: Attenuator — scale node with factor=50', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
    nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
    nodes.set('scale1', makeNode('scale1', 'scale', 2, 1, { factor: 50 }));

    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'scale1', 0),
      makeWire('w2', 'scale1', 0, '__cp_output_0__', 0),
    ];

    const portConstants = new Map<string, number>();
    portConstants.set('scale1:1', 50);

    assertOutputsMatch(TUTORIAL_03, nodes, wires, portConstants);
  });

  it('Tutorial 04: Rectifier — max node with B defaulting to 0', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
    nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
    nodes.set('max1', makeNode('max1', 'max', 2, 1));

    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'max1', 0),
      makeWire('w2', 'max1', 0, '__cp_output_0__', 0),
    ];

    assertOutputsMatch(TUTORIAL_04, nodes, wires, new Map());
  });

  it('Tutorial 05: Square Wave — threshold at 0', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
    nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
    nodes.set('thresh1', makeNode('thresh1', 'threshold', 2, 1, { level: 0 }));

    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'thresh1', 0),
      makeWire('w2', 'thresh1', 0, '__cp_output_0__', 0),
    ];

    const portConstants = new Map<string, number>();
    portConstants.set('thresh1:1', 0);

    assertOutputsMatch(TUTORIAL_05, nodes, wires, portConstants);
  });

  it('Tutorial 06: Two Paths — split + scale for inversion', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 1));
    nodes.set('__cp_output_0__', makeNode('__cp_output_0__', 'connection-output', 1, 0));
    nodes.set('__cp_output_1__', makeNode('__cp_output_1__', 'connection-output', 1, 0));
    nodes.set('split1', makeNode('split1', 'split', 1, 2));
    nodes.set('scale1', makeNode('scale1', 'scale', 2, 1, { factor: -100 }));

    const wires: Wire[] = [
      makeWire('w1', '__cp_input_0__', 0, 'split1', 0),
      makeWire('w2', 'split1', 0, '__cp_output_0__', 0),
      makeWire('w3', 'split1', 1, 'scale1', 0),
      makeWire('w4', 'scale1', 0, '__cp_output_1__', 0),
    ];

    const portConstants = new Map<string, number>();
    portConstants.set('scale1:1', -100);

    assertOutputsMatch(TUTORIAL_06, nodes, wires, portConstants);
  });
});
