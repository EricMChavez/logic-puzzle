import type { StateCreator } from 'zustand';
import type { PuzzleDefinition } from '../../puzzle/types.ts';

export interface PuzzleSlice {
  /** The currently active puzzle, or null for sandbox mode */
  activePuzzle: PuzzleDefinition | null;
  /** Index of the active test case within the puzzle */
  activeTestCaseIndex: number;
  /** Per-output-port match result for the latest tick */
  perPortMatch: boolean[];
  /** Overall puzzle state */
  puzzleStatus: 'playing' | 'victory';
  /** Indices of test cases that have reached victory threshold */
  testCasesPassed: number[];

  /** Load a puzzle definition (entering puzzle mode) */
  loadPuzzle: (puzzle: PuzzleDefinition) => void;
  /** Unload the current puzzle (returning to sandbox mode) */
  unloadPuzzle: () => void;
  /** Switch to a different test case within the active puzzle */
  setActiveTestCase: (index: number) => void;
  /** Update validation state each tick */
  updateValidation: (perPortMatch: boolean[], allMatch: boolean) => void;
  /** Advance to next unpassed test case, or set victory if all passed */
  advanceTestCase: () => void;
}

const initialValidationState = {
  perPortMatch: [] as boolean[],
  puzzleStatus: 'playing' as const,
  testCasesPassed: [] as number[],
};

export const createPuzzleSlice: StateCreator<PuzzleSlice> = (set) => ({
  activePuzzle: null,
  activeTestCaseIndex: 0,
  ...initialValidationState,

  loadPuzzle: (puzzle) =>
    set({ activePuzzle: puzzle, activeTestCaseIndex: 0, ...initialValidationState }),

  unloadPuzzle: () =>
    set({ activePuzzle: null, activeTestCaseIndex: 0, ...initialValidationState }),

  setActiveTestCase: (index) =>
    set((state) => {
      const len = state.activePuzzle?.testCases.length ?? 0;
      if (len === 0) return {};
      return { activeTestCaseIndex: Math.max(0, Math.min(index, len - 1)) };
    }),

  updateValidation: (perPortMatch, allMatch) =>
    set((state) => {
      if (allMatch) {
        const passed = state.testCasesPassed.includes(state.activeTestCaseIndex)
          ? state.testCasesPassed
          : [...state.testCasesPassed, state.activeTestCaseIndex];
        return {
          perPortMatch,
          testCasesPassed: passed,
        };
      }

      return { perPortMatch };
    }),

  advanceTestCase: () =>
    set((state) => {
      if (!state.activePuzzle) return {};
      const totalCases = state.activePuzzle.testCases.length;

      // Check if all test cases are passed
      if (state.testCasesPassed.length >= totalCases) {
        return { puzzleStatus: 'victory' as const };
      }

      // Find next unpassed test case
      for (let i = 0; i < totalCases; i++) {
        if (!state.testCasesPassed.includes(i)) {
          return {
            activeTestCaseIndex: i,
            perPortMatch: [],
          };
        }
      }

      return { puzzleStatus: 'victory' as const };
    }),
});
