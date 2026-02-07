import { describe, it, expect } from 'vitest';
import { buildPaletteItems, filterPaletteItems } from './palette-items.ts';
import type { PuzzleNodeEntry, UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import { nodeRegistry } from '../../engine/nodes/registry.ts';

function makePuzzleEntry(puzzleId: string, title: string): PuzzleNodeEntry {
  return {
    puzzleId,
    title,
    description: '',
    inputCount: 1,
    outputCount: 1,
    bakeMetadata: { delays: [], evaluationOrder: [], nodeDelays: new Map() },
    versionHash: 'v1',
  };
}

function makeUtilityEntry(utilityId: string, title: string): UtilityNodeEntry {
  return {
    utilityId,
    title,
    inputCount: 1,
    outputCount: 1,
    bakeMetadata: { delays: [], evaluationOrder: [], nodeDelays: new Map() },
    board: { id: utilityId, nodes: new Map(), wires: [] },
    versionHash: 'v1',
  };
}

describe('buildPaletteItems', () => {
  const fundamentalCount = nodeRegistry.all.length;

  it('includes all fundamentals when no allowedNodes', () => {
    const items = buildPaletteItems(null, new Map(), new Map(), new Set());
    expect(items.length).toBe(fundamentalCount);
    expect(items.every((i) => i.section === 'fundamental')).toBe(true);
  });

  it('filters fundamentals by allowedNodes', () => {
    const items = buildPaletteItems(['constant'], new Map(), new Map(), new Set());
    expect(items.length).toBe(1);
    expect(items[0].nodeType).toBe('constant');
  });

  it('includes completed puzzle nodes', () => {
    const puzzles = new Map([['p1', makePuzzleEntry('p1', 'Half Wave')]]);
    const completed = new Set(['p1']);
    const items = buildPaletteItems(null, puzzles, new Map(), completed);
    const puzzleItems = items.filter((i) => i.section === 'puzzle');
    expect(puzzleItems.length).toBe(1);
    expect(puzzleItems[0].label).toBe('Half Wave');
    expect(puzzleItems[0].nodeType).toBe('puzzle:p1');
  });

  it('excludes incomplete puzzle nodes', () => {
    const puzzles = new Map([['p1', makePuzzleEntry('p1', 'Half Wave')]]);
    const items = buildPaletteItems(null, puzzles, new Map(), new Set());
    expect(items.filter((i) => i.section === 'puzzle').length).toBe(0);
  });

  it('filters puzzle nodes by allowedNodes', () => {
    const puzzles = new Map([
      ['p1', makePuzzleEntry('p1', 'Half Wave')],
      ['p2', makePuzzleEntry('p2', 'Full Wave')],
    ]);
    const completed = new Set(['p1', 'p2']);
    const items = buildPaletteItems(['p1', 'constant'], puzzles, new Map(), completed);
    const puzzleItems = items.filter((i) => i.section === 'puzzle');
    expect(puzzleItems.length).toBe(1);
    expect(puzzleItems[0].nodeType).toBe('puzzle:p1');
  });

  it('includes utility nodes regardless of allowedNodes', () => {
    const utilities = new Map([['u1', makeUtilityEntry('u1', 'My Filter')]]);
    const items = buildPaletteItems(['constant'], new Map(), utilities, new Set());
    const utilityItems = items.filter((i) => i.section === 'utility');
    expect(utilityItems.length).toBe(1);
    expect(utilityItems[0].label).toBe('My Filter');
  });

  it('returns only utility nodes when allowedNodes is empty array', () => {
    const utilities = new Map([['u1', makeUtilityEntry('u1', 'My Filter')]]);
    const items = buildPaletteItems([], new Map(), utilities, new Set());
    // Only utility nodes since fundamentals are filtered out
    expect(items.length).toBe(1);
    expect(items[0].section).toBe('utility');
  });

  it('includes all puzzle nodes in creative mode regardless of completion', () => {
    const puzzles = new Map([
      ['p1', makePuzzleEntry('p1', 'Half Wave')],
      ['p2', makePuzzleEntry('p2', 'Full Wave')],
    ]);
    // No levels completed but creative mode enabled
    const items = buildPaletteItems(null, puzzles, new Map(), new Set(), true);
    const puzzleItems = items.filter((i) => i.section === 'puzzle');
    expect(puzzleItems.length).toBe(2);
  });
});

describe('filterPaletteItems', () => {
  const items = buildPaletteItems(null, new Map(), new Map(), new Set());

  it('returns all items when query is empty', () => {
    expect(filterPaletteItems(items, '').length).toBe(nodeRegistry.all.length);
    expect(filterPaletteItems(items, '  ').length).toBe(nodeRegistry.all.length);
  });

  it('filters by case-insensitive substring', () => {
    const filtered = filterPaletteItems(items, 'const');
    expect(filtered.length).toBe(1);
    expect(filtered[0].label).toBe('Constant');
  });

  it('returns no results for non-matching query', () => {
    expect(filterPaletteItems(items, 'zzz').length).toBe(0);
  });
});
