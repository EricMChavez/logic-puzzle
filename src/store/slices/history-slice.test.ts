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
import { createHistorySlice, initHistory } from './history-slice.ts';
import { createMeterSlice } from './meter-slice.ts';
import { createRoutingSlice } from './routing-slice.ts';
import { createOverlaySlice } from './overlay-slice.ts';
import { createAnimationSlice } from './animation-slice.ts';
import type { GameStore } from '../index.ts';
import { createWire } from '../../shared/types/index.ts';
import type { GameboardState, NodeState, Wire } from '../../shared/types/index.ts';

function createTestStore() {
  const store = create<GameStore>()((...a) => ({
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
  initHistory(store);
  return store;
}

function makeBoard(id: string): GameboardState {
  return { id, nodes: new Map(), wires: [] };
}

function makeNode(id: string): NodeState {
  return { id, type: 'invert', position: { col: 0, row: 0 }, params: {}, inputCount: 1, outputCount: 1 };
}

function makeWire(id: string): Wire {
  return createWire(id, { nodeId: 'n1', portIndex: 0, side: 'output' }, { nodeId: 'n2', portIndex: 0, side: 'input' });
}

describe('history-slice', () => {
  describe('initial state', () => {
    it('starts with empty undo and redo stacks', () => {
      const store = createTestStore();
      expect(store.getState().undoStack.length).toBe(0);
      expect(store.getState().redoStack.length).toBe(0);
    });
  });

  describe('auto-capture on graphVersion change', () => {
    it('pushes snapshot to undo stack when node is added', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      // Clear the history that setActiveBoard may have triggered
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      expect(store.getState().undoStack.length).toBe(1);
      expect(store.getState().undoStack[0].board.nodes.size).toBe(0); // snapshot of BEFORE the add
    });

    it('pushes snapshot when wire is added', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().addNode(makeNode('n2'));
      const beforeWire = store.getState().undoStack.length;

      store.getState().addWire(makeWire('w1'));
      expect(store.getState().undoStack.length).toBe(beforeWire + 1);
    });

    it('pushes snapshot when node params updated', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      const afterAdd = store.getState().undoStack.length;

      store.getState().updateNodeParams('n1', { mode: 'Subtract' });
      expect(store.getState().undoStack.length).toBe(afterAdd + 1);
    });

    it('pushes snapshot when node is removed', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      const afterAdd = store.getState().undoStack.length;

      store.getState().removeNode('n1');
      expect(store.getState().undoStack.length).toBe(afterAdd + 1);
      expect(store.getState().activeBoard!.nodes.size).toBe(0);
    });

    it('pushes snapshot when wire is removed', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().addNode(makeNode('n2'));
      store.getState().addWire(makeWire('w1'));
      const afterWire = store.getState().undoStack.length;

      store.getState().removeWire('w1');
      expect(store.getState().undoStack.length).toBe(afterWire + 1);
      expect(store.getState().activeBoard!.wires.length).toBe(0);
    });

    it('pushes snapshot when port constant is set', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().setPortConstant('n1', 0, 42);
      expect(store.getState().undoStack.length).toBe(1);
    });

    it('clears redo stack when new edit is made', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().undo();
      expect(store.getState().redoStack.length).toBe(1);

      // New edit should clear redo
      store.getState().addNode(makeNode('n2'));
      expect(store.getState().redoStack.length).toBe(0);
    });
  });

  describe('undo', () => {
    it('restores previous board state', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      expect(store.getState().activeBoard!.nodes.size).toBe(1);

      store.getState().undo();
      expect(store.getState().activeBoard!.nodes.size).toBe(0);
    });

    it('moves current state to redo stack', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().undo();

      expect(store.getState().redoStack.length).toBe(1);
      expect(store.getState().redoStack[0].board.nodes.size).toBe(1);
    });

    it('is a no-op when undo stack is empty', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      const before = store.getState().activeBoard;
      store.getState().undo();
      expect(store.getState().activeBoard).toBe(before);
    });

    it('does not push a new snapshot to undo stack (isRestoring flag)', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      expect(store.getState().undoStack.length).toBe(1);

      store.getState().undo();
      expect(store.getState().undoStack.length).toBe(0);
    });

    it('restores portConstants', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().setPortConstant('n1', 0, 42);
      expect(store.getState().portConstants.get('n1:0')).toBe(42);

      store.getState().undo();
      expect(store.getState().portConstants.has('n1:0')).toBe(false);
    });

    it('supports multiple sequential undos', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().addNode(makeNode('n2'));
      store.getState().addNode(makeNode('n3'));
      expect(store.getState().activeBoard!.nodes.size).toBe(3);

      store.getState().undo();
      expect(store.getState().activeBoard!.nodes.size).toBe(2);
      store.getState().undo();
      expect(store.getState().activeBoard!.nodes.size).toBe(1);
      store.getState().undo();
      expect(store.getState().activeBoard!.nodes.size).toBe(0);
    });
  });

  describe('redo', () => {
    it('restores undone state', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().undo();
      expect(store.getState().activeBoard!.nodes.size).toBe(0);

      store.getState().redo();
      expect(store.getState().activeBoard!.nodes.size).toBe(1);
    });

    it('is a no-op when redo stack is empty', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      const before = store.getState().activeBoard;
      store.getState().redo();
      expect(store.getState().activeBoard).toBe(before);
    });

    it('undo then redo is idempotent', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().addNode(makeNode('n2'));
      const stateAfterEdits = store.getState().activeBoard!.nodes.size;

      store.getState().undo();
      store.getState().redo();
      expect(store.getState().activeBoard!.nodes.size).toBe(stateAfterEdits);
    });
  });

  describe('history cap', () => {
    it('caps undo stack at 50 entries, keeping newest', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      for (let i = 0; i < 60; i++) {
        store.getState().addNode(makeNode(`n${i}`));
      }

      expect(store.getState().undoStack.length).toBe(50);
      // Oldest snapshot (0 nodes) should be evicted; newest retained
      // The 11th edit (index 10) left a snapshot with 10 nodes — that's the oldest kept
      expect(store.getState().undoStack[0].board.nodes.size).toBe(10);
      expect(store.getState().undoStack[49].board.nodes.size).toBe(59);
    });
  });

  describe('board switch clears history', () => {
    it('clears history when activeBoard changes to different board', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('board-1'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      expect(store.getState().undoStack.length).toBe(1);

      // Switch to different board
      store.getState().setActiveBoard(makeBoard('board-2'));
      expect(store.getState().undoStack.length).toBe(0);
      expect(store.getState().redoStack.length).toBe(0);
    });
  });

  describe('clearHistory', () => {
    it('empties both stacks', () => {
      const store = createTestStore();
      store.getState().setActiveBoard(makeBoard('main'));
      store.getState().clearHistory();

      store.getState().addNode(makeNode('n1'));
      store.getState().undo();
      expect(store.getState().undoStack.length).toBe(0);
      expect(store.getState().redoStack.length).toBe(1);

      store.getState().clearHistory();
      expect(store.getState().undoStack.length).toBe(0);
      expect(store.getState().redoStack.length).toBe(0);
    });
  });
});
