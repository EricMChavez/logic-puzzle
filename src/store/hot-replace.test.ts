import { describe, it, expect } from 'vitest';
import { hotReplaceChips } from './hot-replace.ts';
import type { GameboardState, ChipState } from '../shared/types/index.ts';
import type { BoardStackEntry } from './slices/navigation-slice.ts';
import type { CraftedUtilityEntry } from './slices/palette-slice.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import { createDefaultMeterSlots } from './slices/meter-slice.ts';

function makeNode(id: string, type: string, overrides?: Partial<ChipState>): ChipState {
  return {
    id,
    type,
    position: { col: 0, row: 0 },
    params: {},
    socketCount: 1,
    plugCount: 1,
    ...overrides,
  };
}

function makeBoard(id: string, chips: ChipState[]): GameboardState {
  const map = new Map<string, ChipState>();
  for (const n of chips) map.set(n.id, n);
  return { id, chips: map, paths: [] };
}

const fakeMeta: BakeMetadata = {
  topoOrder: [],
  chipConfigs: [],
  edges: [],
  socketCount: 1,
  plugCount: 1,
};

function makeUtilityEntry(id: string, board: GameboardState): CraftedUtilityEntry {
  return {
    utilityId: id,
    title: 'Test',
    socketCount: 1,
    plugCount: 1,
    bakeMetadata: fakeMeta,
    board,
    versionHash: 'old-hash',
  };
}

const patch = { socketCount: 2, plugCount: 3, libraryVersionHash: 'new-hash' };

describe('hotReplaceNodes', () => {
  it('returns empty object when no matches found', () => {
    const board = makeBoard('b1', [makeNode('n1', 'invert')]);
    const result = hotReplaceChips('puzzle:p1', patch, board, [], new Map());
    expect(result).toEqual({});
  });

  it('updates matching nodes in activeBoard', () => {
    const board = makeBoard('b1', [
      makeNode('n1', 'puzzle:p1', { libraryVersionHash: 'old-hash' }),
      makeNode('n2', 'invert'),
    ]);
    const result = hotReplaceChips('puzzle:p1', patch, board, [], new Map());

    expect(result.activeBoard).toBeDefined();
    const updated = result.activeBoard!.chips.get('n1')!;
    expect(updated.socketCount).toBe(2);
    expect(updated.plugCount).toBe(3);
    expect(updated.libraryVersionHash).toBe('new-hash');

    // Non-matching node is unchanged
    const unchanged = result.activeBoard!.chips.get('n2')!;
    expect(unchanged.socketCount).toBe(1);
    expect(unchanged.plugCount).toBe(1);
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

    const result = hotReplaceChips('utility:u1', patch, null, [stackEntry], new Map());

    expect(result.boardStack).toBeDefined();
    expect(result.boardStack).toHaveLength(1);
    const updated = result.boardStack![0].board.chips.get('n1')!;
    expect(updated.socketCount).toBe(2);
    expect(updated.plugCount).toBe(3);
    expect(updated.libraryVersionHash).toBe('new-hash');
  });

  it('updates matching nodes in utility node boards', () => {
    const utilBoard = makeBoard('ub1', [
      makeNode('n1', 'puzzle:p1', { libraryVersionHash: 'old-hash' }),
    ]);
    const craftedUtilities = new Map<string, CraftedUtilityEntry>();
    craftedUtilities.set('u1', makeUtilityEntry('u1', utilBoard));

    const result = hotReplaceChips('puzzle:p1', patch, null, [], craftedUtilities);

    expect(result.craftedUtilities).toBeDefined();
    const updatedEntry = result.craftedUtilities!.get('u1')!;
    const updated = updatedEntry.board.chips.get('n1')!;
    expect(updated.socketCount).toBe(2);
    expect(updated.plugCount).toBe(3);
    expect(updated.libraryVersionHash).toBe('new-hash');
  });

  it('handles null activeBoard safely', () => {
    const result = hotReplaceChips('puzzle:p1', patch, null, [], new Map());
    expect(result).toEqual({});
  });

  it('updated chips have correct socketCount, plugCount, and libraryVersionHash', () => {
    const board = makeBoard('b1', [
      makeNode('a', 'puzzle:p1', { socketCount: 1, plugCount: 1, libraryVersionHash: 'old' }),
      makeNode('b', 'puzzle:p1', { socketCount: 1, plugCount: 1, libraryVersionHash: 'old' }),
    ]);

    const result = hotReplaceChips('puzzle:p1', patch, board, [], new Map());
    expect(result.activeBoard).toBeDefined();

    for (const node of result.activeBoard!.chips.values()) {
      expect(node.socketCount).toBe(2);
      expect(node.plugCount).toBe(3);
      expect(node.libraryVersionHash).toBe('new-hash');
    }
  });
});
