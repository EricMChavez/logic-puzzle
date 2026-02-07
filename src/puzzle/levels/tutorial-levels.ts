import type { PuzzleDefinition } from '../types.ts';

/** Tutorial 1: Rectifier — max(input, 0) using Mix Max with constant 0 */
export const TUTORIAL_RECTIFIER: PuzzleDefinition = {
  id: 'tutorial-rectifier',
  title: 'Rectifier',
  description:
    'Build a half-wave rectifier: output the input when it is positive, and zero otherwise. Use a Mix node in Max mode with a constant-zero signal.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Sine amp=100 period=256',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'rectified-sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle amp=80 period=256',
      inputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'rectified-triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square amp=60 period=256',
      inputs: [
        { shape: 'square', amplitude: 60, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 30, period: 256, phase: 0, offset: 30 },
      ],
    },
  ],
};

/** Tutorial 2: Amplifier 2× — add input to itself */
export const TUTORIAL_AMPLIFIER: PuzzleDefinition = {
  id: 'tutorial-amplifier',
  title: 'Amplifier 2×',
  description:
    'Double the input signal. Use a Mix node in Add mode to combine the input with itself.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Sine amp=50 period=256',
      inputs: [
        { shape: 'sine', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle amp=40 period=256',
      inputs: [
        { shape: 'triangle', amplitude: 40, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square amp=50 period=256',
      inputs: [
        { shape: 'square', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};

/** Tutorial 3: DC Offset +50 — add constant 50 to the input */
export const TUTORIAL_DC_OFFSET: PuzzleDefinition = {
  id: 'tutorial-dc-offset',
  title: 'DC Offset +50',
  description:
    'Shift the input signal upward by 50 units. Use a Mix node in Add mode with a constant input of 50.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Sine amp=50 period=256',
      inputs: [
        { shape: 'sine', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'sine', amplitude: 50, period: 256, phase: 0, offset: 50 },
      ],
    },
    {
      name: 'Triangle amp=40 period=256',
      inputs: [
        { shape: 'triangle', amplitude: 40, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 40, period: 256, phase: 0, offset: 50 },
      ],
    },
    {
      name: 'Square amp=50 period=256',
      inputs: [
        { shape: 'square', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 50, period: 256, phase: 0, offset: 50 },
      ],
    },
  ],
};

/** Tutorial 4: Clipper ±50 — clamp signal to [-50, +50] using Min + Max */
export const TUTORIAL_CLIPPER: PuzzleDefinition = {
  id: 'tutorial-clipper',
  title: 'Clipper ±50',
  description:
    'Clip the input signal to the range [-50, +50]. Use two Mix nodes: one in Min mode (cap at +50) and one in Max mode (floor at -50).',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['mix'],
  testCases: [
    {
      name: 'Sine amp=100 period=256 (clipped)',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'clipped-sine', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle amp=30 period=256 (pass-through)',
      inputs: [
        { shape: 'triangle', amplitude: 30, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'triangle', amplitude: 30, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Square amp=80 period=256 (clipped)',
      inputs: [
        { shape: 'square', amplitude: 80, period: 256, phase: 0, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 50, period: 256, phase: 0, offset: 0 },
      ],
    },
  ],
};

/** Tutorial 5: Square Wave Generator — threshold at 0 */
export const TUTORIAL_SQUARE_GEN: PuzzleDefinition = {
  id: 'tutorial-square-gen',
  title: 'Square Wave Generator',
  description:
    'Convert any waveform into a square wave. Use a Threshold node: output +100 when the input is positive, -100 when negative.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedNodes: ['threshold'],
  testCases: [
    {
      name: 'Sine → square',
      inputs: [
        { shape: 'sine', amplitude: 100, period: 256, phase: 1, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 100, period: 256, phase: 0, offset: 0 },
      ],
    },
    {
      name: 'Triangle → square',
      inputs: [
        { shape: 'triangle', amplitude: 100, period: 256, phase: 1, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 100, period: 256, phase: -64, offset: 0 },
      ],
    },
    {
      name: 'Sawtooth → square',
      inputs: [
        { shape: 'sawtooth', amplitude: 100, period: 256, phase: 1, offset: 0 },
      ],
      expectedOutputs: [
        { shape: 'square', amplitude: 100, period: 256, phase: -128, offset: 0 },
      ],
    },
  ],
};
