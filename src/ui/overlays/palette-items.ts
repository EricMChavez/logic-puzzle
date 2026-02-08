import type { PuzzleNodeEntry, UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import { nodeRegistry, getNodeLabel, CATEGORY_LABELS } from '../../engine/nodes/registry.ts';
import type { NodeCategory } from '../../engine/nodes/framework.ts';

export interface PaletteItem {
  id: string;
  nodeType: string;
  label: string;
  section: 'fundamental' | 'puzzle' | 'utility';
  category?: NodeCategory;
}

/**
 * Build the list of palette items available for placement.
 * Filters fundamentals and puzzles by allowedNodes if set.
 * In creative mode, all puzzle nodes are available regardless of completion.
 */
export function buildPaletteItems(
  allowedNodes: ReadonlyArray<string> | null,
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>,
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>,
  completedLevels: ReadonlySet<string>,
  isCreativeMode = false,
): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Fundamental nodes from registry
  for (const def of nodeRegistry.all) {
    // Skip if not in allowed list (when filtering is active)
    if (allowedNodes && !allowedNodes.includes(def.type)) continue;

    items.push({
      id: `fundamental:${def.type}`,
      nodeType: def.type,
      label: getNodeLabel(def.type),
      section: 'fundamental',
      category: def.category,
    });
  }

  // Puzzle nodes (must be completed AND allowed, unless in creative mode)
  for (const entry of puzzleNodes.values()) {
    // In creative mode, all puzzle nodes are available
    if (!isCreativeMode && !completedLevels.has(entry.puzzleId)) continue;
    if (allowedNodes && !allowedNodes.includes(entry.puzzleId)) continue;
    items.push({
      id: `puzzle:${entry.puzzleId}`,
      nodeType: `puzzle:${entry.puzzleId}`,
      label: entry.title,
      section: 'puzzle',
    });
  }

  // Utility nodes (always available)
  for (const entry of utilityNodes.values()) {
    items.push({
      id: `utility:${entry.utilityId}`,
      nodeType: `utility:${entry.utilityId}`,
      label: entry.title,
      section: 'utility',
    });
  }

  // Permanent "Custom" item — places a blank custom node on the board
  items.push({
    id: 'custom-blank',
    nodeType: 'custom-blank',
    label: 'Custom',
    section: 'utility',
  });

  return items;
}

/**
 * Filter palette items by a search query (case-insensitive substring match on label).
 */
export function filterPaletteItems(items: ReadonlyArray<PaletteItem>, query: string): PaletteItem[] {
  if (!query.trim()) return [...items];
  const lower = query.toLowerCase().trim();
  return items.filter((item) => item.label.toLowerCase().includes(lower));
}

/**
 * Group palette items by category for display.
 */
export function groupPaletteItemsByCategory(items: ReadonlyArray<PaletteItem>): Map<string, PaletteItem[]> {
  const groups = new Map<string, PaletteItem[]>();

  for (const item of items) {
    let groupKey: string;
    if (item.section === 'fundamental' && item.category) {
      groupKey = CATEGORY_LABELS[item.category];
    } else if (item.section === 'puzzle') {
      groupKey = 'Puzzle Nodes';
    } else if (item.section === 'utility') {
      groupKey = 'Utility Nodes';
    } else {
      groupKey = 'Other';
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(item);
  }

  return groups;
}
