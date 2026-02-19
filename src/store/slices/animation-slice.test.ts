import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createGameboardSlice } from './gameboard-slice.ts';
import { createInteractionSlice } from './interaction-slice.ts';
import { createPlaypointSlice } from './playpoint-slice.ts';
import { createPuzzleSlice } from './puzzle-slice.ts';
import { createPaletteSlice } from './palette-slice.ts';
import { createNavigationSlice } from './navigation-slice.ts';
import { createProgressionSlice } from './progression-slice.ts';
import { createHistorySlice } from './history-slice.ts';
import { createMeterSlice } from './meter-slice.ts';
import { createRoutingSlice } from './routing-slice.ts';
import { createOverlaySlice } from './overlay-slice.ts';
import { createAnimationSlice } from './animation-slice.ts';
import type { GameStore } from '../index.ts';

function mockOffscreenCanvas(): OffscreenCanvas {
  return { width: 1920, height: 1080 } as unknown as OffscreenCanvas;
}

function createTestStore() {
  return create<GameStore>()((...a) => ({
    ...createGameboardSlice(...a),
    ...createInteractionSlice(...a),
    ...createPlaypointSlice(...a),
    ...createPuzzleSlice(...a),
    ...createPaletteSlice(...a),
    ...createNavigationSlice(...a),
    ...createProgressionSlice(...a),
    ...createHistorySlice(...a),
    ...createMeterSlice(...a),
    ...createRoutingSlice(...a),
    ...createOverlaySlice(...a),
    ...createAnimationSlice(...a),
  }));
}

describe('animation-slice (zoom transition)', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.stubGlobal('performance', { now: vi.fn(() => 1000) });
    store = createTestStore();
  });

  describe('initial state', () => {
    it('starts as idle', () => {
      expect(store.getState().zoomTransitionState.type).toBe('idle');
    });
  });

  describe('startZoomCapture', () => {
    it('transitions from idle to capturing', () => {
      const snapshot = mockOffscreenCanvas();
      const rect = { col: 10, row: 5, cols: 4, rows: 3 };
      store.getState().startZoomCapture(snapshot, rect, 'in');

      const state = store.getState().zoomTransitionState;
      expect(state.type).toBe('capturing');
      if (state.type === 'capturing') {
        expect(state.firstSnapshot).toBe(snapshot);
        expect(state.targetRect).toEqual(rect);
        expect(state.direction).toBe('in');
      }
    });

    it('is a no-op if not idle', () => {
      const snap1 = mockOffscreenCanvas();
      const snap2 = mockOffscreenCanvas();
      const rect = { col: 10, row: 5, cols: 4, rows: 3 };
      store.getState().startZoomCapture(snap1, rect, 'in');
      store.getState().startZoomCapture(snap2, rect, 'out');

      const state = store.getState().zoomTransitionState;
      if (state.type === 'capturing') {
        expect(state.firstSnapshot).toBe(snap1);
        expect(state.direction).toBe('in');
      }
    });
  });

  describe('finalizeZoomCapture', () => {
    it('transitions from capturing to animating', () => {
      const snap1 = mockOffscreenCanvas();
      const snap2 = mockOffscreenCanvas();
      const rect = { col: 10, row: 5, cols: 4, rows: 3 };

      store.getState().startZoomCapture(snap1, rect, 'in');
      store.getState().finalizeZoomCapture(snap2);

      const state = store.getState().zoomTransitionState;
      expect(state.type).toBe('animating');
      if (state.type === 'animating') {
        // zoom-in: outer=first(parent), inner=second(child)
        expect(state.outerSnapshot).toBe(snap1);
        expect(state.innerSnapshot).toBe(snap2);
        expect(state.direction).toBe('in');
        expect(state.startTime).toBe(1000);
      }
    });

    it('assigns snapshots correctly for zoom-out', () => {
      const snap1 = mockOffscreenCanvas();
      const snap2 = mockOffscreenCanvas();
      const rect = { col: 10, row: 5, cols: 4, rows: 3 };

      store.getState().startZoomCapture(snap1, rect, 'out');
      store.getState().finalizeZoomCapture(snap2);

      const state = store.getState().zoomTransitionState;
      if (state.type === 'animating') {
        // zoom-out: outer=second(parent), inner=first(child)
        expect(state.outerSnapshot).toBe(snap2);
        expect(state.innerSnapshot).toBe(snap1);
      }
    });

    it('is a no-op if not capturing', () => {
      store.getState().finalizeZoomCapture(mockOffscreenCanvas());
      expect(store.getState().zoomTransitionState.type).toBe('idle');
    });
  });

  describe('endZoomTransition', () => {
    it('transitions from animating to idle', () => {
      const snap1 = mockOffscreenCanvas();
      const snap2 = mockOffscreenCanvas();
      const rect = { col: 10, row: 5, cols: 4, rows: 3 };

      store.getState().startZoomCapture(snap1, rect, 'in');
      store.getState().finalizeZoomCapture(snap2);
      expect(store.getState().zoomTransitionState.type).toBe('animating');

      store.getState().endZoomTransition();
      expect(store.getState().zoomTransitionState.type).toBe('idle');
    });

    it('is safe to call when already idle', () => {
      store.getState().endZoomTransition();
      expect(store.getState().zoomTransitionState.type).toBe('idle');
    });
  });

  describe('only one transition at a time', () => {
    it('cannot start capture while capturing', () => {
      const snap1 = mockOffscreenCanvas();
      const snap2 = mockOffscreenCanvas();
      const rect = { col: 10, row: 5, cols: 4, rows: 3 };

      store.getState().startZoomCapture(snap1, rect, 'in');
      store.getState().startZoomCapture(snap2, rect, 'out');

      const state = store.getState().zoomTransitionState;
      expect(state.type).toBe('capturing');
      if (state.type === 'capturing') {
        expect(state.direction).toBe('in');
      }
    });

    it('cannot start capture while animating', () => {
      const snap1 = mockOffscreenCanvas();
      const snap2 = mockOffscreenCanvas();
      const rect = { col: 10, row: 5, cols: 4, rows: 3 };

      store.getState().startZoomCapture(snap1, rect, 'in');
      store.getState().finalizeZoomCapture(snap2);
      expect(store.getState().zoomTransitionState.type).toBe('animating');

      store.getState().startZoomCapture(mockOffscreenCanvas(), rect, 'out');
      expect(store.getState().zoomTransitionState.type).toBe('animating');
    });
  });
});
