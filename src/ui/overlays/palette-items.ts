import type { CraftedUtilityEntry } from '../../store/slices/palette-slice.ts';
import type { AllowedChips } from '../../puzzle/types.ts';
import type { ChipState } from '../../shared/types/index.ts';
import { chipRegistry, getChipLabel, CATEGORY_LABELS } from '../../engine/nodes/registry.ts';
import type { ChipCategory } from '../../engine/nodes/framework.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';

export interface PaletteItem {
  id: string;
  chipType: string;
  label: string;
  section: 'fundamental' | 'utility';
  category?: ChipCategory;
  /** null = no restrictions, -1 = unlimited, 0+ = count left */
  remaining: number | null;
  canPlace: boolean;
}

/**
 * Compute remaining budgets for each chip type based on allowedChips and board state.
 * Returns null if allowedChips is null (no restrictions).
 */
export function computeRemainingBudgets(
  allowedChips: AllowedChips,
  boardChips: ReadonlyMap<string, ChipState>,
): Map<string, number> | null {
  if (!allowedChips) return null;

  // Count each non-CP chip type currently on the board
  const onBoard = new Map<string, number>();
  for (const chip of boardChips.values()) {
    if (isConnectionPointNode(chip.id)) continue;
    onBoard.set(chip.type, (onBoard.get(chip.type) ?? 0) + 1);
  }

  const budgets = new Map<string, number>();
  for (const [type, maxCount] of Object.entries(allowedChips)) {
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
 * Filters fundamentals by allowedChips if set, tracks remaining budgets.
 * Named utility chips are always available when 'custom' is allowed.
 */
export function buildPaletteItems(
  allowedChips: AllowedChips,
  craftedUtilities: ReadonlyMap<string, CraftedUtilityEntry>,
  remainingBudgets: Map<string, number> | null,
): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Fundamental chips from registry
  for (const def of chipRegistry.all) {
    // Skip if not in allowed list (when filtering is active)
    if (allowedChips && !(def.type in allowedChips)) continue;

    const remaining = remainingBudgets?.get(def.type) ?? null;
    const canPlace = remaining === null || remaining === -1 || remaining > 0;

    items.push({
      id: `fundamental:${def.type}`,
      chipType: def.type,
      label: getChipLabel(def.type),
      section: 'fundamental',
      category: def.category,
      remaining,
      canPlace,
    });
  }

  // "Custom" item and utility chips — only available if 'custom' is in allowedChips (or no restrictions)
  const customAllowed = !allowedChips || ('custom' in allowedChips);

  if (customAllowed) {
    const customRemaining = remainingBudgets?.get('custom') ?? null;
    const customCanPlace = customRemaining === null || customRemaining === -1 || customRemaining > 0;

    // Permanent "Custom" item — places a blank custom chip on the board
    items.push({
      id: 'custom-blank',
      chipType: 'custom-blank',
      label: 'Custom',
      section: 'fundamental',
      category: 'custom',
      remaining: customRemaining,
      canPlace: customCanPlace,
    });

    // Named utility chips
    for (const entry of craftedUtilities.values()) {
      items.push({
        id: `utility:${entry.utilityId}`,
        chipType: `utility:${entry.utilityId}`,
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
