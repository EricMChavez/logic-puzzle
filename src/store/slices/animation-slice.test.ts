import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createGameboardSlice } from './gameboard-slice.ts';
import { createInteractionSlice } from './interaction-slice.ts';
import { createSimulationSlice } from './simulation-slice.ts';
import { createPuzzleSlice } from './puzzle-slice.ts';
import { createPaletteSlice } from './palette-slice.ts';
import { createCeremonySlice } from './ceremony-slice.ts';
import { createNavigationSlice } from './navigation-slice.ts';
import { createProgressionSlice } from './progression-slice.ts';
import { createHistorySlice } from './history-slice.ts';
import { createMeterSlice } from './meter-slice.ts';
import { createRoutingSlice } from './routing-slice.ts';
import { createOverlaySlice } from './overlay-slice.ts';
import { createAnimationSlice } from './animation-slice.ts';
import type { GameStore } from '../index.ts';

// Stub OffscreenCanvas for test environment
function mockOffscreenCanvas(): OffscreenCanvas {
  return { width: 1920, height: 1080 } as unknown as OffscreenCanvas;
}

function createTestStore() {
  return create<GameStore>()((...a) => ({
    ...createGameboardSlice(...a),
    ...createInteractionSlice(...a),
    ...createSimulationSlice(...a),
    ...createPuzzleSlice(...a),
    ...createPaletteSlice(...a),
    ...createCeremonySlice(...a),
    ...createNavigationSlice(...a),
    ...createProgressionSlice(...a),
    ...createHistorySlice(...a),
    ...createMeterSlice(...a),
    ...createRoutingSlice(...a),
    ...createOverlaySlice(...a),
    ...createAnimationSlice(...a),
  }));
}

describe('animation-slice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.stubGlobal('performance', { now: vi.fn(() => 1000) });
    store = createTestStore();
  });

  describe('initial state', () => {
    it('lidAnimation starts as idle', () => {
      expect(store.getState().lidAnimation.type).toBe('idle');
    });

    it('ceremonyAnimation starts as inactive', () => {
      expect(store.getState().ceremonyAnimation.type).toBe('inactive');
    });
  });

  describe('startLidOpen', () => {
    it('transitions from idle to opening', () => {
      const snapshot = mockOffscreenCanvas();
      store.getState().startLidOpen(snapshot);

      const anim = store.getState().lidAnimation;
      expect(anim.type).toBe('opening');
      if (anim.type === 'opening') {
        expect(anim.progress).toBe(0);
        expect(anim.snapshot).toBe(snapshot);
        expect(anim.startTime).toBe(1000);
      }
    });

    it('is a no-op if already opening', () => {
      const snap1 = mockOffscreenCanvas();
      const snap2 = mockOffscreenCanvas();
      store.getState().startLidOpen(snap1);
      store.getState().startLidOpen(snap2);

      const anim = store.getState().lidAnimation;
      if (anim.type === 'opening') {
        expect(anim.snapshot).toBe(snap1);
      }
    });

    it('is a no-op if closing is in progress', () => {
      const snap1 = mockOffscreenCanvas();
      store.getState().startLidClose(snap1);
      expect(store.getState().lidAnimation.type).toBe('closing');

      store.getState().startLidOpen(mockOffscreenCanvas());
      expect(store.getState().lidAnimation.type).toBe('closing');
    });
  });

  describe('startLidClose', () => {
    it('transitions from idle to closing', () => {
      const snapshot = mockOffscreenCanvas();
      store.getState().startLidClose(snapshot);

      const anim = store.getState().lidAnimation;
      expect(anim.type).toBe('closing');
      if (anim.type === 'closing') {
        expect(anim.progress).toBe(0);
        expect(anim.snapshot).toBe(snapshot);
        expect(anim.startTime).toBe(1000);
      }
    });

    it('is a no-op if already closing', () => {
      const snap1 = mockOffscreenCanvas();
      store.getState().startLidClose(snap1);
      store.getState().startLidClose(mockOffscreenCanvas());

      const anim = store.getState().lidAnimation;
      if (anim.type === 'closing') {
        expect(anim.snapshot).toBe(snap1);
      }
    });

    it('is a no-op if opening is in progress', () => {
      store.getState().startLidOpen(mockOffscreenCanvas());
      expect(store.getState().lidAnimation.type).toBe('opening');

      store.getState().startLidClose(mockOffscreenCanvas());
      expect(store.getState().lidAnimation.type).toBe('opening');
    });
  });

  describe('setLidProgress', () => {
    it('updates progress on opening animation', () => {
      store.getState().startLidOpen(mockOffscreenCanvas());
      store.getState().setLidProgress(0.5);

      const anim = store.getState().lidAnimation;
      if (anim.type === 'opening') {
        expect(anim.progress).toBe(0.5);
      }
    });

    it('updates progress on closing animation', () => {
      store.getState().startLidClose(mockOffscreenCanvas());
      store.getState().setLidProgress(0.75);

      const anim = store.getState().lidAnimation;
      if (anim.type === 'closing') {
        expect(anim.progress).toBe(0.75);
      }
    });

    it('clamps progress to 1', () => {
      store.getState().startLidOpen(mockOffscreenCanvas());
      store.getState().setLidProgress(1.5);

      const anim = store.getState().lidAnimation;
      if (anim.type === 'opening') {
        expect(anim.progress).toBe(1);
      }
    });

    it('is a no-op when idle', () => {
      store.getState().setLidProgress(0.5);
      expect(store.getState().lidAnimation.type).toBe('idle');
    });
  });

  describe('endLidAnimation', () => {
    it('transitions from opening to idle', () => {
      store.getState().startLidOpen(mockOffscreenCanvas());
      expect(store.getState().lidAnimation.type).toBe('opening');

      store.getState().endLidAnimation();
      expect(store.getState().lidAnimation.type).toBe('idle');
    });

    it('transitions from closing to idle', () => {
      store.getState().startLidClose(mockOffscreenCanvas());
      expect(store.getState().lidAnimation.type).toBe('closing');

      store.getState().endLidAnimation();
      expect(store.getState().lidAnimation.type).toBe('idle');
    });

    it('is safe to call when already idle', () => {
      store.getState().endLidAnimation();
      expect(store.getState().lidAnimation.type).toBe('idle');
    });
  });

  describe('only one animation at a time', () => {
    it('cannot start open while close is running', () => {
      store.getState().startLidClose(mockOffscreenCanvas());
      store.getState().startLidOpen(mockOffscreenCanvas());
      expect(store.getState().lidAnimation.type).toBe('closing');
    });

    it('cannot start close while open is running', () => {
      store.getState().startLidOpen(mockOffscreenCanvas());
      store.getState().startLidClose(mockOffscreenCanvas());
      expect(store.getState().lidAnimation.type).toBe('opening');
    });
  });

  describe('ceremony animation - startVictoryBurst', () => {
    it('transitions from inactive to victory-burst', () => {
      store.getState().startVictoryBurst();

      const anim = store.getState().ceremonyAnimation;
      expect(anim.type).toBe('victory-burst');
      if (anim.type === 'victory-burst') {
        expect(anim.startTime).toBe(1000);
      }
    });

    it('is a no-op when in name-reveal', () => {
      store.getState().startVictoryBurst();
      store.getState().startNameReveal();
      store.getState().startVictoryBurst();

      expect(store.getState().ceremonyAnimation.type).toBe('name-reveal');
    });
  });

  describe('ceremony animation - startNameReveal', () => {
    it('transitions from victory-burst to name-reveal', () => {
      store.getState().startVictoryBurst();
      store.getState().startNameReveal();

      const anim = store.getState().ceremonyAnimation;
      expect(anim.type).toBe('name-reveal');
      if (anim.type === 'name-reveal') {
        expect(anim.startTime).toBe(1000);
      }
    });

    it('is a no-op when inactive', () => {
      store.getState().startNameReveal();
      expect(store.getState().ceremonyAnimation.type).toBe('inactive');
    });
  });

  describe('ceremony animation - startCeremonyZoomOut', () => {
    it('transitions from name-reveal to zoom-out with snapshot', () => {
      store.getState().startVictoryBurst();
      store.getState().startNameReveal();
      const snapshot = mockOffscreenCanvas();
      store.getState().startCeremonyZoomOut(snapshot);

      const anim = store.getState().ceremonyAnimation;
      expect(anim.type).toBe('zoom-out');
      if (anim.type === 'zoom-out') {
        expect(anim.startTime).toBe(1000);
        expect(anim.snapshot).toBe(snapshot);
      }
    });

    it('is a no-op when in victory-burst', () => {
      store.getState().startVictoryBurst();
      store.getState().startCeremonyZoomOut(mockOffscreenCanvas());
      expect(store.getState().ceremonyAnimation.type).toBe('victory-burst');
    });
  });

  describe('ceremony animation - endCeremony', () => {
    it('transitions from victory-burst to inactive', () => {
      store.getState().startVictoryBurst();
      store.getState().endCeremony();
      expect(store.getState().ceremonyAnimation.type).toBe('inactive');
    });

    it('transitions from name-reveal to inactive', () => {
      store.getState().startVictoryBurst();
      store.getState().startNameReveal();
      store.getState().endCeremony();
      expect(store.getState().ceremonyAnimation.type).toBe('inactive');
    });

    it('transitions from zoom-out to inactive', () => {
      store.getState().startVictoryBurst();
      store.getState().startNameReveal();
      store.getState().startCeremonyZoomOut(mockOffscreenCanvas());
      store.getState().endCeremony();
      expect(store.getState().ceremonyAnimation.type).toBe('inactive');
    });

    it('is safe to call when already inactive', () => {
      store.getState().endCeremony();
      expect(store.getState().ceremonyAnimation.type).toBe('inactive');
    });
  });

  describe('ceremony and lid animations are independent', () => {
    it('ceremony can run while lid is idle', () => {
      store.getState().startVictoryBurst();
      expect(store.getState().ceremonyAnimation.type).toBe('victory-burst');
      expect(store.getState().lidAnimation.type).toBe('idle');
    });

    it('lid can run while ceremony is active', () => {
      store.getState().startVictoryBurst();
      store.getState().startLidOpen(mockOffscreenCanvas());
      expect(store.getState().ceremonyAnimation.type).toBe('victory-burst');
      expect(store.getState().lidAnimation.type).toBe('opening');
    });
  });
});
