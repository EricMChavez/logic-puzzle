import type { StateCreator } from 'zustand';
import type { ChipState, Path } from '../../shared/types/index.ts';

/** Authoring workflow phase */
export type AuthoringPhase = 'idle' | 'configuring-start' | 'saving';

/** Snapshot of board state at recording time */
export interface BoardSnapshot {
  chips: Map<string, ChipState>;
  paths: Path[];
}

export interface AuthoringSlice {
  /** Current authoring workflow phase */
  authoringPhase: AuthoringPhase;
  /** Captured output samples at the moment the author clicks "Record Target" */
  recordedTargetSamples: Map<number, number[]> | null;
  /** Board state at recording time (for "Reset to Solution") */
  solutionBoardSnapshot: BoardSnapshot | null;
  /** Draft card title shown live on the gameboard during authoring */
  tutorialTitleDraft: string;
  /** Draft tutorial message shown live on the gameboard during authoring */
  tutorialMessageDraft: string;

  /** Capture current outputs as target, snapshot board, transition to 'configuring-start' */
  beginRecordTarget: () => void;
  /** Restore board from solutionBoardSnapshot (only valid in 'configuring-start') */
  resetToSolution: () => void;
  /** Transition from 'configuring-start' to 'saving' (opens save dialog) */
  beginSaveAsPuzzle: () => void;
  /** Cancel authoring workflow, clear recorded state */
  cancelAuthoring: () => void;
  /** Update the draft card title (live preview on gameboard) */
  setTutorialTitleDraft: (title: string) => void;
  /** Update the draft tutorial message (live preview on gameboard) */
  setTutorialMessageDraft: (message: string) => void;
}

export const createAuthoringSlice: StateCreator<AuthoringSlice> = (set, get) => ({
  authoringPhase: 'idle',
  recordedTargetSamples: null,
  solutionBoardSnapshot: null,
  tutorialTitleDraft: '',
  tutorialMessageDraft: '',

  beginRecordTarget: () => {
    // Access other slices via composed store
    const store = get() as unknown as {
      cycleResults: { outputValues: number[][] } | null;
      creativeSlots: Array<{ direction: 'input' | 'output' | 'off' }>;
      activeBoard: { chips: Map<string, ChipState>; paths: Path[] } | null;
    };

    const { cycleResults, creativeSlots, activeBoard } = store;
    if (!cycleResults || !activeBoard) return;

    // Capture output samples from cycle results
    const targetSamples = new Map<number, number[]>();
    const outputCount = cycleResults.outputValues[0]?.length ?? 0;

    // Find output slots (indices 3-5 are right side)
    const outputSlotIndices: number[] = [];
    for (let i = 0; i < creativeSlots.length; i++) {
      if (creativeSlots[i].direction === 'output') {
        outputSlotIndices.push(i);
      }
    }

    for (const slotIndex of outputSlotIndices) {
      // Creative-mode evaluator uses slotIndex directly as outputIndex (not slotIndex - 3)
      const outputIdx = slotIndex;
      if (outputIdx >= 0 && outputIdx < outputCount) {
        const samples: number[] = [];
        for (let c = 0; c < cycleResults.outputValues.length; c++) {
          samples.push(cycleResults.outputValues[c][outputIdx] ?? 0);
        }
        targetSamples.set(slotIndex, samples);
      }
    }

    // Deep-copy board state for snapshot
    const snapshotNodes = new Map<string, ChipState>();
    for (const [id, node] of activeBoard.chips) {
      snapshotNodes.set(id, { ...node, position: { ...node.position }, params: { ...node.params } });
    }
    const snapshotWires = activeBoard.paths.map(w => ({
      ...w,
      source: { ...w.source },
      target: { ...w.target },
      route: [...w.route],
    }));

    set({
      authoringPhase: 'configuring-start',
      recordedTargetSamples: targetSamples,
      solutionBoardSnapshot: { chips: snapshotNodes, paths: snapshotWires },
    });
  },

  resetToSolution: () => {
    const state = get();
    if (state.authoringPhase !== 'configuring-start' || !state.solutionBoardSnapshot) return;

    // Restore board from snapshot
    const store = get() as unknown as {
      setActiveBoard: (board: { id: string; chips: Map<string, ChipState>; paths: Path[] }) => void;
      activeBoard: { id: string } | null;
    };

    if (!store.activeBoard) return;

    // Deep-copy snapshot to avoid mutating it
    const chips = new Map<string, ChipState>();
    for (const [id, node] of state.solutionBoardSnapshot.chips) {
      chips.set(id, { ...node, position: { ...node.position }, params: { ...node.params } });
    }
    const wires = state.solutionBoardSnapshot.paths.map(w => ({
      ...w,
      source: { ...w.source },
      target: { ...w.target },
      route: [...w.route],
    }));

    store.setActiveBoard({ id: store.activeBoard.id, chips, paths: wires });
  },

  beginSaveAsPuzzle: () => {
    const state = get();
    if (state.authoringPhase !== 'configuring-start') return;
    set({ authoringPhase: 'saving' });
  },

  cancelAuthoring: () =>
    set({
      authoringPhase: 'idle',
      recordedTargetSamples: null,
      solutionBoardSnapshot: null,
      tutorialTitleDraft: '',
      tutorialMessageDraft: '',
    }),

  setTutorialTitleDraft: (title: string) =>
    set({ tutorialTitleDraft: title }),

  setTutorialMessageDraft: (message: string) =>
    set({ tutorialMessageDraft: message }),
});
