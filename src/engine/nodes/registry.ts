/**
 * Node Registry
 *
 * Central registry of all fundamental node definitions.
 * Auto-generates lookups by type and category.
 */

import type { NodeDefinition, NodeCategory, ParamValue } from './framework';
import { createDefaultParams } from './framework';
import {
  inverterNode,
  delayNode,
  mixerNode,
  ampNode,
  faderNode,
  polarizerNode,
  shifterNode,
} from './definitions';

// =============================================================================
// Node Definitions Array (Single Source of Truth)
// =============================================================================

/**
 * All fundamental node definitions.
 * To add a new node: import it and add it to this array.
 */
const NODE_DEFINITIONS: readonly NodeDefinition<Record<string, ParamValue>>[] = [
  inverterNode,
  delayNode as NodeDefinition<Record<string, ParamValue>>,
  mixerNode as NodeDefinition<Record<string, ParamValue>>,
  ampNode as NodeDefinition<Record<string, ParamValue>>,
  faderNode as NodeDefinition<Record<string, ParamValue>>,
  polarizerNode,
  shifterNode as NodeDefinition<Record<string, ParamValue>>,
] as const;

// =============================================================================
// Derived Lookups (Computed Once at Startup)
// =============================================================================

/** Lookup by node type */
const byType = new Map<string, NodeDefinition<Record<string, ParamValue>>>(
  NODE_DEFINITIONS.map((def) => [def.type, def]),
);

/** Lookup by category */
const byCategory = NODE_DEFINITIONS.reduce(
  (acc, def) => {
    (acc[def.category] ??= []).push(def);
    return acc;
  },
  {} as Record<NodeCategory, NodeDefinition<Record<string, ParamValue>>[]>,
);

/** All type strings */
const allTypes = NODE_DEFINITIONS.map((def) => def.type);

// =============================================================================
// Public API
// =============================================================================

/**
 * Node registry providing lookups and utilities.
 */
export const nodeRegistry = {
  /** Lookup by type string */
  byType,

  /** Lookup by category */
  byCategory,

  /** All registered type strings */
  allTypes,

  /** All node definitions */
  all: NODE_DEFINITIONS,
} as const;

/**
 * Get a node definition by type.
 * Returns undefined for unknown types (puzzle:*, utility:*, etc.)
 */
export function getNodeDefinition(
  type: string,
): NodeDefinition<Record<string, ParamValue>> | undefined {
  return byType.get(type);
}

/**
 * Check if a type is a registered fundamental node.
 */
export function isFundamentalNode(type: string): boolean {
  return byType.has(type);
}

/**
 * Get the display label for a node type.
 * Capitalizes first letter by default.
 */
export function getNodeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Create a params object with default values for a node type.
 * Returns empty object if node has no params or type is unknown.
 */
export function getDefaultParams(type: string): Record<string, ParamValue> {
  const def = byType.get(type);
  if (!def) return {};
  return createDefaultParams(def);
}

/**
 * Fundamental node type union (derived from registry).
 */
export type FundamentalNodeType = (typeof NODE_DEFINITIONS)[number]['type'];

/**
 * Category labels for UI display.
 */
export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  math: 'Math',
  routing: 'Routing',
  timing: 'Timing',
  custom: 'Custom',
};
