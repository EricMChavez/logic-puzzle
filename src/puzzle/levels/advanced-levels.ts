import type { PuzzleDefinition } from '../types.ts';

/** Level 13: Signal Splitter — split into positive/negative halves */
export const ADVANCED_SPLITTER: PuzzleDefinition = {
  id: 'advanced-splitter',
  title: 'Signal Splitter',
  description:
    'Split the input into its positive and negative halves: out_A = max(input, 0), out_B = max(-input, 0). Use any nodes you need.',
  activeInputs: 1,
  activeOutputs: 2,
  allowedNodes: null,
  testCases: [
    {
      name: 'Sine split',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'rectified-sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
        { shape: 'rectified-sine', amplitude: 100, period: 256, phase: 128, offset: 0 },
      ],
    },
    {
      name: 'Triangle split',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'rectified-triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
        { shape: 'rectified-triangle', amplitude: 80, period: 256, phase: 128, offset: 0 },
      ],
    },
    {
      name: 'Square split',
      inputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 30, period: 256, phase: 0, offset: 30 },
        { shape: 'square', amplitude: 30, period: 256, phase: 128, offset: 30 },
      ],
    },
  ],
};

/** Level 14: Gain Stage — scale to half then shift up by 50 */
export const ADVANCED_GAIN_STAGE: PuzzleDefinition = {
  id: 'advanced-gain-stage',
  title: 'Gain Stage',
  description:
    'Scale the input to half amplitude then shift up by 50: output = input/2 + 50. Use a Multiply node with constant 50, then add constant 50.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: null,
  testCases: [
    {
      name: 'Sine half + 50',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 50, period: 256, phase: 0, offset: 50 },
      ],
    },
    {
      name: 'Triangle half + 50',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 40, period: 256, phase: 0, offset: 50 },
      ],
    },
    {
      name: 'Square half + 50',
      inputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 30, period: 256, phase: 0, offset: 50 },
      ],
    },
  ],
};

/** Level 15: Quadrupler — amplify by 4× via chained additions */
export const ADVANCED_QUADRUPLER: PuzzleDefinition = {
  id: 'advanced-quadrupler',
  title: 'Quadrupler',
  description:
    'Amplify the input signal by 4×: output = 4 × input. Chain two Mix Add nodes: (A+A) + (A+A).',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Sine 25 → 100',
      inputs: [
        { shape: 'sine', amplitude: 25, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle 20 → 80',
      inputs: [
        { shape: 'triangle', amplitude: 20, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square 25 → 100',
      inputs: [
        { shape: 'square', amplitude: 25, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};
