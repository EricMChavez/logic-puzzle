import type { PuzzleDefinition } from '../types.ts';

/** Level 10: Difference Amplifier — subtract B from A */
export const TIMING_DIFFERENCE: PuzzleDefinition = {
  id: 'timing-difference',
  title: 'Difference Amplifier',
  description:
    'Subtract the second input from the first: output = A - B. Use a Mix node in Subtract mode.',
  activeInputs: 2,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Sine 100 - Sine 60',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
        { shape: 'sine', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 40, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle 80 - Triangle 30',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
        { shape: 'triangle', amplitude: 30, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square 100 - Square 40',
      inputs: [
        { shape: 'square', amplitude: 100, period: 256, phase: 0, offset: 0 },
        { shape: 'square', amplitude: 40, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};

/** Level 11: Crossfader — average two inputs */
export const TIMING_CROSSFADER: PuzzleDefinition = {
  id: 'timing-crossfader',
  title: 'Crossfader',
  description:
    'Average the two inputs: output = (A + B) / 2. Use a Mix node in Average mode.',
  activeInputs: 2,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Sine avg(80, 40)',
      inputs: [
        { shape: 'sine', amplitude: 80, period: 256, phase: 0, offset: 0 },
        { shape: 'sine', amplitude: 40, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle avg(100, 60)',
      inputs: [
        { shape: 'triangle', amplitude: 100, period: 256, phase: 0, offset: 0 },
        { shape: 'triangle', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square avg(80, 40)',
      inputs: [
        { shape: 'square', amplitude: 80, period: 256, phase: 0, offset: 0 },
        { shape: 'square', amplitude: 40, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};

/** Level 12: Ring Modulator — multiply two inputs */
export const TIMING_RING_MODULATOR: PuzzleDefinition = {
  id: 'timing-ring-modulator',
  title: 'Ring Modulator',
  description:
    'Multiply the two inputs together: output = (A × B) / 100. Use a Multiply node.',
  activeInputs: 2,
  activeOutputs: 1,
  allowedNodes: ['multiply'],
  testCases: [
    {
      name: 'Sine × Square → fullwave-rectified-sine',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
        { shape: 'square', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'fullwave-rectified-sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle × Square → sawtooth',
      inputs: [
        { shape: 'triangle', amplitude: 100, period: 256, phase: 0, offset: 0 },
        { shape: 'square', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sawtooth', amplitude: 100, period: 128, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square × Square → constant',
      inputs: [
        { shape: 'square', amplitude: 80, period: 256, phase: 0, offset: 0 },
        { shape: 'square', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'constant', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};
