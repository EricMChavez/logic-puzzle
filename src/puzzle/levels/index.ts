import type { PuzzleDefinition } from '../types.ts';

// Import level constants from each file as they're added:
// import { TUTORIAL_EXAMPLE } from './tutorial-levels.ts';
// import { SIGNAL_EXAMPLE } from './signal-shaping-levels.ts';
// import { TIMING_EXAMPLE } from './timing-levels.ts';
// import { ADVANCED_EXAMPLE } from './advanced-levels.ts';
import { POLARIZER } from './tutorial-levels.ts';
/** All available puzzle levels in order */
export const PUZZLE_LEVELS: PuzzleDefinition[] = [
  // Add levels here in play order as they're created
  POLARIZER
];

/** Look up a puzzle by its ID. Returns undefined if not found. */
export function getPuzzleById(id: string): PuzzleDefinition | undefined {
  return PUZZLE_LEVELS.find((p) => p.id === id);
}
