/**
 * Zustand subscriber that watches for tutorial advance conditions.
 * Subscribes to relevant state changes and advances the tutorial
 * when the current step's condition is met.
 */
import type { StoreApi } from 'zustand';
import type { GameStore } from '../store/index.ts';
import type { AdvanceCondition } from '../store/slices/tutorial-slice.ts';

interface TutorialWatchState {
  wireCount: number;
  nodeCount: number;
  overlayType: string;
  testCasesPassedCount: number;
}

function extractWatchState(state: GameStore): TutorialWatchState {
  const board = state.activeBoard;
  return {
    wireCount: board?.paths.length ?? 0,
    nodeCount: board?.chips.size ?? 0,
    overlayType: state.activeOverlay.type,
    testCasesPassedCount: state.testCasesPassed.length,
  };
}

/**
 * Initialize the tutorial subscriber.
 * Call once during store setup.
 */
export function initTutorialSubscriber(store: StoreApi<GameStore>): void {
  let prev = extractWatchState(store.getState());
  let prevTutorialType = store.getState().tutorialState.type;

  store.subscribe((state) => {
    const tutorialType = state.tutorialState.type;

    // When tutorial transitions to completed, trigger zoom-out back to motherboard
    if (tutorialType === 'completed' && prevTutorialType !== 'completed') {
      prevTutorialType = tutorialType;
      prev = extractWatchState(state);
      setTimeout(() => {
        const latestState = store.getState();
        if (latestState.tutorialState.type === 'completed') {
          // Stop playback so meter audio stops
          latestState.setPlayMode('paused');
          // Unload the tutorial puzzle
          latestState.unloadPuzzle();
          latestState.endTutorial();
          latestState.zoomOut();
        }
      }, 0);
      return;
    }

    prevTutorialType = tutorialType;

    if (tutorialType !== 'active') {
      prev = extractWatchState(state);
      return;
    }

    const step = state.tutorialSteps[state.tutorialState.stepIndex];
    if (!step) return;

    const curr = extractWatchState(state);
    const condition = step.advanceOn;

    // Overlay coordination: hide/show tutorial overlay when game overlays open/close
    if (step.hideWhileOverlay) {
      if (curr.overlayType !== 'none' && !state.tutorialState.overlayHidden) {
        state.setTutorialOverlayHidden(true);
      } else if (curr.overlayType === 'none' && state.tutorialState.overlayHidden) {
        state.setTutorialOverlayHidden(false);
      }
    }

    // Check advance conditions
    if (shouldAdvance(condition, prev, curr)) {
      // Use setTimeout to avoid advancing during the current dispatch
      setTimeout(() => {
        const latestState = store.getState();
        if (latestState.tutorialState.type === 'active') {
          latestState.advanceTutorial();
        }
      }, 0);
    }

    prev = curr;
  });
}

function shouldAdvance(
  condition: AdvanceCondition,
  prev: TutorialWatchState,
  curr: TutorialWatchState,
): boolean {
  switch (condition.type) {
    case 'wire-created':
      return curr.wireCount > prev.wireCount;

    case 'wire-removed':
      return curr.wireCount < prev.wireCount;

    case 'node-placed':
      return curr.nodeCount > prev.nodeCount;

    case 'overlay-opened':
      return prev.overlayType === 'none' && curr.overlayType !== 'none';

    case 'validation-pass':
      return curr.testCasesPassedCount > prev.testCasesPassedCount;

    // click-anywhere, knob-changed, delay — handled elsewhere or not via subscriber
    default:
      return false;
  }
}
