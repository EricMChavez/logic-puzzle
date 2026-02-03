import type { PuzzleDefinition } from '../types.ts';

/** Tutorial 1: Pass-Through — wire input directly to output */
export const TUTORIAL_PASSTHROUGH: PuzzleDefinition = {
  id: 'tutorial-passthrough',
  title: 'Pass-Through',
  description: 'Wire the input signal directly to the output. The output should match the input exactly.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: null,
  testCases: [
    {
      name: 'Sine wave',
      inputs: [
        { shape: 'sine', amplitude: 50, period: 32, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 50, period: 32, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square wave',
      inputs: [
        { shape: 'square', amplitude: 40, period: 16, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 40, period: 16, phase: 0, offset: 0 },
      ],
    },
  ],
};

/** Tutorial 2: Invert — negate the input signal */
export const TUTORIAL_INVERT: PuzzleDefinition = {
  id: 'tutorial-invert',
  title: 'Inverter',
  description: 'Use the Invert node to negate the input signal. The output should be the opposite of the input.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['invert'],
  testCases: [
    {
      name: 'Inverted sine',
      inputs: [
        { shape: 'sine', amplitude: 50, period: 32, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        // -sin(t) = sin(t + π) → phase shift by half period (16 ticks)
        { shape: 'sine', amplitude: 50, period: 32, phase: 16, offset: 0 },
      ],
    },
    {
      name: 'Inverted square',
      inputs: [
        { shape: 'square', amplitude: 60, period: 16, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        // Inverted square → phase shift by half period (8 ticks)
        { shape: 'square', amplitude: 60, period: 16, phase: 8, offset: 0 },
      ],
    },
  ],
};

/** Tutorial 3: Mixer — add two signals */
export const TUTORIAL_MIX: PuzzleDefinition = {
  id: 'tutorial-mix',
  title: 'Signal Mixer',
  description: 'Use the Mix node (Add mode) to combine both input signals. The output should be the sum of the two inputs.',
  activeInputs: 2,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Two sine waves (same frequency)',
      inputs: [
        { shape: 'sine', amplitude: 30, period: 32, phase: 0, offset: 0 },
        { shape: 'sine', amplitude: 20, period: 32, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        // Same frequency sines add linearly: amplitude 30 + 20 = 50
        { shape: 'sine', amplitude: 50, period: 32, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Sine plus constant',
      inputs: [
        { shape: 'sine', amplitude: 40, period: 32, phase: 0, offset: 0 },
        { shape: 'constant', amplitude: 25, period: 1, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        // Sine + constant = sine with DC offset
        { shape: 'sine', amplitude: 40, period: 32, phase: 0, offset: 25 },
      ],
    },
  ],
};
