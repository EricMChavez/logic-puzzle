import type { PuzzleDefinition } from '../types.ts';
import { TUTORIAL_PASSTHROUGH, TUTORIAL_INVERT, TUTORIAL_MIX } from './tutorial-levels.ts';

/** All available puzzle levels in order */
export const PUZZLE_LEVELS: PuzzleDefinition[] = [
  TUTORIAL_PASSTHROUGH,
  TUTORIAL_INVERT,
  TUTORIAL_MIX,
];

/** Look up a puzzle by its ID. Returns undefined if not found. */
export function getPuzzleById(id: string): PuzzleDefinition | undefined {
  return PUZZLE_LEVELS.find((p) => p.id === id);
}
