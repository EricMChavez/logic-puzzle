import type { TutorialStep } from '../store/slices/tutorial-slice.ts';

/**
 * Tutorial steps for the interactive tutorial.
 *
 * Single phase (8 steps): offset +50 puzzle using the chip drawer.
 *
 * Grid reference (puzzle board):
 *   Left meters: cols 0-9
 *   Playable area: cols 10-55
 *   Right meters: cols 56-65
 *   Input CP (middle slot): ~col 10, row 18
 *   Output CP (middle slot): ~col 55, row 18
 */

export const TUTORIAL_STEPS: TutorialStep[] = [
  // Step 0: Welcome
  {
    id: 'welcome',
    text: 'Welcome! Match the input signal to the target output.',
    highlight: { type: 'none' },
    tooltipPosition: 'center',
    advanceOn: { type: 'next-button' },
  },

  // Step 1: Input meters
  {
    id: 'input-meters',
    text: 'This is your input signal.',
    subtext: 'The waveform shows what enters the board.',
    highlight: { type: 'meter-zone', side: 'left', slotIndex: 1 },
    tooltipPosition: 'right',
    advanceOn: { type: 'next-button' },
  },

  // Step 2: Output meters
  {
    id: 'output-meters',
    text: 'This is your target output (dashed line).',
    subtext: 'Match your output to this shape to win.',
    highlight: { type: 'meter-zone', side: 'right', slotIndex: 1 },
    tooltipPosition: 'left',
    advanceOn: { type: 'next-button' },
  },

  // Step 3: Place chip from drawer
  {
    id: 'place-chip',
    text: 'Drag an Offset chip from the drawer onto the board.',
    highlight: { type: 'full-board' },
    tooltipPosition: 'above',
    advanceOn: { type: 'node-placed', nodeType: 'offset' },
  },

  // Step 4: Wire input → chip
  {
    id: 'wire-input-to-chip',
    text: 'Click the input port, then the chip to draw a path.',
    highlight: { type: 'full-board' },
    tooltipPosition: 'above',
    cursor: {
      path: [
        { col: 11, row: 18 },
        { col: 30, row: 18 },
      ],
      clickAtEnd: true,
      durationMs: 1500,
      delayMs: 500,
      loop: true,
    },
    advanceOn: { type: 'wire-created' },
  },

  // Step 5: Wire chip → output
  {
    id: 'wire-chip-to-output',
    text: "Click the chip's output, then the board output.",
    highlight: { type: 'full-board' },
    tooltipPosition: 'above',
    cursor: {
      path: [
        { col: 36, row: 18 },
        { col: 54, row: 18 },
      ],
      clickAtEnd: true,
      durationMs: 1500,
      delayMs: 500,
      loop: true,
    },
    advanceOn: { type: 'wire-created' },
  },

  // Step 6: Adjust knob
  {
    id: 'adjust-knob',
    text: 'Click and drag the knob to set it to +50.',
    highlight: { type: 'full-board' },
    tooltipPosition: 'above',
    advanceOn: { type: 'validation-pass' },
  },

  // Step 7: Complete!
  {
    id: 'complete',
    text: "You're ready! Click to return to the main board.",
    subtext: 'Every puzzle you solve becomes a reusable chip.',
    highlight: { type: 'none' },
    tooltipPosition: 'center',
    advanceOn: { type: 'next-button' },
  },
];
