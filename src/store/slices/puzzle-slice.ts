import type { StateCreator } from 'zustand';
import type { PuzzleDefinition } from '../../puzzle/types.ts';

export interface PuzzleSlice {
  /** The currently active puzzle, or null for sandbox mode */
  activePuzzle: PuzzleDefinition | null;
  /** Index of the active test case within the puzzle */
  activeTestCaseIndex: number;

  /** Load a puzzle definition (entering puzzle mode) */
  loadPuzzle: (puzzle: PuzzleDefinition) => void;
  /** Unload the current puzzle (returning to sandbox mode) */
  unloadPuzzle: () => void;
  /** Switch to a different test case within the active puzzle */
  setActiveTestCase: (index: number) => void;
}

export const createPuzzleSlice: StateCreator<PuzzleSlice> = (set) => ({
  activePuzzle: null,
  activeTestCaseIndex: 0,

  loadPuzzle: (puzzle) =>
    set({ activePuzzle: puzzle, activeTestCaseIndex: 0 }),

  unloadPuzzle: () =>
    set({ activePuzzle: null, activeTestCaseIndex: 0 }),

  setActiveTestCase: (index) =>
    set({ activeTestCaseIndex: index }),
});
