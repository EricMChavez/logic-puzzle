/**
 * Node Framework
 *
 * Single source of truth for node definitions. Define a node once here,
 * and everything else (palette, evaluation, rendering, params) derives from it.
 */

// =============================================================================
// Core Types
// =============================================================================

/** Signal value, always in [-100, +100] range */
export type Signal = number;

/** Parameter value types */
export type ParamValue = number | string | boolean;

/** Node categories for palette organization */
export type NodeCategory =
  | 'source'
  | 'math'
  | 'routing'
  | 'shaping'
  | 'timing'
  | 'custom';

/** Grid size in cells */
export interface GridSize {
  width: number;
  height: number;
}

// =============================================================================
// Port Definitions
// =============================================================================

/** Defines a single input or output port */
export interface PortDefinition {
  /** Display name shown in UI: 'A', 'B', 'Control', 'Out' */
  name: string;
  /** Optional tooltip/description */
  description?: string;
}

// =============================================================================
// Parameter Definitions
// =============================================================================

/** Defines a player-adjustable parameter */
export interface ParamDefinition<TKey extends string = string> {
  /** Parameter key in node.params */
  key: TKey;
  /** Value type */
  type: 'number' | 'string' | 'boolean';
  /** Default value */
  default: ParamValue;
  /** Display label */
  label: string;
  /** For numbers: minimum value */
  min?: number;
  /** For numbers: maximum value */
  max?: number;
  /** For numbers: step increment */
  step?: number;
  /** For strings: allowed values (enum-like) */
  options?: string[];
}

// =============================================================================
// Evaluation Context
// =============================================================================

/** Runtime state for stateful nodes (Shaper, Delay) */
export interface NodeRuntimeState {
  [key: string]: unknown;
}

/** Context passed to node evaluation function */
export interface EvalContext<TParams extends Record<string, ParamValue> = Record<string, ParamValue>> {
  /** Current input values (indexed by port order) */
  inputs: readonly Signal[];
  /** Current parameter values */
  params: Readonly<TParams>;
  /** Mutable runtime state (only for stateful nodes) */
  state?: NodeRuntimeState;
  /** Current simulation tick index */
  tickIndex: number;
}

/** Node evaluation function signature */
export type NodeEvaluator<TParams extends Record<string, ParamValue> = Record<string, ParamValue>> =
  (ctx: EvalContext<TParams>) => Signal[];

// =============================================================================
// Node Definition
// =============================================================================

/**
 * Complete definition of a node type.
 *
 * Define this once, and the framework auto-generates:
 * - Palette entry
 * - Instantiation logic
 * - Evaluation routing
 * - Parameter UI
 * - Rendering
 */
export interface NodeDefinition<TParams extends Record<string, ParamValue> = Record<string, ParamValue>> {
  // ─── Identity ───────────────────────────────────────────────────────────────
  /** Unique type identifier: 'constant', 'scaler', etc. */
  type: string;
  /** Category for palette grouping */
  category: NodeCategory;

  // ─── Interface ──────────────────────────────────────────────────────────────
  /** Input port definitions (order matters) */
  inputs: PortDefinition[];
  /** Output port definitions (order matters) */
  outputs: PortDefinition[];

  // ─── Parameters ─────────────────────────────────────────────────────────────
  /** Optional player-adjustable parameters */
  params?: ParamDefinition<Extract<keyof TParams, string>>[];

  // ─── Evaluation ─────────────────────────────────────────────────────────────
  /** Pure evaluation function: inputs → outputs */
  evaluate: NodeEvaluator<TParams>;

  // ─── State ──────────────────────────────────────────────────────────────────
  /** Factory for runtime state (only for stateful nodes) */
  createState?: () => NodeRuntimeState;

  // ─── Rendering ──────────────────────────────────────────────────────────────
  /** Size in grid cells */
  size: GridSize;
}

// =============================================================================
// Utility Types
// =============================================================================

/** Extract the type string from a node definition */
export type NodeType<T extends NodeDefinition> = T['type'];

/** Extract params type from a node definition */
export type NodeParams<T extends NodeDefinition> = T extends NodeDefinition<infer P> ? P : never;

// =============================================================================
// Factory Helpers
// =============================================================================

/**
 * Create a node definition with full type inference.
 * Use this to ensure type safety when defining nodes.
 */
export function defineNode<TParams extends Record<string, ParamValue> = Record<string, ParamValue>>(
  definition: NodeDefinition<TParams>,
): NodeDefinition<TParams> {
  return definition;
}

/**
 * Create default params object from a node definition.
 */
export function createDefaultParams<TParams extends Record<string, ParamValue>>(
  definition: NodeDefinition<TParams>,
): TParams {
  const params = {} as Record<string, ParamValue>;
  for (const p of definition.params ?? []) {
    params[p.key] = p.default;
  }
  return params as TParams;
}
