import type { StateCreator } from 'zustand';

// =============================================================================
// Tutorial types
// =============================================================================

export type TutorialHighlight =
  | { type: 'none' }
  | { type: 'grid-rect'; col: number; row: number; cols: number; rows: number }
  | { type: 'meter-zone'; side: 'left' | 'right'; slotIndex: number }
  | { type: 'full-board' };

export type TooltipPosition = 'above' | 'below' | 'left' | 'right' | 'center';

export interface CursorAnimation {
  path: { col: number; row: number }[];
  clickAtEnd: boolean;
  durationMs: number;
  delayMs: number;
  loop: boolean;
}

export type AdvanceCondition =
  | { type: 'click-anywhere' }
  | { type: 'next-button' }
  | { type: 'wire-created' }
  | { type: 'wire-removed' }
  | { type: 'node-placed'; nodeType: string }
  | { type: 'overlay-opened'; overlayType: string }
  | { type: 'knob-changed' }
  | { type: 'validation-pass' }
  | { type: 'delay'; ms: number };

export interface TutorialStep {
  id: string;
  text: string;
  subtext?: string;
  highlight: TutorialHighlight;
  tooltipPosition: TooltipPosition;
  cursor?: CursorAnimation;
  advanceOn: AdvanceCondition;
  allowOverlays?: boolean;
  hideWhileOverlay?: boolean;
}

// =============================================================================
// State machine
// =============================================================================

export type TutorialState =
  | { type: 'inactive' }
  | { type: 'active'; stepIndex: number; stepStartTime: number; overlayHidden: boolean }
  | { type: 'completed' };

export interface TutorialSlice {
  tutorialState: TutorialState;
  tutorialSteps: TutorialStep[];

  startTutorial: (steps: TutorialStep[]) => void;
  advanceTutorial: () => void;
  setTutorialOverlayHidden: (hidden: boolean) => void;
  endTutorial: () => void;
  isTutorialActive: () => boolean;
  getCurrentTutorialStep: () => TutorialStep | null;
}

export const createTutorialSlice: StateCreator<TutorialSlice> = (set, get) => ({
  tutorialState: { type: 'inactive' },
  tutorialSteps: [],

  startTutorial: (steps) =>
    set(() => ({
      tutorialSteps: steps,
      tutorialState: { type: 'active', stepIndex: 0, stepStartTime: performance.now(), overlayHidden: false },
    })),

  advanceTutorial: () =>
    set((state) => {
      if (state.tutorialState.type !== 'active') return {};
      const nextIndex = state.tutorialState.stepIndex + 1;
      if (nextIndex >= state.tutorialSteps.length) {
        return { tutorialState: { type: 'completed' } };
      }
      return {
        tutorialState: {
          type: 'active',
          stepIndex: nextIndex,
          stepStartTime: performance.now(),
          overlayHidden: false,
        },
      };
    }),

  setTutorialOverlayHidden: (hidden) =>
    set((state) => {
      if (state.tutorialState.type !== 'active') return {};
      return {
        tutorialState: { ...state.tutorialState, overlayHidden: hidden },
      };
    }),

  endTutorial: () =>
    set(() => ({
      tutorialState: { type: 'inactive' },
      tutorialSteps: [],
    })),

  isTutorialActive: () => get().tutorialState.type === 'active',

  getCurrentTutorialStep: () => {
    const { tutorialState, tutorialSteps } = get();
    if (tutorialState.type !== 'active') return null;
    return tutorialSteps[tutorialState.stepIndex] ?? null;
  },
});
