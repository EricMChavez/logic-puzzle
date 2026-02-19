import { describe, it, expect } from 'vitest';
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
import type { CraftedPuzzleEntry } from './palette-slice.ts';
import type { BakeMetadata } from '../../engine/baking/index.ts';
import { chipRegistry } from '../../engine/nodes/registry.ts';

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

const fakeMeta: BakeMetadata = {
  topoOrder: ['n1'],
  chipConfigs: [{ id: 'n1', type: 'offset', params: {}, socketCount: 2, plugCount: 1 }],
  edges: [],
  socketCount: 1,
  plugCount: 1,
};

const fakeEntry: CraftedPuzzleEntry = {
  puzzleId: 'pass-through',
  title: 'Pass-Through',
  description: 'Wire input to output',
  socketCount: 1,
  plugCount: 1,
  bakeMetadata: fakeMeta,
  versionHash: 'caller-hash',
};

describe('palette-slice', () => {
  it('starts with an empty puzzleNodes map', () => {
    const store = createTestStore();
    expect(store.getState().craftedPuzzles.size).toBe(0);
  });

  it('addPuzzleNode inserts an entry', () => {
    const store = createTestStore();
    store.getState().addCraftedPuzzle(fakeEntry);
    const nodes = store.getState().craftedPuzzles;
    expect(nodes.size).toBe(1);
    const stored = nodes.get('pass-through')!;
    expect(stored.title).toBe('Pass-Through');
    expect(stored.puzzleId).toBe('pass-through');
  });

  it('addPuzzleNode does not clobber existing entries', () => {
    const store = createTestStore();
    store.getState().addCraftedPuzzle(fakeEntry);
    const second: CraftedPuzzleEntry = { ...fakeEntry, puzzleId: 'invert', title: 'Invert' };
    store.getState().addCraftedPuzzle(second);
    expect(store.getState().craftedPuzzles.size).toBe(2);
    expect(store.getState().craftedPuzzles.get('pass-through')!.title).toBe('Pass-Through');
    expect(store.getState().craftedPuzzles.get('invert')!.title).toBe('Invert');
  });

  it('updatePuzzleNode updates bakeMetadata for existing entry', () => {
    const store = createTestStore();
    store.getState().addCraftedPuzzle(fakeEntry);
    const newMeta: BakeMetadata = { ...fakeMeta, topoOrder: ['n2'] };
    store.getState().updateCraftedPuzzle('pass-through', newMeta);
    const updated = store.getState().craftedPuzzles.get('pass-through')!;
    expect(updated.bakeMetadata.topoOrder).toEqual(['n2']);
    expect(updated.title).toBe('Pass-Through');
  });

  it('updatePuzzleNode is a no-op for unknown puzzleId', () => {
    const store = createTestStore();
    store.getState().addCraftedPuzzle(fakeEntry);
    store.getState().updateCraftedPuzzle('nonexistent', fakeMeta);
    expect(store.getState().craftedPuzzles.size).toBe(1);
  });

  it('addPuzzleNode generates a fresh versionHash', () => {
    const store = createTestStore();
    store.getState().addCraftedPuzzle(fakeEntry);
    const stored = store.getState().craftedPuzzles.get('pass-through')!;
    // Should be a valid UUID, not the caller's value
    expect(stored.versionHash).toBeDefined();
    expect(stored.versionHash).not.toBe('caller-hash');
  });

  it('updatePuzzleNode regenerates versionHash', () => {
    const store = createTestStore();
    store.getState().addCraftedPuzzle(fakeEntry);
    const hashAfterAdd = store.getState().craftedPuzzles.get('pass-through')!.versionHash;

    store.getState().updateCraftedPuzzle('pass-through', { ...fakeMeta, topoOrder: ['n2'] });
    const hashAfterUpdate = store.getState().craftedPuzzles.get('pass-through')!.versionHash;

    expect(hashAfterUpdate).not.toBe(hashAfterAdd);
  });
});

describe('palette filtering logic', () => {
  const entryA: CraftedPuzzleEntry = {
    ...fakeEntry,
    puzzleId: 'puzzle-a',
    title: 'Puzzle A',
  };
  const entryB: CraftedPuzzleEntry = {
    ...fakeEntry,
    puzzleId: 'puzzle-b',
    title: 'Puzzle B',
  };

  describe('fundamental nodes filtered by allowedChips', () => {
    it('null allowedChips shows all fundamentals', () => {
      const allowedChips: string[] | null = null as string[] | null;
      const visible = allowedChips
        ? chipRegistry.all.filter((def) => allowedChips.includes(def.type))
        : chipRegistry.all;
      expect(visible).toEqual(chipRegistry.all);
      expect(visible.length).toBe(chipRegistry.all.length);
    });

    it('allowedChips filters to matching types only', () => {
      const allowedChips = ['scale', 'offset'];
      const visible = chipRegistry.all.filter((def) => allowedChips.includes(def.type));
      expect(visible.length).toBe(2);
      expect(visible.map((d) => d.type).sort()).toEqual(['offset', 'scale']);
    });

    it('allowedChips with no matches returns empty', () => {
      const allowedChips = ['nonexistent'];
      const visible = chipRegistry.all.filter((def) => allowedChips.includes(def.type));
      expect(visible.length).toBe(0);
    });
  });

  describe('puzzle nodes filtered by completedLevels and allowedChips', () => {
    it('uncompleted puzzle nodes are hidden', () => {
      const store = createTestStore();
      store.getState().addCraftedPuzzle(entryA);
      store.getState().addCraftedPuzzle(entryB);

      const completedLevels = store.getState().completedLevels;
      const visible = Array.from(store.getState().craftedPuzzles.values()).filter((entry) => {
        if (!completedLevels.has(entry.puzzleId)) return false;
        return true;
      });
      expect(visible.length).toBe(0);
    });

    it('completed puzzle nodes are visible when allowedChips is null', () => {
      const store = createTestStore();
      store.getState().addCraftedPuzzle(entryA);
      store.getState().addCraftedPuzzle(entryB);
      store.getState().completeLevel('puzzle-a');

      const completedLevels = store.getState().completedLevels;
      const allowedChips: string[] | null = null as string[] | null;
      const visible = Array.from(store.getState().craftedPuzzles.values()).filter((entry) => {
        if (!completedLevels.has(entry.puzzleId)) return false;
        if (allowedChips && !allowedChips.includes(entry.puzzleId)) return false;
        return true;
      });
      expect(visible.length).toBe(1);
      expect(visible[0].puzzleId).toBe('puzzle-a');
    });

    it('allowedChips further filters completed puzzle nodes', () => {
      const store = createTestStore();
      store.getState().addCraftedPuzzle(entryA);
      store.getState().addCraftedPuzzle(entryB);
      store.getState().completeLevel('puzzle-a');
      store.getState().completeLevel('puzzle-b');

      const completedLevels = store.getState().completedLevels;
      const allowedChips = ['puzzle-b'];
      const visible = Array.from(store.getState().craftedPuzzles.values()).filter((entry) => {
        if (!completedLevels.has(entry.puzzleId)) return false;
        if (allowedChips && !allowedChips.includes(entry.puzzleId)) return false;
        return true;
      });
      expect(visible.length).toBe(1);
      expect(visible[0].puzzleId).toBe('puzzle-b');
    });

    it('both completed and allowed shows all matching', () => {
      const store = createTestStore();
      store.getState().addCraftedPuzzle(entryA);
      store.getState().addCraftedPuzzle(entryB);
      store.getState().completeLevel('puzzle-a');
      store.getState().completeLevel('puzzle-b');

      const completedLevels = store.getState().completedLevels;
      const allowedChips: string[] | null = null as string[] | null;
      const visible = Array.from(store.getState().craftedPuzzles.values()).filter((entry) => {
        if (!completedLevels.has(entry.puzzleId)) return false;
        if (allowedChips && !allowedChips.includes(entry.puzzleId)) return false;
        return true;
      });
      expect(visible.length).toBe(2);
    });
  });
});
