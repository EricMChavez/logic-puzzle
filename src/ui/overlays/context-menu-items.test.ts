import { describe, it, expect } from 'vitest';
import { buildContextMenuItems, hasEditableParams } from './context-menu-items.ts';

describe('buildContextMenuItems', () => {
  it('returns Delete Wire for wire target', () => {
    const items = buildContextMenuItems({ type: 'wire', wireId: 'w1' });
    expect(items.length).toBe(1);
    expect(items[0].action).toBe('delete-wire');
    expect(items[0].danger).toBe(true);
  });

  it('returns empty for wire target in read-only mode', () => {
    const items = buildContextMenuItems({ type: 'wire', wireId: 'w1' }, true);
    expect(items.length).toBe(0);
  });

  it('returns Delete for max node (no Set Parameters)', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'max' });
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
    expect(items.find((i) => i.action === 'delete-node')).toBeTruthy();
  });

  it('returns Inspect for puzzle node', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'puzzle:half-wave' });
    expect(items.find((i) => i.action === 'inspect')).toBeTruthy();
  });

  it('returns Edit for utility node', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'utility:filter' });
    expect(items.find((i) => i.action === 'edit')).toBeTruthy();
  });

  it('returns Edit for custom-blank node', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'custom-blank' });
    expect(items.find((i) => i.action === 'edit')).toBeTruthy();
    expect(items.find((i) => i.action === 'delete-node')).toBeTruthy();
  });

  it('omits Delete in read-only mode', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'max' }, true);
    expect(items.find((i) => i.action === 'delete-node')).toBeFalsy();
  });

  it('returns only Delete for min node (no params)', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'min' });
    expect(items.length).toBe(1);
    expect(items[0].action).toBe('delete-node');
  });

  it('returns Delete for memory node', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'memory' });
    expect(items.find((i) => i.action === 'delete-node')).toBeTruthy();
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
  });

  it('omits Delete for locked node', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'min', locked: true });
    expect(items.find((i) => i.action === 'delete-node')).toBeFalsy();
  });

  it('omits Delete for locked node with editable params', () => {
    const items = buildContextMenuItems({ type: 'node', chipId: 'n1', nodeType: 'scale', locked: true });
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
    expect(items.find((i) => i.action === 'delete-node')).toBeFalsy();
  });
});

describe('hasEditableParams', () => {
  it('returns true for parameterized node types', () => {
    expect(hasEditableParams('threshold')).toBe(true);
    expect(hasEditableParams('scale')).toBe(true);
    expect(hasEditableParams('offset')).toBe(true);
  });

  it('returns false for non-parameterized types', () => {
    expect(hasEditableParams('max')).toBe(false);
    expect(hasEditableParams('min')).toBe(false);
    expect(hasEditableParams('split')).toBe(false);
    expect(hasEditableParams('memory')).toBe(false);
    expect(hasEditableParams('puzzle:abc')).toBe(false);
  });
});
