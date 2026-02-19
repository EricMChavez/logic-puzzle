import { getChipDefinition } from '../../engine/nodes/registry.ts';

export interface ContextMenuItem {
  id: string;
  label: string;
  action: string;
  danger?: boolean;
}

export type ContextTarget =
  | { type: 'chip'; chipId: string; chipType: string; locked?: boolean; isCustomPuzzle?: boolean }
  | { type: 'path'; pathId: string };

/**
 * Build context menu items for a given target element.
 * @param target - The element that was right-clicked
 * @param isReadOnly - Whether the current board is read-only
 */
export function buildContextMenuItems(
  target: ContextTarget,
  isReadOnly = false,
): ContextMenuItem[] {
  if (target.type === 'path') {
    if (isReadOnly) return [];
    return [
      { id: 'delete-path', label: 'Delete Path', action: 'delete-path', danger: true },
    ];
  }

  if (target.type === 'chip') {
    const items: ContextMenuItem[] = [];

    if (target.chipType.startsWith('puzzle:')) {
      items.push({ id: 'inspect', label: 'Inspect', action: 'inspect' });
    }

    if (target.isCustomPuzzle) {
      items.push({ id: 'export', label: 'Export', action: 'export' });
    }

    if (target.chipType.startsWith('utility:') || target.chipType === 'custom-blank') {
      items.push({ id: 'edit', label: 'Edit', action: 'edit' });
    }

    if (!isReadOnly && !target.locked) {
      items.push({ id: 'delete-chip', label: 'Delete Chip', action: 'delete-chip', danger: true });
    }

    return items;
  }

  return [];
}

/** Returns true for chip types that have user-editable parameters */
export function hasEditableParams(chipType: string): boolean {
  const def = getChipDefinition(chipType);
  if (def) return (def.params?.length ?? 0) > 0;
  return false;
}
