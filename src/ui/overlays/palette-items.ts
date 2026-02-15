import type { UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import type { AllowedNodes } from '../../puzzle/types.ts';
import type { NodeState } from '../../shared/types/index.ts';
import { nodeRegistry, getNodeLabel, CATEGORY_LABELS } from '../../engine/nodes/registry.ts';
import type { NodeCategory } from '../../engine/nodes/framework.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';

export interface PaletteItem {
  id: string;
  nodeType: string;
  label: string;
  section: 'fundamental' | 'utility';
  category?: NodeCategory;
  /** null = no restrictions, -1 = unlimited, 0+ = count left */
  remaining: number | null;
  canPlace: boolean;
}

/**
 * Compute remaining budgets for each node type based on allowedNodes and board state.
 * Returns null if allowedNodes is null (no restrictions).
 */
export function computeRemainingBudgets(
  allowedNodes: AllowedNodes,
  boardNodes: ReadonlyMap<string, NodeState>,
): Map<string, number> | null {
  if (!allowedNodes) return null;

  // Count each non-CP node type currently on the board
  const onBoard = new Map<string, number>();
  for (const node of boardNodes.values()) {
    if (isConnectionPointNode(node.id)) continue;
    onBoard.set(node.type, (onBoard.get(node.type) ?? 0) + 1);
  }

  const budgets = new Map<string, number>();
  for (const [type, maxCount] of Object.entries(allowedNodes)) {
    if (maxCount === -1) {
      budgets.set(type, -1); // unlimited
    } else {
      const used = onBoard.get(type) ?? 0;
      budgets.set(type, Math.max(0, maxCount - used));
    }
  }

  return budgets;
}

/**
 * Build the list of palette items available for placement.
 * Filters fundamentals by allowedNodes if set, tracks remaining budgets.
 * Named utility nodes are always available when 'custom' is allowed.
 */
export function buildPaletteItems(
  allowedNodes: AllowedNodes,
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>,
  remainingBudgets: Map<string, number> | null,
): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Fundamental chips from registry
  for (const def of nodeRegistry.all) {
    // Skip if not in allowed list (when filtering is active)
    if (allowedNodes && !(def.type in allowedNodes)) continue;

    const remaining = remainingBudgets?.get(def.type) ?? null;
    const canPlace = remaining === null || remaining === -1 || remaining > 0;

    items.push({
      id: `fundamental:${def.type}`,
      nodeType: def.type,
      label: getNodeLabel(def.type),
      section: 'fundamental',
      category: def.category,
      remaining,
      canPlace,
    });
  }

  // "Custom" item and utility nodes — only available if 'custom' is in allowedNodes (or no restrictions)
  const customAllowed = !allowedNodes || ('custom' in allowedNodes);

  if (customAllowed) {
    const customRemaining = remainingBudgets?.get('custom') ?? null;
    const customCanPlace = customRemaining === null || customRemaining === -1 || customRemaining > 0;

    // Permanent "Custom" item — places a blank custom node on the board
    items.push({
      id: 'custom-blank',
      nodeType: 'custom-blank',
      label: 'Custom',
      section: 'fundamental',
      category: 'custom',
      remaining: customRemaining,
      canPlace: customCanPlace,
    });

    // Named utility nodes
    for (const entry of utilityNodes.values()) {
      items.push({
        id: `utility:${entry.utilityId}`,
        nodeType: `utility:${entry.utilityId}`,
        label: entry.title,
        section: 'utility',
        remaining: customRemaining,
        canPlace: customCanPlace,
      });
    }
  }

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
    } else if (item.section === 'utility') {
      groupKey = 'Utility Chips';
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
