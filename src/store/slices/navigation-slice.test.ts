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
import { createMeterSlice, createDefaultMeterSlots } from './meter-slice.ts';
import { createRoutingSlice } from './routing-slice.ts';
import { createOverlaySlice } from './overlay-slice.ts';
import { createAnimationSlice } from './animation-slice.ts';
import { computeBreadcrumbs } from './navigation-slice.ts';
import type { GameStore } from '../index.ts';
import type { GameboardState } from '../../shared/types/index.ts';
import type { BakeMetadata } from '../../engine/baking/index.ts';
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

function setupBoardWithPuzzleNode(store: ReturnType<typeof createTestStore>) {
  const board: GameboardState = {
    id: 'test-board',
    chips: new Map([
      ['p1', { id: 'p1', type: 'puzzle:inv1', position: { col: 100, row: 100 }, params: {}, socketCount: 1, plugCount: 1 }],
      ['n1', { id: 'n1', type: 'invert', position: { col: 200, row: 200 }, params: {}, socketCount: 1, plugCount: 1 }],
    ]),
    paths: [],
  };
  store.getState().setActiveBoard(board);
  store.getState().addCraftedPuzzle({
    puzzleId: 'inv1',
    title: 'Inverter',
    description: 'Inverts signal',
    socketCount: 1,
    plugCount: 1,
    bakeMetadata: fakeMeta,
    versionHash: 'test-hash',
  });
}

describe('navigation-slice', () => {
  it('starts with empty stack, readOnly false, depth 0', () => {
    const store = createTestStore();
    const s = store.getState();
    expect(s.boardStack).toEqual([]);
    expect(s.activeBoardReadOnly).toBe(false);
    expect(s.navigationDepth).toBe(0);
  });

  it('zoomIntoNode with puzzle node: pushes to stack, sets new board, readOnly true, depth 1', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    store.getState().zoomIntoNode('p1');

    const s = store.getState();
    expect(s.boardStack).toHaveLength(1);
    expect(s.activeBoardReadOnly).toBe(true);
    expect(s.navigationDepth).toBe(1);
    expect(s.activeBoardId).toBe('viewer-puzzle:inv1');
    expect(s.activeBoard!.chips.has('n1')).toBe(true);
    expect(s.selectedChipId).toBeNull();
  });

  it('zoomIntoNode with non-puzzle node: no-op', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    const boardBefore = store.getState().activeBoard;
    store.getState().zoomIntoNode('n1');

    const s = store.getState();
    expect(s.boardStack).toHaveLength(0);
    expect(s.activeBoardReadOnly).toBe(false);
    expect(s.navigationDepth).toBe(0);
    expect(s.activeBoard).toBe(boardBefore);
  });

  it('zoomIntoNode with nonexistent node: no-op', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    store.getState().zoomIntoNode('doesnt-exist');

    expect(store.getState().boardStack).toHaveLength(0);
    expect(store.getState().navigationDepth).toBe(0);
  });

  it('zoomOut from depth 1: restores parent board + portConstants, depth 0, readOnly false', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    // Set a port constant before zoom-in
    store.getState().setPortConstant('p1', 0, 42);
    const parentPortConstants = store.getState().portConstants;

    store.getState().zoomIntoNode('p1');
    expect(store.getState().navigationDepth).toBe(1);

    store.getState().zoomOut();

    const s = store.getState();
    expect(s.boardStack).toHaveLength(0);
    expect(s.activeBoardReadOnly).toBe(false);
    expect(s.navigationDepth).toBe(0);
    expect(s.activeBoardId).toBe('test-board');
    expect(s.portConstants).toEqual(parentPortConstants);
    expect(s.selectedChipId).toBeNull();
  });

  it('zoomOut from depth 0: no-op', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    const boardBefore = store.getState().activeBoard;
    store.getState().zoomOut();

    expect(store.getState().activeBoard).toBe(boardBefore);
    expect(store.getState().navigationDepth).toBe(0);
  });

  it('round-trip: zoom-in then zoom-out restores original board', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    const originalBoard = store.getState().activeBoard;
    const originalPortConstants = store.getState().portConstants;
    const originalBoardId = store.getState().activeBoardId;

    store.getState().zoomIntoNode('p1');
    expect(store.getState().activeBoardId).not.toBe(originalBoardId);

    store.getState().zoomOut();

    expect(store.getState().activeBoard).toBe(originalBoard);
    expect(store.getState().portConstants).toBe(originalPortConstants);
    expect(store.getState().activeBoardId).toBe(originalBoardId);
    expect(store.getState().activeBoardReadOnly).toBe(false);
    expect(store.getState().navigationDepth).toBe(0);
  });

  it('clears selection on zoom-in', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);
    store.getState().selectChip('p1');
    expect(store.getState().selectedChipId).toBe('p1');

    store.getState().zoomIntoNode('p1');
    expect(store.getState().selectedChipId).toBeNull();
  });

  it('zoomIntoNode without active board: no-op', () => {
    const store = createTestStore();
    // No board set
    store.getState().zoomIntoNode('p1');
    expect(store.getState().boardStack).toHaveLength(0);
  });

  it('zoomIntoNode recomputes occupancy for child board', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    store.getState().zoomIntoNode('p1');

    const s = store.getState();
    // The child board has nodes — occupancy should reflect them
    expect(s.occupancy).toBeDefined();
    // Occupancy is a 2D array (GRID_COLS x GRID_ROWS)
    expect(s.occupancy.length).toBeGreaterThan(0);
  });

  it('zoomOut recomputes occupancy for parent board', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    store.getState().zoomIntoNode('p1');
    store.getState().zoomOut();

    const s = store.getState();
    // Parent board has nodes at (100,100) and (200,200) — occupancy should have marked cells
    expect(s.occupancy).toBeDefined();
    expect(s.occupancy.length).toBeGreaterThan(0);
  });

  it('zoomIntoNode resets meter slots to all off', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    store.getState().zoomIntoNode('p1');

    const s = store.getState();
    for (const slot of s.meterSlots.values()) {
      expect(slot.mode).toBe('off');
    }
  });

  it('zoomOut restores parent meter slots', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    // Simulate active meters before zoom-in
    const { meterSlots } = store.getState();
    for (const [key, slot] of meterSlots) {
      meterSlots.set(key, { ...slot, mode: 'input' });
    }
    store.setState({ meterSlots: new Map(meterSlots) });

    store.getState().zoomIntoNode('p1');
    // Child board gets default (off) meters
    for (const slot of store.getState().meterSlots.values()) {
      expect(slot.mode).toBe('off');
    }

    store.getState().zoomOut();
    // Parent meters should be restored to 'active'
    for (const slot of store.getState().meterSlots.values()) {
      expect(slot.mode).toBe('input');
    }
  });

  it('zoomIntoMenuNode clears activeBoardReadOnly so destination board is editable', () => {
    const store = createTestStore();
    const board: GameboardState = {
      id: 'motherboard',
      chips: new Map([
        ['menu1', { id: 'menu1', type: 'menu-level', position: { col: 15, row: 10 }, params: {}, socketCount: 0, plugCount: 0 }],
      ]),
      paths: [],
    };
    store.getState().setActiveBoard(board);
    // Simulate the motherboard being read-only
    store.setState({ activeBoardReadOnly: true });

    store.getState().zoomIntoMenuNode('menu1');

    expect(store.getState().activeBoardReadOnly).toBe(false);
    expect(store.getState().boardStack).toHaveLength(1);
    expect(store.getState().navigationDepth).toBe(1);
  });

  it('startEditingUtility recomputes occupancy and resets meters', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    const utilityBoard: GameboardState = {
      id: 'utility-board',
      chips: new Map([
        ['un1', { id: 'un1', type: 'invert', position: { col: 15, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };

    store.getState().startEditingUtility('util1', utilityBoard, 'p1' as any);

    const s = store.getState();
    // Occupancy should be recomputed for utility board
    expect(s.occupancy).toBeDefined();
    // Utility editing: meters derived from board (no utility slot nodes → all 'off')
    for (const slot of s.meterSlots.values()) {
      expect(slot.mode).toBe('off');
    }
  });

  it('finishEditingUtility recomputes occupancy and restores parent meters', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);

    // Set parent meters to active
    const { meterSlots } = store.getState();
    for (const [key, slot] of meterSlots) {
      meterSlots.set(key, { ...slot, mode: 'input' });
    }
    store.setState({ meterSlots: new Map(meterSlots) });

    const utilityBoard: GameboardState = {
      id: 'utility-board',
      chips: new Map(),
      paths: [],
    };

    store.getState().startEditingUtility('util1', utilityBoard, 'p1' as any);
    // Child should have 'off' meters (empty utility board → no utility slot nodes)
    for (const slot of store.getState().meterSlots.values()) {
      expect(slot.mode).toBe('off');
    }

    store.getState().finishEditingUtility();

    const s = store.getState();
    // Occupancy should be recomputed for parent board
    expect(s.occupancy).toBeDefined();
    // Meters should be restored to active
    for (const slot of s.meterSlots.values()) {
      expect(slot.mode).toBe('input');
    }
  });
});

describe('computeBreadcrumbs', () => {
  it('returns ["Sandbox"] when no puzzle and no stack', () => {
    expect(computeBreadcrumbs([], new Map(), null)).toEqual(['Sandbox']);
  });

  it('returns [puzzleTitle] at depth 0 with active puzzle', () => {
    const puzzle = { id: 'p1', title: 'Rectifier' } as any;
    expect(computeBreadcrumbs([], new Map(), puzzle)).toEqual(['Rectifier']);
  });

  it('returns [puzzleTitle, nodeTitle] at depth 1', () => {
    const store = createTestStore();
    setupBoardWithPuzzleNode(store);
    const puzzle = { id: 'rect', title: 'Rectifier' } as any;

    store.getState().zoomIntoNode('p1');
    const s = store.getState();

    const result = computeBreadcrumbs(s.boardStack, s.craftedPuzzles, puzzle);
    expect(result).toEqual(['Rectifier', 'Inverter']);
  });

  it('falls back to puzzleId when title not found', () => {
    const board: GameboardState = {
      id: 'b',
      chips: new Map([
        ['x', { id: 'x', type: 'puzzle:unknown-node', position: { col: 0, row: 0 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };
    const entry = { board, portConstants: new Map(), chipIdInParent: 'x' as any, readOnly: false, meterSlots: createDefaultMeterSlots() };
    const result = computeBreadcrumbs([entry], new Map(), null);
    expect(result).toEqual(['Sandbox', 'unknown-node']);
  });

  it('falls back to chipId for non-puzzle node types', () => {
    const board: GameboardState = {
      id: 'b',
      chips: new Map([
        ['n1', { id: 'n1', type: 'invert', position: { col: 0, row: 0 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };
    const entry = { board, portConstants: new Map(), chipIdInParent: 'n1' as any, readOnly: false, meterSlots: createDefaultMeterSlots() };
    const result = computeBreadcrumbs([entry], new Map(), null);
    expect(result).toEqual(['Sandbox', 'n1']);
  });

  it('shows "New Custom Node" for custom-blank nodes', () => {
    const board: GameboardState = {
      id: 'b',
      chips: new Map([
        ['cb1', { id: 'cb1', type: 'custom-blank', position: { col: 15, row: 10 }, params: {}, socketCount: 0, plugCount: 0 }],
      ]),
      paths: [],
    };
    const entry = { board, portConstants: new Map(), chipIdInParent: 'cb1' as any, readOnly: false, meterSlots: createDefaultMeterSlots() };
    const result = computeBreadcrumbs([entry], new Map(), null);
    expect(result).toEqual(['Sandbox', 'New Custom Node']);
  });

  it('shows utility title for utility nodes', () => {
    const board: GameboardState = {
      id: 'b',
      chips: new Map([
        ['u1', { id: 'u1', type: 'utility:myutil', position: { col: 15, row: 10 }, params: {}, socketCount: 1, plugCount: 1 }],
      ]),
      paths: [],
    };
    const entry = { board, portConstants: new Map(), chipIdInParent: 'u1' as any, readOnly: false, meterSlots: createDefaultMeterSlots() };
    const utilityNodes = new Map([['myutil', { title: 'My Filter' } as any]]);
    const result = computeBreadcrumbs([entry], new Map(), null, utilityNodes);
    expect(result).toEqual(['Sandbox', 'My Filter']);
  });
});
