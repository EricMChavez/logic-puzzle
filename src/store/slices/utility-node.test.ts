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
import type { GameboardState } from '../../shared/types/index.ts';
import { createPath } from '../../shared/types/index.ts';
import type { BakeMetadata } from '../../engine/baking/index.ts';
import type { CraftedUtilityEntry } from './palette-slice.ts';
import { cpInputId, cpOutputId } from '../../puzzle/connection-point-nodes.ts';

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
  topoOrder: [cpInputId(0), 'n1', cpOutputId(0)],
  chipConfigs: [
    { id: cpInputId(0), type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
    { id: 'n1', type: 'invert', params: {}, socketCount: 1, plugCount: 1 },
    { id: cpOutputId(0), type: 'connection-output', params: {}, socketCount: 1, plugCount: 0 },
  ],
  edges: [
    { fromChipId: cpInputId(0), fromPort: 0, toChipId: 'n1', toPort: 0 },
    { fromChipId: 'n1', fromPort: 0, toChipId: cpOutputId(0), toPort: 0 },
  ],
  socketCount: 1,
  plugCount: 1,
};

const fakeBoard: GameboardState = {
  id: 'utility-test',
  chips: new Map([
    ['n1', { id: 'n1', type: 'invert', position: { col: 100, row: 100 }, params: {}, socketCount: 1, plugCount: 1 }],
  ]),
  paths: [],
};

function makeEntry(id: string = 'u1'): CraftedUtilityEntry {
  return {
    utilityId: id,
    title: 'My Inverter',
    socketCount: 1,
    plugCount: 1,
    bakeMetadata: fakeMeta,
    board: fakeBoard,
    versionHash: 'initial-hash',
  };
}

describe('palette-slice utility nodes', () => {
  it('starts with empty utilityNodes Map', () => {
    const store = createTestStore();
    expect(store.getState().craftedUtilities.size).toBe(0);
  });

  it('addUtilityNode stores entry in utilityNodes Map', () => {
    const store = createTestStore();
    const entry = makeEntry();
    store.getState().addCraftedUtility(entry);
    expect(store.getState().craftedUtilities.size).toBe(1);
    const stored = store.getState().craftedUtilities.get('u1')!;
    expect(stored.utilityId).toBe('u1');
    expect(stored.title).toBe('My Inverter');
    expect(stored.socketCount).toBe(1);
    expect(stored.plugCount).toBe(1);
  });

  it('updateUtilityNode updates metadata and board', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());

    const newMeta: BakeMetadata = { ...fakeMeta, socketCount: 2 };
    const newBoard: GameboardState = { ...fakeBoard, id: 'updated-board' };
    store.getState().updateCraftedUtility('u1', newMeta, newBoard);

    const updated = store.getState().craftedUtilities.get('u1')!;
    expect(updated.bakeMetadata.socketCount).toBe(2);
    expect(updated.board.id).toBe('updated-board');
    expect(updated.title).toBe('My Inverter'); // unchanged
  });

  it('updateUtilityNode on missing ID is safe no-op', () => {
    const store = createTestStore();
    store.getState().updateCraftedUtility('nonexistent', fakeMeta, fakeBoard);
    expect(store.getState().craftedUtilities.size).toBe(0);
  });

  it('deleteUtilityNode removes entry', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());
    expect(store.getState().craftedUtilities.size).toBe(1);

    store.getState().deleteCraftedUtility('u1');
    expect(store.getState().craftedUtilities.size).toBe(0);
  });

  it('deleteUtilityNode on missing ID is safe no-op', () => {
    const store = createTestStore();
    store.getState().deleteCraftedUtility('nonexistent');
    expect(store.getState().craftedUtilities.size).toBe(0);
  });

  it('addUtilityNode generates a fresh versionHash', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());
    const stored = store.getState().craftedUtilities.get('u1')!;
    expect(stored.versionHash).toBeDefined();
    expect(stored.versionHash).not.toBe('initial-hash');
  });

  it('updateUtilityNode regenerates versionHash', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());
    const hashAfterAdd = store.getState().craftedUtilities.get('u1')!.versionHash;

    const newMeta: BakeMetadata = { ...fakeMeta, socketCount: 2 };
    const newBoard: GameboardState = { ...fakeBoard, id: 'updated-board' };
    store.getState().updateCraftedUtility('u1', newMeta, newBoard);

    const hashAfterUpdate = store.getState().craftedUtilities.get('u1')!.versionHash;
    expect(hashAfterUpdate).not.toBe(hashAfterAdd);
  });
});

describe('navigation-slice utility editing', () => {
  it('editingUtilityId starts null', () => {
    const store = createTestStore();
    expect(store.getState().editingUtilityId).toBeNull();
  });

  it('startEditingUtility sets editingUtilityId and pushes board stack', () => {
    const store = createTestStore();
    const parentBoard: GameboardState = {
      id: 'parent',
      chips: new Map(),
      paths: [],
    };
    store.getState().setActiveBoard(parentBoard);

    const utilityBoard: GameboardState = {
      id: 'utility-edit',
      chips: new Map(),
      paths: [],
    };

    store.getState().startEditingUtility('u1', utilityBoard);

    const s = store.getState();
    expect(s.editingUtilityId).toBe('u1');
    expect(s.boardStack).toHaveLength(1);
    expect(s.navigationDepth).toBe(1);
    expect(s.activeBoardId).toBe('utility-edit');
    expect(s.activeBoardReadOnly).toBe(false);
  });

  it('finishEditingUtility clears editingUtilityId and pops stack', () => {
    const store = createTestStore();
    const parentBoard: GameboardState = {
      id: 'parent',
      chips: new Map(),
      paths: [],
    };
    store.getState().setActiveBoard(parentBoard);

    const utilityBoard: GameboardState = {
      id: 'utility-edit',
      chips: new Map(),
      paths: [],
    };

    store.getState().startEditingUtility('u1', utilityBoard);
    expect(store.getState().editingUtilityId).toBe('u1');

    store.getState().finishEditingUtility();

    const s = store.getState();
    expect(s.editingUtilityId).toBeNull();
    expect(s.boardStack).toHaveLength(0);
    expect(s.navigationDepth).toBe(0);
    expect(s.activeBoardId).toBe('parent');
  });

  it('zoomIntoNode with utility node creates read-only view', () => {
    const store = createTestStore();

    // Add a utility node to the palette
    store.getState().addCraftedUtility(makeEntry());

    // Set up a board with a placed utility node
    const board: GameboardState = {
      id: 'test-board',
      chips: new Map([
        ['u-placed', { id: 'u-placed', type: 'utility:u1', position: { col: 100, row: 100 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };
    store.getState().setActiveBoard(board);

    store.getState().zoomIntoNode('u-placed');

    const s = store.getState();
    expect(s.boardStack).toHaveLength(1);
    expect(s.activeBoardReadOnly).toBe(true);
    expect(s.navigationDepth).toBe(1);
    // The viewer board ID is generated by gameboardFromBakeMetadata
    expect(s.activeBoardId).toContain('viewer-');
  });
});

describe('deleteUtilityNode cascade removal', () => {
  it('removes instances from activeBoard', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());

    const board: GameboardState = {
      id: 'board-1',
      chips: new Map([
        ['n1', { id: 'n1', type: 'invert', position: { col: 20, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
        ['u-inst', { id: 'u-inst', type: 'utility:u1', position: { col: 30, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };
    store.getState().setActiveBoard(board);

    store.getState().deleteCraftedUtility('u1');

    const s = store.getState();
    expect(s.craftedUtilities.size).toBe(0);
    expect(s.activeBoard!.chips.has('u-inst')).toBe(false);
    expect(s.activeBoard!.chips.has('n1')).toBe(true);
  });

  it('removes connected wires when instance is deleted from activeBoard', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());

    const wire = createPath('w1',
      { chipId: 'n1', portIndex: 0, side: 'plug' },
      { chipId: 'u-inst', portIndex: 0, side: 'socket' },
    );

    const board: GameboardState = {
      id: 'board-1',
      chips: new Map([
        ['n1', { id: 'n1', type: 'invert', position: { col: 20, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
        ['u-inst', { id: 'u-inst', type: 'utility:u1', position: { col: 30, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [wire],
    };
    store.getState().setActiveBoard(board);

    store.getState().deleteCraftedUtility('u1');

    const s = store.getState();
    expect(s.activeBoard!.paths).toHaveLength(0);
  });

  it('removes instances from other utility nodes internal boards', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry('u1'));

    // u2 contains an instance of u1 on its internal board
    const u2Board: GameboardState = {
      id: 'u2-board',
      chips: new Map([
        ['inner-u1', { id: 'inner-u1', type: 'utility:u1', position: { col: 20, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };
    store.getState().addCraftedUtility({
      ...makeEntry('u2'),
      title: 'Wrapper',
      board: u2Board,
    });

    store.getState().deleteCraftedUtility('u1');

    const u2 = store.getState().craftedUtilities.get('u2')!;
    expect(u2.board.chips.has('inner-u1')).toBe(false);
  });

  it('does not modify activeBoard when no instances exist', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());

    const board: GameboardState = {
      id: 'board-1',
      chips: new Map([
        ['n1', { id: 'n1', type: 'invert', position: { col: 20, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };
    store.getState().setActiveBoard(board);
    const boardBefore = store.getState().activeBoard;

    store.getState().deleteCraftedUtility('u1');

    // Board reference should be unchanged (no unnecessary copy)
    expect(store.getState().activeBoard).toBe(boardBefore);
  });

  it('preserves wires not connected to deleted node instances', () => {
    const store = createTestStore();
    store.getState().addCraftedUtility(makeEntry());

    const unrelatedWire = createPath('w-keep',
      { chipId: 'n1', portIndex: 0, side: 'plug' },
      { chipId: 'n2', portIndex: 0, side: 'socket' },
    );
    const deletedWire = createPath('w-remove',
      { chipId: 'u-inst', portIndex: 0, side: 'plug' },
      { chipId: 'n2', portIndex: 0, side: 'socket' },
    );

    const board: GameboardState = {
      id: 'board-1',
      chips: new Map([
        ['n1', { id: 'n1', type: 'invert', position: { col: 20, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
        ['n2', { id: 'n2', type: 'invert', position: { col: 40, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
        ['u-inst', { id: 'u-inst', type: 'utility:u1', position: { col: 30, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [unrelatedWire, deletedWire],
    };
    store.getState().setActiveBoard(board);

    store.getState().deleteCraftedUtility('u1');

    const s = store.getState();
    expect(s.activeBoard!.paths).toHaveLength(1);
    expect(s.activeBoard!.paths[0].id).toBe('w-keep');
  });
});
