import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';

/**
 * Lid animation state machine for clamshell zoom transitions.
 *
 * Opening: parent board snapshot splits vertically, halves compress toward edges,
 *   revealing child board behind. Used for zoom-in.
 * Closing: child board snapshot shrinks from center toward edges,
 *   revealing parent board behind. Used for zoom-out.
 *
 * progress: 0→1, advanced by rAF loop using (now - startTime) / duration.
 * snapshot: OffscreenCanvas captured before the board switch.
 */
export type LidAnimationState =
  | { type: 'idle' }
  | { type: 'opening'; progress: number; snapshot: OffscreenCanvas; startTime: number }
  | { type: 'closing'; progress: number; snapshot: OffscreenCanvas; startTime: number };

/**
 * Validation ceremony animation state machine.
 *
 * Phases progress: inactive → victory-burst → name-reveal → zoom-out → inactive.
 * Separate from lidAnimation to avoid mutex conflicts.
 */
export type ValidationCeremonyState =
  | { type: 'inactive' }
  | { type: 'victory-burst'; startTime: number }
  | { type: 'name-reveal'; startTime: number }
  | { type: 'zoom-out'; startTime: number; snapshot: OffscreenCanvas };

export interface AnimationSlice {
  lidAnimation: LidAnimationState;
  ceremonyAnimation: ValidationCeremonyState;

  /** Start opening animation (zoom-in). Snapshot is the parent board. */
  startLidOpen: (snapshot: OffscreenCanvas) => void;

  /** Start closing animation (zoom-out). Snapshot is the child board. */
  startLidClose: (snapshot: OffscreenCanvas) => void;

  /** Update progress. Returns true if animation just completed. */
  setLidProgress: (progress: number) => void;

  /** End the animation, returning to idle. */
  endLidAnimation: () => void;

  /** Start victory burst phase (inactive → victory-burst). */
  startVictoryBurst: () => void;

  /** Transition to name reveal (victory-burst → name-reveal). */
  startNameReveal: () => void;

  /** Transition to zoom-out (name-reveal → zoom-out). */
  startCeremonyZoomOut: (snapshot: OffscreenCanvas) => void;

  /** End ceremony, returning to inactive (any → inactive). */
  endCeremony: () => void;
}

export const createAnimationSlice: StateCreator<GameStore, [], [], AnimationSlice> = (
  set,
  get,
) => ({
  lidAnimation: { type: 'idle' },
  ceremonyAnimation: { type: 'inactive' },

  startLidOpen: (snapshot) => {
    const current = get().lidAnimation;
    if (current.type !== 'idle') return;
    set({
      lidAnimation: {
        type: 'opening',
        progress: 0,
        snapshot,
        startTime: performance.now(),
      },
    });
  },

  startLidClose: (snapshot) => {
    const current = get().lidAnimation;
    if (current.type !== 'idle') return;
    set({
      lidAnimation: {
        type: 'closing',
        progress: 0,
        snapshot,
        startTime: performance.now(),
      },
    });
  },

  setLidProgress: (progress) => {
    const current = get().lidAnimation;
    if (current.type === 'idle') return;
    set({
      lidAnimation: { ...current, progress: Math.min(progress, 1) },
    });
  },

  endLidAnimation: () => {
    set({ lidAnimation: { type: 'idle' } });
  },

  startVictoryBurst: () => {
    const current = get().ceremonyAnimation;
    if (current.type !== 'inactive') return;
    set({ ceremonyAnimation: { type: 'victory-burst', startTime: performance.now() } });
  },

  startNameReveal: () => {
    const current = get().ceremonyAnimation;
    if (current.type !== 'victory-burst') return;
    set({ ceremonyAnimation: { type: 'name-reveal', startTime: performance.now() } });
  },

  startCeremonyZoomOut: (snapshot) => {
    const current = get().ceremonyAnimation;
    if (current.type !== 'name-reveal') return;
    set({ ceremonyAnimation: { type: 'zoom-out', startTime: performance.now(), snapshot } });
  },

  endCeremony: () => {
    set({ ceremonyAnimation: { type: 'inactive' } });
  },
});
