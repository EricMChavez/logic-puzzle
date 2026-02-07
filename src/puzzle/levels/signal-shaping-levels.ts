import type { PuzzleDefinition } from '../types.ts';

/** Level 6: Inverter — negate the signal */
export const SIGNAL_INVERTER: PuzzleDefinition = {
  id: 'signal-inverter',
  title: 'Inverter',
  description:
    'Negate the input signal: output = -input. Use an Invert node to flip the signal.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['invert'],
  testCases: [
    {
      name: 'Sine amp=100 period=256',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 128, offset: 0 },
      ],
    },
    {
      name: 'Triangle amp=80 period=256',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 128, offset: 0 },
      ],
    },
    {
      name: 'Square amp=60 period=256',
      inputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 128, offset: 0 },
      ],
    },
  ],
};

/** Level 7: Attenuator — halve amplitude */
export const SIGNAL_ATTENUATOR: PuzzleDefinition = {
  id: 'signal-attenuator',
  title: 'Attenuator',
  description:
    'Halve the input signal amplitude: output = input × 50 / 100. Use a Multiply node with a constant 50.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['multiply'],
  testCases: [
    {
      name: 'Sine amp=100 period=256',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle amp=80 period=256',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 40, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square amp=60 period=256',
      inputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 30, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};

/** Level 8: Full-Wave Rectifier — absolute value */
export const SIGNAL_FULLWAVE_RECTIFIER: PuzzleDefinition = {
  id: 'signal-fullwave-rectifier',
  title: 'Full-Wave Rectifier',
  description:
    'Compute the absolute value of the input: output = |input|. Use a Mix node and an Invert node to combine the signal with its negation via max.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['mix', 'invert'],
  testCases: [
    {
      name: 'Sine amp=100 period=256',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'fullwave-rectified-sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle amp=80 period=256',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'fullwave-rectified-triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square amp=60 period=256',
      inputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'constant', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};

/** Level 9: Signal Delay — delay by 1 WTS */
export const SIGNAL_DELAY: PuzzleDefinition = {
  id: 'signal-delay',
  title: 'Signal Delay',
  description:
    'Delay the input signal by 1 WTS: output(t) = input(t - 16). Use a Delay node set to 1 WTS.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['delay'],
  testCases: [
    {
      name: 'Sine amp=100 period=256',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: -16, offset: 0 },
      ],
    },
    {
      name: 'Triangle amp=80 period=256',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: -16, offset: 0 },
      ],
    },
    {
      name: 'Square amp=60 period=256',
      inputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: -16, offset: 0 },
      ],
    },
  ],
};
