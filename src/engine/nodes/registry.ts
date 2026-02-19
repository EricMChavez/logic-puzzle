/**
 * Chip Registry
 *
 * Central registry of all fundamental chip definitions.
 * Auto-generates lookups by type and category.
 */

import type { ChipDefinition, ChipCategory, ParamValue } from './framework';
import { createDefaultParams } from './framework';
import {
  offsetChip,
  scaleChip,
  thresholdChip,
  addChip,
  maxChip,
  minChip,
  duplicateChip,
  divideChip,
  memoryChip,
  negateChip,
  ampChip,
} from './definitions';

// =============================================================================
// Chip Definitions Array (Single Source of Truth)
// =============================================================================

/**
 * All fundamental chip definitions.
 * To add a new chip: import it and add it to this array.
 */
const CHIP_DEFINITIONS: readonly ChipDefinition<Record<string, ParamValue>>[] = [
  offsetChip as ChipDefinition<Record<string, ParamValue>>,
  scaleChip as ChipDefinition<Record<string, ParamValue>>,
  thresholdChip as ChipDefinition<Record<string, ParamValue>>,
  addChip as ChipDefinition<Record<string, ParamValue>>,
  maxChip as ChipDefinition<Record<string, ParamValue>>,
  minChip as ChipDefinition<Record<string, ParamValue>>,
  duplicateChip as ChipDefinition<Record<string, ParamValue>>,
  divideChip as ChipDefinition<Record<string, ParamValue>>,
  memoryChip as ChipDefinition<Record<string, ParamValue>>,
  negateChip as ChipDefinition<Record<string, ParamValue>>,
  ampChip as ChipDefinition<Record<string, ParamValue>>,
] as const;

// =============================================================================
// Derived Lookups (Computed Once at Startup)
// =============================================================================

/** Lookup by chip type */
const byType = new Map<string, ChipDefinition<Record<string, ParamValue>>>(
  CHIP_DEFINITIONS.map((def) => [def.type, def]),
);

/** Lookup by category */
const byCategory = CHIP_DEFINITIONS.reduce(
  (acc, def) => {
    (acc[def.category] ??= []).push(def);
    return acc;
  },
  {} as Record<ChipCategory, ChipDefinition<Record<string, ParamValue>>[]>,
);

/** All type strings */
const allTypes = CHIP_DEFINITIONS.map((def) => def.type);

// =============================================================================
// Public API
// =============================================================================

/**
 * Chip registry providing lookups and utilities.
 */
export const chipRegistry = {
  /** Lookup by type string */
  byType,

  /** Lookup by category */
  byCategory,

  /** All registered type strings */
  allTypes,

  /** All chip definitions */
  all: CHIP_DEFINITIONS,
} as const;

/**
 * Get a chip definition by type.
 * Returns undefined for unknown types (puzzle:*, utility:*, etc.)
 */
export function getChipDefinition(
  type: string,
): ChipDefinition<Record<string, ParamValue>> | undefined {
  return byType.get(type);
}

/**
 * Check if a type is a registered fundamental chip.
 */
export function isFundamentalChip(type: string): boolean {
  return byType.has(type);
}

/**
 * Get the display label for a chip type.
 * Capitalizes first letter by default.
 */
export function getChipLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Create a params object with default values for a chip type.
 * Returns empty object if chip has no params or type is unknown.
 */
export function getDefaultParams(type: string): Record<string, ParamValue> {
  const def = byType.get(type);
  if (!def) return {};
  return createDefaultParams(def);
}

/**
 * Fundamental chip type union (derived from registry).
 */
export type FundamentalChipType = (typeof CHIP_DEFINITIONS)[number]['type'];

/**
 * Category labels for UI display.
 */
export const CATEGORY_LABELS: Record<ChipCategory, string> = {
  math: 'Math',
  routing: 'Routing',
  timing: 'Timing',
  custom: 'Custom',
};
