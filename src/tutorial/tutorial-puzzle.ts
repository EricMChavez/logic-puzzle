import type { PuzzleDefinition, SlotConfig, ConnectionPointConfig, WaveformDef } from '../puzzle/types.ts';

/**
 * Waveform used as tutorial input: sine half-wave, amplitude 50, period 128.
 * Produces a non-trivial signal that's easy to visually understand.
 */
const TUTORIAL_INPUT: WaveformDef = {
  shape: 'sine-half', amplitude: 50, period: 128, phase: 0, offset: 0,
};

/** 1 centered input, 1 centered output */
const SLOT_CONFIG: SlotConfig = [
  { active: false, direction: 'input' },
  { active: true, direction: 'input' },
  { active: false, direction: 'input' },
  { active: false, direction: 'output' },
  { active: true, direction: 'output' },
  { active: false, direction: 'output' },
];

const CONNECTION_POINTS: ConnectionPointConfig = {
  left: [
    { active: false, direction: 'input' },
    { active: true, direction: 'input', cpIndex: 0 },
    { active: false, direction: 'input' },
  ],
  right: [
    { active: false, direction: 'output' },
    { active: true, direction: 'output', cpIndex: 0 },
    { active: false, direction: 'output' },
  ],
};

/**
 * Tutorial puzzle — used by the interactive tutorial system.
 *
 * Single test case: Offset +50 — requires an Offset chip set to +50.
 */
export const TUTORIAL_PUZZLE: PuzzleDefinition = {
  id: 'tutorial-interactive',
  title: 'Tutorial',
  description: 'Learn the basics of signal wiring and chip placement.',
  activeInputs: 1,
  activeOutputs: 1,
  allowedChips: { offset: 1 },
  testCases: [
    {
      name: 'Offset +50',
      inputs: [TUTORIAL_INPUT],
      expectedOutputs: [
        { shape: 'sine-half', amplitude: 50, period: 128, phase: 0, offset: 50 },
      ],
    },
  ],
  slotConfig: SLOT_CONFIG,
  connectionPoints: CONNECTION_POINTS,
};
