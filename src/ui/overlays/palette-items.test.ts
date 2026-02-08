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

  it('includes all fundamentals plus custom-blank when no allowedNodes', () => {
    const items = buildPaletteItems(null, new Map(), new Map(), new Set());
    // fundamentals + 1 custom-blank
    expect(items.length).toBe(fundamentalCount + 1);
    const fundamentals = items.filter((i) => i.section === 'fundamental');
    expect(fundamentals.length).toBe(fundamentalCount);
    const customBlank = items.find((i) => i.id === 'custom-blank');
    expect(customBlank).toBeTruthy();
    expect(customBlank!.section).toBe('utility');
  });

  it('filters fundamentals by allowedNodes but always includes custom-blank', () => {
    const items = buildPaletteItems(['inverter'], new Map(), new Map(), new Set());
    // 1 fundamental + 1 custom-blank
    expect(items.length).toBe(2);
    expect(items[0].nodeType).toBe('inverter');
    expect(items[1].id).toBe('custom-blank');
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
    const items = buildPaletteItems(['p1', 'inverter'], puzzles, new Map(), completed);
    const puzzleItems = items.filter((i) => i.section === 'puzzle');
    expect(puzzleItems.length).toBe(1);
    expect(puzzleItems[0].nodeType).toBe('puzzle:p1');
  });

  it('includes utility nodes regardless of allowedNodes', () => {
    const utilities = new Map([['u1', makeUtilityEntry('u1', 'My Filter')]]);
    const items = buildPaletteItems(['inverter'], new Map(), utilities, new Set());
    const utilityItems = items.filter((i) => i.section === 'utility');
    // 1 named utility + 1 custom-blank
    expect(utilityItems.length).toBe(2);
    expect(utilityItems[0].label).toBe('My Filter');
    expect(utilityItems[1].id).toBe('custom-blank');
  });

  it('returns only utility nodes when allowedNodes is empty array', () => {
    const utilities = new Map([['u1', makeUtilityEntry('u1', 'My Filter')]]);
    const items = buildPaletteItems([], new Map(), utilities, new Set());
    // 1 named utility + 1 custom-blank
    expect(items.length).toBe(2);
    expect(items.every((i) => i.section === 'utility')).toBe(true);
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
    // fundamentals + custom-blank
    expect(filterPaletteItems(items, '').length).toBe(nodeRegistry.all.length + 1);
    expect(filterPaletteItems(items, '  ').length).toBe(nodeRegistry.all.length + 1);
  });

  it('filters by case-insensitive substring', () => {
    const filtered = filterPaletteItems(items, 'inv');
    expect(filtered.length).toBe(1);
    expect(filtered[0].label).toBe('Inverter');
  });

  it('returns no results for non-matching query', () => {
    expect(filterPaletteItems(items, 'zzz').length).toBe(0);
  });
});
