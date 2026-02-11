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

  it('returns Set Parameters and Delete for mix node', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'mix' });
    expect(items.find((i) => i.action === 'set-params')).toBeTruthy();
    expect(items.find((i) => i.action === 'delete-node')).toBeTruthy();
  });

  it('returns Inspect for puzzle node', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'puzzle:half-wave' });
    expect(items.find((i) => i.action === 'inspect')).toBeTruthy();
  });

  it('returns Edit for utility node', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'utility:filter' });
    expect(items.find((i) => i.action === 'edit')).toBeTruthy();
  });

  it('returns Edit for custom-blank node', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'custom-blank' });
    expect(items.find((i) => i.action === 'edit')).toBeTruthy();
    expect(items.find((i) => i.action === 'delete-node')).toBeTruthy();
  });

  it('omits Set Parameters and Delete in read-only mode', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'mix' }, true);
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
    expect(items.find((i) => i.action === 'delete-node')).toBeFalsy();
  });

  it('returns only Delete for invert node (no params)', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'invert' });
    expect(items.length).toBe(1);
    expect(items[0].action).toBe('delete-node');
  });

  it('returns Delete for multiply node', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'multiply' });
    expect(items.find((i) => i.action === 'delete-node')).toBeTruthy();
    expect(items.find((i) => i.action === 'set-params')).toBeFalsy();
  });

  it('omits Delete for locked node', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'invert', locked: true });
    expect(items.find((i) => i.action === 'delete-node')).toBeFalsy();
  });

  it('shows Set Parameters for locked node with editable params', () => {
    const items = buildContextMenuItems({ type: 'node', nodeId: 'n1', nodeType: 'mix', locked: true });
    expect(items.find((i) => i.action === 'set-params')).toBeTruthy();
    expect(items.find((i) => i.action === 'delete-node')).toBeFalsy();
  });
});

describe('hasEditableParams', () => {
  it('returns true for mix, threshold, mixer, amp, diverter', () => {
    expect(hasEditableParams('mix')).toBe(true);
    expect(hasEditableParams('threshold')).toBe(true);
    expect(hasEditableParams('mixer')).toBe(true);
    expect(hasEditableParams('amp')).toBe(true);
    expect(hasEditableParams('diverter')).toBe(true);
  });

  it('returns false for non-parameterized types', () => {
    expect(hasEditableParams('multiply')).toBe(false);
    expect(hasEditableParams('invert')).toBe(false);
    expect(hasEditableParams('puzzle:abc')).toBe(false);
  });
});
