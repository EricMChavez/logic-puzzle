export interface ContextMenuItem {
  id: string;
  label: string;
  action: string;
  danger?: boolean;
}

export type ContextTarget =
  | { type: 'node'; nodeId: string; nodeType: string; locked?: boolean }
  | { type: 'wire'; wireId: string };

/**
 * Build context menu items for a given target element.
 * @param target - The element that was right-clicked
 * @param isReadOnly - Whether the current board is read-only
 */
export function buildContextMenuItems(
  target: ContextTarget,
  isReadOnly = false,
): ContextMenuItem[] {
  if (target.type === 'wire') {
    if (isReadOnly) return [];
    return [
      { id: 'delete-wire', label: 'Delete Wire', action: 'delete-wire', danger: true },
    ];
  }

  if (target.type === 'node') {
    const items: ContextMenuItem[] = [];

    if (hasEditableParams(target.nodeType) && !isReadOnly) {
      items.push({ id: 'set-params', label: 'Set Parameters', action: 'set-params' });
    }

    if (target.nodeType.startsWith('puzzle:')) {
      items.push({ id: 'inspect', label: 'Inspect', action: 'inspect' });
    }

    if (target.nodeType.startsWith('utility:') || target.nodeType === 'custom-blank') {
      items.push({ id: 'edit', label: 'Edit', action: 'edit' });
    }

    if (!isReadOnly && !target.locked) {
      items.push({ id: 'delete-node', label: 'Delete Node', action: 'delete-node', danger: true });
    }

    return items;
  }

  return [];
}

/** Returns true for node types that have user-editable parameters */
export function hasEditableParams(nodeType: string): boolean {
  return nodeType === 'mix' || nodeType === 'threshold' || nodeType === 'mixer' || nodeType === 'amp' || nodeType === 'diverter';
}
