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
import type { GameboardState } from '../../shared/types/index.ts';
import type { BakeMetadata } from '../../engine/baking/index.ts';
import type { UtilityNodeEntry } from './palette-slice.ts';
import { cpInputId, cpOutputId } from '../../puzzle/connection-point-nodes.ts';

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

const fakeMeta: BakeMetadata = {
  topoOrder: [cpInputId(0), 'n1', cpOutputId(0)],
  nodeConfigs: [
    { id: cpInputId(0), type: 'connection-input', params: {}, inputCount: 0, outputCount: 1 },
    { id: 'n1', type: 'invert', params: {}, inputCount: 1, outputCount: 1 },
    { id: cpOutputId(0), type: 'connection-output', params: {}, inputCount: 1, outputCount: 0 },
  ],
  edges: [
    { fromNodeId: cpInputId(0), fromPort: 0, toNodeId: 'n1', toPort: 0, wtsDelay: 16 },
    { fromNodeId: 'n1', fromPort: 0, toNodeId: cpOutputId(0), toPort: 0, wtsDelay: 16 },
  ],
  inputDelays: [0],
  inputCount: 1,
  outputCount: 1,
};

const fakeBoard: GameboardState = {
  id: 'utility-test',
  nodes: new Map([
    ['n1', { id: 'n1', type: 'invert', position: { col: 100, row: 100 }, params: {}, inputCount: 1, outputCount: 1 }],
  ]),
  wires: [],
};

function makeEntry(id: string = 'u1'): UtilityNodeEntry {
  return {
    utilityId: id,
    title: 'My Inverter',
    inputCount: 1,
    outputCount: 1,
    bakeMetadata: fakeMeta,
    board: fakeBoard,
    versionHash: 'initial-hash',
  };
}

describe('palette-slice utility nodes', () => {
  it('starts with empty utilityNodes Map', () => {
    const store = createTestStore();
    expect(store.getState().utilityNodes.size).toBe(0);
  });

  it('addUtilityNode stores entry in utilityNodes Map', () => {
    const store = createTestStore();
    const entry = makeEntry();
    store.getState().addUtilityNode(entry);
    expect(store.getState().utilityNodes.size).toBe(1);
    const stored = store.getState().utilityNodes.get('u1')!;
    expect(stored.utilityId).toBe('u1');
    expect(stored.title).toBe('My Inverter');
    expect(stored.inputCount).toBe(1);
    expect(stored.outputCount).toBe(1);
  });

  it('updateUtilityNode updates metadata and board', () => {
    const store = createTestStore();
    store.getState().addUtilityNode(makeEntry());

    const newMeta: BakeMetadata = { ...fakeMeta, inputCount: 2 };
    const newBoard: GameboardState = { ...fakeBoard, id: 'updated-board' };
    store.getState().updateUtilityNode('u1', newMeta, newBoard);

    const updated = store.getState().utilityNodes.get('u1')!;
    expect(updated.bakeMetadata.inputCount).toBe(2);
    expect(updated.board.id).toBe('updated-board');
    expect(updated.title).toBe('My Inverter'); // unchanged
  });

  it('updateUtilityNode on missing ID is safe no-op', () => {
    const store = createTestStore();
    store.getState().updateUtilityNode('nonexistent', fakeMeta, fakeBoard);
    expect(store.getState().utilityNodes.size).toBe(0);
  });

  it('deleteUtilityNode removes entry', () => {
    const store = createTestStore();
    store.getState().addUtilityNode(makeEntry());
    expect(store.getState().utilityNodes.size).toBe(1);

    store.getState().deleteUtilityNode('u1');
    expect(store.getState().utilityNodes.size).toBe(0);
  });

  it('deleteUtilityNode on missing ID is safe no-op', () => {
    const store = createTestStore();
    store.getState().deleteUtilityNode('nonexistent');
    expect(store.getState().utilityNodes.size).toBe(0);
  });

  it('addUtilityNode generates a fresh versionHash', () => {
    const store = createTestStore();
    store.getState().addUtilityNode(makeEntry());
    const stored = store.getState().utilityNodes.get('u1')!;
    expect(stored.versionHash).toBeDefined();
    expect(stored.versionHash).not.toBe('initial-hash');
  });

  it('updateUtilityNode regenerates versionHash', () => {
    const store = createTestStore();
    store.getState().addUtilityNode(makeEntry());
    const hashAfterAdd = store.getState().utilityNodes.get('u1')!.versionHash;

    const newMeta: BakeMetadata = { ...fakeMeta, inputCount: 2 };
    const newBoard: GameboardState = { ...fakeBoard, id: 'updated-board' };
    store.getState().updateUtilityNode('u1', newMeta, newBoard);

    const hashAfterUpdate = store.getState().utilityNodes.get('u1')!.versionHash;
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
      nodes: new Map(),
      wires: [],
    };
    store.getState().setActiveBoard(parentBoard);

    const utilityBoard: GameboardState = {
      id: 'utility-edit',
      nodes: new Map(),
      wires: [],
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
      nodes: new Map(),
      wires: [],
    };
    store.getState().setActiveBoard(parentBoard);

    const utilityBoard: GameboardState = {
      id: 'utility-edit',
      nodes: new Map(),
      wires: [],
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
    store.getState().addUtilityNode(makeEntry());

    // Set up a board with a placed utility node
    const board: GameboardState = {
      id: 'test-board',
      nodes: new Map([
        ['u-placed', { id: 'u-placed', type: 'utility:u1', position: { col: 100, row: 100 }, params: {}, inputCount: 1, outputCount: 1 }],
      ]),
      wires: [],
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
