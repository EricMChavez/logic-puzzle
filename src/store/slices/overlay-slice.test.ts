import { describe, it, expect } from 'vitest';
import { createOverlaySlice } from './overlay-slice.ts';
import type { OverlaySlice, ActiveOverlay } from './overlay-slice.ts';

/**
 * Minimal Zustand StateCreator harness for isolated slice testing.
 */
function createTestSlice() {
  let state: OverlaySlice = {} as OverlaySlice;
  const set = (partial: Partial<OverlaySlice> | ((s: OverlaySlice) => Partial<OverlaySlice>)) => {
    const update = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...update };
  };
  const get = () => state;
  state = (createOverlaySlice as Function)(set, get, { setState: set, getState: get, subscribe: () => () => {} });
  return { get: () => state };
}

describe('overlay-slice', () => {
  describe('initial state', () => {
    it('starts with activeOverlay type "none"', () => {
      const { get } = createTestSlice();
      expect(get().activeOverlay).toEqual({ type: 'none' });
    });

    it('hasActiveOverlay returns false initially', () => {
      const { get } = createTestSlice();
      expect(get().hasActiveOverlay()).toBe(false);
    });

    it('isOverlayEscapeDismissible returns false when no overlay', () => {
      const { get } = createTestSlice();
      expect(get().isOverlayEscapeDismissible()).toBe(false);
    });
  });

  describe('openOverlay', () => {
    it('sets the active overlay', () => {
      const { get } = createTestSlice();
      get().openOverlay({ type: 'palette-modal' });
      expect(get().activeOverlay).toEqual({ type: 'palette-modal' });
    });

    it('replaces the current overlay', () => {
      const { get } = createTestSlice();
      get().openOverlay({ type: 'palette-modal' });
      get().openOverlay({ type: 'parameter-popover', chipId: 'n1' });
      expect(get().activeOverlay).toEqual({ type: 'parameter-popover', chipId: 'n1' });
    });

    it('hasActiveOverlay returns true after opening', () => {
      const { get } = createTestSlice();
      get().openOverlay({ type: 'inspect-modal', chipId: 'n2' });
      expect(get().hasActiveOverlay()).toBe(true);
    });
  });

  describe('closeOverlay', () => {
    it('resets to none', () => {
      const { get } = createTestSlice();
      get().openOverlay({ type: 'palette-modal' });
      get().closeOverlay();
      expect(get().activeOverlay).toEqual({ type: 'none' });
    });

    it('hasActiveOverlay returns false after close', () => {
      const { get } = createTestSlice();
      get().openOverlay({ type: 'palette-modal' });
      get().closeOverlay();
      expect(get().hasActiveOverlay()).toBe(false);
    });
  });

  describe('isOverlayEscapeDismissible', () => {
    const dismissibleTypes: ActiveOverlay[] = [
      { type: 'palette-modal' },
      { type: 'parameter-popover', chipId: 'n1' },
      { type: 'context-menu', position: { x: 10, y: 20 }, target: { type: 'empty' } },
      { type: 'inspect-modal', chipId: 'n3' },
    ];

    for (const overlay of dismissibleTypes) {
      it(`returns true for ${overlay.type}`, () => {
        const { get } = createTestSlice();
        get().openOverlay(overlay);
        expect(get().isOverlayEscapeDismissible()).toBe(true);
      });
    }

    it('returns false for save-dialog', () => {
      const { get } = createTestSlice();
      get().openOverlay({ type: 'save-dialog' });
      expect(get().isOverlayEscapeDismissible()).toBe(false);
    });

    it('returns false for unsaved-changes', () => {
      const { get } = createTestSlice();
      get().openOverlay({ type: 'unsaved-changes' });
      expect(get().isOverlayEscapeDismissible()).toBe(false);
    });
  });
});
