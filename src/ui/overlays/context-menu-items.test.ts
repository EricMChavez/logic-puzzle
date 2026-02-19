import { describe, it, expect } from 'vitest';
import { buildContextMenuItems, hasEditableParams } from './context-menu-items.ts';

describe('buildContextMenuItems', () => {
  it('returns Delete Path for path target', () => {
    const items = buildContextMenuItems({ type: 'path', pathId: 'w1' });
    expect(items.length).toBe(1);
    expect(items[0].action).toBe('delete-path');
    expect(items[0].danger).toBe(true);
  });

  it('returns empty for path target in read-only mode', () => {
    const items = buildContextMenuItems({ type: 'path', pathId: 'w1' }, true);
    expect(items.length).toBe(0);
  });

  it('returns Delete for max chip (no Set Parameters)', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'max' });
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
    expect(items.find((i) => i.action === 'delete-chip')).toBeTruthy();
  });

  it('returns Inspect for puzzle chip', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'puzzle:half-wave' });
    expect(items.find((i) => i.action === 'inspect')).toBeTruthy();
  });

  it('returns Edit for utility chip', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'utility:filter' });
    expect(items.find((i) => i.action === 'edit')).toBeTruthy();
  });

  it('returns Edit for custom-blank chip', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'custom-blank' });
    expect(items.find((i) => i.action === 'edit')).toBeTruthy();
    expect(items.find((i) => i.action === 'delete-chip')).toBeTruthy();
  });

  it('omits Delete in read-only mode', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'max' }, true);
    expect(items.find((i) => i.action === 'delete-chip')).toBeFalsy();
  });

  it('returns only Delete for min chip (no params)', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'min' });
    expect(items.length).toBe(1);
    expect(items[0].action).toBe('delete-chip');
  });

  it('returns Delete for memory chip', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'memory' });
    expect(items.find((i) => i.action === 'delete-chip')).toBeTruthy();
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
  });

  it('omits Delete for locked chip', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'min', locked: true });
    expect(items.find((i) => i.action === 'delete-chip')).toBeFalsy();
  });

  it('omits Delete for locked chip with editable params', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'scale', locked: true });
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
    expect(items.find((i) => i.action === 'delete-chip')).toBeFalsy();
  });

  it('returns Export for custom puzzle chip on gameboard', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'puzzle:my-puzzle', isCustomPuzzle: true });
    expect(items.find((i) => i.action === 'export')).toBeTruthy();
  });

  it('returns Export for custom puzzle chip on motherboard', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'menu:custom-my-puzzle', isCustomPuzzle: true });
    expect(items.find((i) => i.action === 'export')).toBeTruthy();
  });

  it('does not return Export for built-in puzzle chip', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'puzzle:half-wave' });
    expect(items.find((i) => i.action === 'export')).toBeFalsy();
  });

  it('returns both Inspect and Export for custom puzzle chip on gameboard', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'puzzle:my-puzzle', isCustomPuzzle: true });
    const inspect = items.find((i) => i.action === 'inspect');
    const exportItem = items.find((i) => i.action === 'export');
    expect(inspect).toBeTruthy();
    expect(exportItem).toBeTruthy();
    // Export comes after Inspect
    expect(items.indexOf(exportItem!)).toBeGreaterThan(items.indexOf(inspect!));
  });

  it('returns Export without Inspect for motherboard custom chip', () => {
    const items = buildContextMenuItems({ type: 'chip', chipId: 'n1', chipType: 'menu:custom-my-puzzle', isCustomPuzzle: true });
    expect(items.find((i) => i.action === 'inspect')).toBeFalsy();
    expect(items.find((i) => i.action === 'export')).toBeTruthy();
  });
});

describe('hasEditableParams', () => {
  it('returns true for parameterized chip types', () => {
    expect(hasEditableParams('threshold')).toBe(true);
    expect(hasEditableParams('scale')).toBe(true);
    expect(hasEditableParams('offset')).toBe(true);
  });

  it('returns false for non-parameterized types', () => {
    expect(hasEditableParams('max')).toBe(false);
    expect(hasEditableParams('min')).toBe(false);
    expect(hasEditableParams('duplicate')).toBe(false);
    expect(hasEditableParams('memory')).toBe(false);
    expect(hasEditableParams('puzzle:abc')).toBe(false);
  });
});
