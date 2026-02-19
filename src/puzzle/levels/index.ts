import type { PuzzleDefinition } from '../types.ts';
import { TEST_PUZZLE, TEST, BIG_TEST, LEVEL_1 } from './tutorial-levels.ts';
/** All available puzzle levels in order (populated as players solve puzzles) */
export const PUZZLE_LEVELS: PuzzleDefinition[] = [LEVEL_1, TEST_PUZZLE, TEST, BIG_TEST  ];

/** Look up a puzzle by its ID. Returns undefined if not found. */
export function getPuzzleById(id: string): PuzzleDefinition | undefined {
  return PUZZLE_LEVELS.find((p) => p.id === id);
}
