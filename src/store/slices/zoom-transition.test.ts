import { describe, it, expect } from 'vitest';
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

describe('zoom transition state', () => {
  it('initial state: zoomTransition is null', () => {
    const store = createTestStore();
    expect(store.getState().zoomTransition).toBeNull();
  });

  it('startZoomTransition sets direction "in" and snapshot', () => {
    const store = createTestStore();
    store.getState().startZoomTransition('in', 'data:image/png;base64,abc');

    const t = store.getState().zoomTransition;
    expect(t).not.toBeNull();
    expect(t!.direction).toBe('in');
    expect(t!.snapshot).toBe('data:image/png;base64,abc');
  });

  it('startZoomTransition sets direction "out" and snapshot', () => {
    const store = createTestStore();
    store.getState().startZoomTransition('out', 'data:image/png;base64,xyz');

    const t = store.getState().zoomTransition;
    expect(t).not.toBeNull();
    expect(t!.direction).toBe('out');
    expect(t!.snapshot).toBe('data:image/png;base64,xyz');
  });

  it('endZoomTransition clears to null', () => {
    const store = createTestStore();
    store.getState().startZoomTransition('in', 'data:image/png;base64,abc');
    expect(store.getState().zoomTransition).not.toBeNull();

    store.getState().endZoomTransition();
    expect(store.getState().zoomTransition).toBeNull();
  });

  it('endZoomTransition when already null is a safe no-op', () => {
    const store = createTestStore();
    expect(store.getState().zoomTransition).toBeNull();

    store.getState().endZoomTransition();
    expect(store.getState().zoomTransition).toBeNull();
  });

  it('transition state is independent of navigation stack', () => {
    const store = createTestStore();
    store.getState().startZoomTransition('in', 'snap');

    expect(store.getState().zoomTransition).not.toBeNull();
    expect(store.getState().boardStack).toEqual([]);
    expect(store.getState().navigationDepth).toBe(0);
  });
});
