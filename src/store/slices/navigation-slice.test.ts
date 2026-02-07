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
import { computeBreadcrumbs } from '../../ui/controls/NavigationBar.tsx';
import type { GameStore } from '../index.ts';
import type { GameboardState } from '../../shared/types/index.ts';
import type { BakeMetadata } from '../../engine/baking/index.ts';
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

function setupBoardWithPuzzleNode(store: ReturnType<typeof createTestStore>) {
  const board: GameboardState = {
    id: 'test-board',
    nodes: new Map([
      ['p1', { id: 'p1', type: 'puzzle:inv1', position: { col: 100, row: 100 }, params: {}, inputCount: 1, outputCount: 1 }],
      ['n1', { id: 'n1', type: 'invert', position: { col: 200, row: 200 }, params: {}, inputCount: 1, outputCount: 1 }],
    ]),
    wires: [],
  };
  store.getState().setActiveBoard(board);
  store.getState().addPuzzleNode({
    puzzleId: 'inv1',
    title: 'Inverter',
    description: 'Inverts signal',
    inputCount: 1,
    outputCount: 1,
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
    expect(s.activeBoard!.nodes.has('n1')).toBe(true);
    expect(s.selectedNodeId).toBeNull();
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
    expect(s.selectedNodeId).toBeNull();
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
    store.getState().selectNode('p1');
    expect(store.getState().selectedNodeId).toBe('p1');

    store.getState().zoomIntoNode('p1');
    expect(store.getState().selectedNodeId).toBeNull();
  });

  it('zoomIntoNode without active board: no-op', () => {
    const store = createTestStore();
    // No board set
    store.getState().zoomIntoNode('p1');
    expect(store.getState().boardStack).toHaveLength(0);
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

    const result = computeBreadcrumbs(s.boardStack, s.puzzleNodes, puzzle);
    expect(result).toEqual(['Rectifier', 'Inverter']);
  });

  it('falls back to puzzleId when title not found', () => {
    const board: GameboardState = {
      id: 'b',
      nodes: new Map([
        ['x', { id: 'x', type: 'puzzle:unknown-node', position: { col: 0, row: 0 }, params: {}, inputCount: 1, outputCount: 1 }],
      ]),
      wires: [],
    };
    const entry = { board, portConstants: new Map(), nodeIdInParent: 'x' as any, readOnly: false };
    const result = computeBreadcrumbs([entry], new Map(), null);
    expect(result).toEqual(['Sandbox', 'unknown-node']);
  });

  it('falls back to nodeId for non-puzzle node types', () => {
    const board: GameboardState = {
      id: 'b',
      nodes: new Map([
        ['n1', { id: 'n1', type: 'invert', position: { col: 0, row: 0 }, params: {}, inputCount: 1, outputCount: 1 }],
      ]),
      wires: [],
    };
    const entry = { board, portConstants: new Map(), nodeIdInParent: 'n1' as any, readOnly: false };
    const result = computeBreadcrumbs([entry], new Map(), null);
    expect(result).toEqual(['Sandbox', 'n1']);
  });
});
