import { playSound } from './audio-manager.ts';

/** Module-level flag to suppress all sound effects during puzzle loads */
let _suppressed = false;

/** Timeout IDs for the victory meter-valid burst, so we can cancel on status change */
let _victoryTimeouts: ReturnType<typeof setTimeout>[] = [];

/**
 * Run `fn` with sound effects suppressed.
 * Uses try/finally so the flag is always cleared, even on exceptions.
 */
export function withSoundsSuppressed(fn: () => void): void {
  _suppressed = true;
  try {
    fn();
  } finally {
    _suppressed = false;
  }
}

/**
 * Subscribe to store changes and play sound effects.
 * Called once from store/index.ts after store creation.
 */
export function initSoundEffects(store: {
  subscribe(listener: (state: SoundState, prev: SoundState) => void): () => void;
}): void {
  store.subscribe((state, prev) => {
    if (_suppressed) return;
    // Play/pause toggle
    if (state.playMode !== prev.playMode) {
      playSound(state.playMode === 'playing' ? 'play' : 'pause');
    }

    // Victory — rapid meter-valid burst (one per valid output port)
    if (state.puzzleStatus === 'victory' && prev.puzzleStatus !== 'victory') {
      const validCount = state.perPortMatch.filter(Boolean).length;
      const INITIAL_DELAY = 400;
      const INTERVAL = 120;
      for (let i = 0; i < validCount; i++) {
        _victoryTimeouts.push(setTimeout(() => playSound('meter-valid'), INITIAL_DELAY + i * INTERVAL));
      }
    }
    // Cancel pending victory burst if puzzle breaks back to playing
    if (state.puzzleStatus !== 'victory' && prev.puzzleStatus === 'victory') {
      for (const id of _victoryTimeouts) clearTimeout(id);
      _victoryTimeouts = [];
    }

    // Playpoint step (next/prev cycle) — only when NOT in fade transition
    if (state.playpoint !== prev.playpoint && state.playMode === 'paused' && !state.playPauseTransitioning) {
      const delta = state.playpoint - prev.playpoint;
      // Forward step or wrap-around from 255→0
      if (delta === 1 || delta === -255) {
        playSound('next-cycle');
      }
      // Backward step or wrap-around from 0→255
      else if (delta === -1 || delta === 255) {
        playSound('prev-cycle');
      }
    }

    // Zoom transition sounds
    const zt = state.zoomTransitionState;
    const prevZt = prev.zoomTransitionState;
    if (zt.type !== prevZt.type) {
      // Zoom-in animation starting: curtain lifts up to reveal child board
      if (zt.type === 'animating' && prevZt.type === 'capturing' && zt.direction === 'in') {
        playSound('reveal-open-start');
      }
      // reveal-close-end is fired from render-loop.ts at 300ms into the reveal animation
    }

    // Meter validation: individual port flipping from invalid → valid
    if (state.perPortMatch !== prev.perPortMatch && state.perPortMatch.length > 0) {
      for (let i = 0; i < state.perPortMatch.length; i++) {
        if (state.perPortMatch[i] && !prev.perPortMatch[i]) {
          playSound('meter-valid');
          break; // One sound per validation update, even if multiple ports validate at once
        }
      }
    }
  });
}

/** Minimal shape of the store state we subscribe to */
interface SoundState {
  playMode: string;
  playPauseTransitioning: boolean;
  puzzleStatus: string;
  playpoint: number;
  zoomTransitionState: { type: string; direction?: 'in' | 'out' };
  perPortMatch: boolean[];
}
