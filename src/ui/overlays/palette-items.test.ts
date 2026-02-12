import { describe, it, expect } from 'vitest';
import { buildPaletteItems, computeRemainingBudgets, filterPaletteItems } from './palette-items.ts';
import type { UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import { nodeRegistry } from '../../engine/nodes/registry.ts';

function makeUtilityEntry(utilityId: string, title: string): UtilityNodeEntry {
  return {
    utilityId,
    title,
    inputCount: 1,
    outputCount: 1,
    bakeMetadata: { topoOrder: [], nodeConfigs: [], edges: [], inputCount: 1, outputCount: 1 },
    board: { id: utilityId, nodes: new Map(), wires: [] },
    versionHash: 'v1',
  };
}

describe('buildPaletteItems', () => {
  const fundamentalCount = nodeRegistry.all.length;

  it('includes all fundamentals plus custom-blank when no allowedNodes', () => {
    const items = buildPaletteItems(null, new Map(), null);
    // fundamentals + 1 custom-blank
    expect(items.length).toBe(fundamentalCount + 1);
    const fundamentals = items.filter((i) => i.section === 'fundamental');
    expect(fundamentals.length).toBe(fundamentalCount + 1);
    const customBlank = items.find((i) => i.id === 'custom-blank');
    expect(customBlank).toBeTruthy();
    expect(customBlank!.section).toBe('fundamental');
    expect(customBlank!.category).toBe('custom');
    expect(customBlank!.remaining).toBeNull();
    expect(customBlank!.canPlace).toBe(true);
  });

  it('excludes custom-blank when custom is not in allowedNodes', () => {
    const items = buildPaletteItems({ offset: -1 }, new Map(), new Map([['offset', -1]]));
    // 1 fundamental only (no custom-blank since 'custom' not in allowedNodes)
    expect(items.length).toBe(1);
    expect(items[0].nodeType).toBe('offset');
    expect(items.find((i) => i.id === 'custom-blank')).toBeUndefined();
  });

  it('includes custom-blank and utility nodes when custom is in allowedNodes', () => {
    const utilities = new Map([['u1', makeUtilityEntry('u1', 'My Filter')]]);
    const budgets = new Map([['offset', -1], ['custom', -1]]);
    const items = buildPaletteItems({ offset: -1, custom: -1 }, utilities, budgets);
    // 1 fundamental + 1 custom-blank + 1 utility
    expect(items.length).toBe(3);
    expect(items[0].nodeType).toBe('offset');
    expect(items[1].id).toBe('custom-blank');
    expect(items[2].section).toBe('utility');
  });

  it('excludes utility nodes when custom is not in allowedNodes', () => {
    const utilities = new Map([['u1', makeUtilityEntry('u1', 'My Filter')]]);
    const items = buildPaletteItems({ offset: -1 }, utilities, new Map([['offset', -1]]));
    const utilityItems = items.filter((i) => i.section === 'utility');
    expect(utilityItems.length).toBe(0);
  });

  it('returns empty when allowedNodes is empty object', () => {
    const utilities = new Map([['u1', makeUtilityEntry('u1', 'My Filter')]]);
    const items = buildPaletteItems({}, utilities, new Map());
    // Nothing allowed
    expect(items.length).toBe(0);
  });

  it('does not include utility section when no named utility nodes exist', () => {
    const items = buildPaletteItems(null, new Map(), null);
    const utilityItems = items.filter((i) => i.section === 'utility');
    expect(utilityItems.length).toBe(0);
  });

  it('marks depleted items as canPlace: false', () => {
    const budgets = new Map([['offset', 0]]);
    const items = buildPaletteItems({ offset: 2 }, new Map(), budgets);
    expect(items.length).toBe(1);
    expect(items[0].canPlace).toBe(false);
    expect(items[0].remaining).toBe(0);
  });

  it('shows remaining count for limited items', () => {
    const budgets = new Map([['offset', 3]]);
    const items = buildPaletteItems({ offset: 5 }, new Map(), budgets);
    expect(items.length).toBe(1);
    expect(items[0].remaining).toBe(3);
    expect(items[0].canPlace).toBe(true);
  });

  it('shows unlimited for -1 budget items', () => {
    const budgets = new Map([['offset', -1]]);
    const items = buildPaletteItems({ offset: -1 }, new Map(), budgets);
    expect(items.length).toBe(1);
    expect(items[0].remaining).toBe(-1);
    expect(items[0].canPlace).toBe(true);
  });
});

describe('computeRemainingBudgets', () => {
  it('returns null when allowedNodes is null', () => {
    expect(computeRemainingBudgets(null, new Map())).toBeNull();
  });

  it('computes remaining for unlimited types', () => {
    const budgets = computeRemainingBudgets({ offset: -1 }, new Map());
    expect(budgets).not.toBeNull();
    expect(budgets!.get('offset')).toBe(-1);
  });

  it('subtracts board nodes from budgets', () => {
    const nodes = new Map([
      ['n1', { id: 'n1', type: 'offset', position: { col: 10, row: 10 }, params: {}, inputCount: 1, outputCount: 1 }],
      ['n2', { id: 'n2', type: 'offset', position: { col: 15, row: 10 }, params: {}, inputCount: 1, outputCount: 1 }],
    ]);
    const budgets = computeRemainingBudgets({ offset: 5 }, nodes as any);
    expect(budgets!.get('offset')).toBe(3);
  });

  it('clamps remaining at 0', () => {
    const nodes = new Map([
      ['n1', { id: 'n1', type: 'offset', position: { col: 10, row: 10 }, params: {}, inputCount: 1, outputCount: 1 }],
    ]);
    const budgets = computeRemainingBudgets({ offset: 0 }, nodes as any);
    expect(budgets!.get('offset')).toBe(0);
  });
});

describe('filterPaletteItems', () => {
  const items = buildPaletteItems(null, new Map(), null);

  it('returns all items when query is empty', () => {
    // fundamentals + custom-blank
    expect(filterPaletteItems(items, '').length).toBe(nodeRegistry.all.length + 1);
    expect(filterPaletteItems(items, '  ').length).toBe(nodeRegistry.all.length + 1);
  });

  it('filters by case-insensitive substring', () => {
    const filtered = filterPaletteItems(items, 'sca');
    expect(filtered.length).toBe(1);
    expect(filtered[0].label).toBe('Scale');
  });

  it('returns no results for non-matching query', () => {
    expect(filterPaletteItems(items, 'zzz').length).toBe(0);
  });
});
