import { describe, it, expect } from 'vitest';
import { hotReplaceNodes } from './hot-replace.ts';
import type { GameboardState, NodeState } from '../shared/types/index.ts';
import type { BoardStackEntry } from './slices/navigation-slice.ts';
import type { UtilityNodeEntry } from './slices/palette-slice.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import { createDefaultMeterSlots } from './slices/meter-slice.ts';

function makeNode(id: string, type: string, overrides?: Partial<NodeState>): NodeState {
  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params: {},
    inputCount: 1,
    outputCount: 1,
    ...overrides,
  };
}

function makeBoard(id: string, chips: NodeState[]): GameboardState {
  const map = new Map<string, NodeState>();
  for (const n of chips) map.set(n.id, n);
  return { id, chips: map, paths: [] };
}

const fakeMeta: BakeMetadata = {
  topoOrder: [],
  nodeConfigs: [],
  edges: [],
  inputCount: 1,
  outputCount: 1,
};

function makeUtilityEntry(id: string, board: GameboardState): UtilityNodeEntry {
  return {
    utilityId: id,
    title: 'Test',
    inputCount: 1,
    outputCount: 1,
    bakeMetadata: fakeMeta,
    board,
    versionHash: 'old-hash',
  };
}

const patch = { inputCount: 2, outputCount: 3, libraryVersionHash: 'new-hash' };

describe('hotReplaceNodes', () => {
  it('returns empty object when no matches found', () => {
    const board = makeBoard('b1', [makeNode('n1', 'invert')]);
    const result = hotReplaceNodes('puzzle:p1', patch, board, [], new Map());
    expect(result).toEqual({});
  });

  it('updates matching nodes in activeBoard', () => {
    const board = makeBoard('b1', [
      makeNode('n1', 'puzzle:p1', { libraryVersionHash: 'old-hash' }),
      makeNode('n2', 'invert'),
    ]);
    const result = hotReplaceNodes('puzzle:p1', patch, board, [], new Map());

    expect(result.activeBoard).toBeDefined();
    const updated = result.activeBoard!.chips.get('n1')!;
    expect(updated.inputCount).toBe(2);
    expect(updated.outputCount).toBe(3);
    expect(updated.libraryVersionHash).toBe('new-hash');

    // Non-matching node is unchanged
    const unchanged = result.activeBoard!.chips.get('n2')!;
    expect(unchanged.inputCount).toBe(1);
    expect(unchanged.outputCount).toBe(1);
  });

  it('updates matching nodes in boardStack', () => {
    const stackBoard = makeBoard('s1', [
      makeNode('n1', 'utility:u1', { libraryVersionHash: 'old-hash' }),
    ]);
    const stackEntry: BoardStackEntry = {
      board: stackBoard,
      portConstants: new Map(),
      chipIdInParent: 'parent-node',
      readOnly: false,
      meterSlots: createDefaultMeterSlots(),
    };

    const result = hotReplaceNodes('utility:u1', patch, null, [stackEntry], new Map());

    expect(result.boardStack).toBeDefined();
    expect(result.boardStack).toHaveLength(1);
    const updated = result.boardStack![0].board.chips.get('n1')!;
    expect(updated.inputCount).toBe(2);
    expect(updated.outputCount).toBe(3);
    expect(updated.libraryVersionHash).toBe('new-hash');
  });

  it('updates matching nodes in utility node boards', () => {
    const utilBoard = makeBoard('ub1', [
      makeNode('n1', 'puzzle:p1', { libraryVersionHash: 'old-hash' }),
    ]);
    const utilityNodes = new Map<string, UtilityNodeEntry>();
    utilityNodes.set('u1', makeUtilityEntry('u1', utilBoard));

    const result = hotReplaceNodes('puzzle:p1', patch, null, [], utilityNodes);

    expect(result.utilityNodes).toBeDefined();
    const updatedEntry = result.utilityNodes!.get('u1')!;
    const updated = updatedEntry.board.chips.get('n1')!;
    expect(updated.inputCount).toBe(2);
    expect(updated.outputCount).toBe(3);
    expect(updated.libraryVersionHash).toBe('new-hash');
  });

  it('handles null activeBoard safely', () => {
    const result = hotReplaceNodes('puzzle:p1', patch, null, [], new Map());
    expect(result).toEqual({});
  });

  it('updated nodes have correct inputCount, outputCount, and libraryVersionHash', () => {
    const board = makeBoard('b1', [
      makeNode('a', 'puzzle:p1', { inputCount: 1, outputCount: 1, libraryVersionHash: 'old' }),
      makeNode('b', 'puzzle:p1', { inputCount: 1, outputCount: 1, libraryVersionHash: 'old' }),
    ]);

    const result = hotReplaceNodes('puzzle:p1', patch, board, [], new Map());
    expect(result.activeBoard).toBeDefined();

    for (const node of result.activeBoard!.chips.values()) {
      expect(node.inputCount).toBe(2);
      expect(node.outputCount).toBe(3);
      expect(node.libraryVersionHash).toBe('new-hash');
    }
  });
});
