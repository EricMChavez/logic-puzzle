/**
 * Chip Framework
 *
 * Single source of truth for chip definitions. Define a chip once here,
 * and everything else (palette, evaluation, rendering, params) derives from it.
 */

// =============================================================================
// Core Types
// =============================================================================

/** Signal value, always in [-100, +100] range */
export type Signal = number;

/** Parameter value types */
export type ParamValue = number | string | boolean;

/** Chip categories for palette organization */
export type ChipCategory =
  | 'math'
  | 'routing'
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

/** Physical side of a chip where a port can be placed */
export type PortSide = 'left' | 'right' | 'top' | 'bottom';

/** Defines a single socket or plug port */
export interface PortDefinition {
  /** Display name shown in UI: 'A', 'B', 'Control', 'Out' */
  name: string;
  /** Optional tooltip/description */
  description?: string;
  /** Override the default side for this port (sockets default to 'left', plugs to 'right') */
  side?: PortSide;
  /** Override the distributed position along the port's side (row for left/right, col for top/bottom) */
  gridPosition?: number;
  /** Links this socket port to a chip param key, making it a knob-controlled port */
  knob?: string;
}

// =============================================================================
// Parameter Definitions
// =============================================================================

/** Defines a player-adjustable parameter */
export interface ParamDefinition<TKey extends string = string> {
  /** Parameter key in chip.params */
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

/** Runtime state for stateful chips (Memory) */
export interface ChipRuntimeState {
  [key: string]: unknown;
}

/** Context passed to chip evaluation function */
export interface EvalContext<TParams extends Record<string, ParamValue> = Record<string, ParamValue>> {
  /** Current input values (indexed by port order) */
  inputs: readonly Signal[];
  /** Current parameter values */
  params: Readonly<TParams>;
  /** Mutable runtime state (only for stateful chips) */
  state?: ChipRuntimeState;
  /** Current simulation tick index */
  tickIndex: number;
}

/** Chip evaluation function signature */
export type ChipEvaluator<TParams extends Record<string, ParamValue> = Record<string, ParamValue>> =
  (ctx: EvalContext<TParams>) => Signal[];

// =============================================================================
// Chip Definition
// =============================================================================

/**
 * Complete definition of a chip type.
 *
 * Define this once, and the framework auto-generates:
 * - Palette entry
 * - Instantiation logic
 * - Evaluation routing
 * - Parameter UI
 * - Rendering
 */
export interface ChipDefinition<TParams extends Record<string, ParamValue> = Record<string, ParamValue>> {
  // ─── Identity ───────────────────────────────────────────────────────────────
  /** Unique type identifier: 'offset', 'scale', etc. */
  type: string;
  /** Category for palette grouping */
  category: ChipCategory;
  /** Short description shown in chip drawer tooltip */
  description?: string;

  // ─── Interface ──────────────────────────────────────────────────────────────
  /** Socket (input) port definitions (order matters) */
  sockets: PortDefinition[];
  /** Plug (output) port definitions (order matters) */
  plugs: PortDefinition[];

  // ─── Parameters ─────────────────────────────────────────────────────────────
  /** Optional player-adjustable parameters */
  params?: ParamDefinition<Extract<keyof TParams, string>>[];

  // ─── Evaluation ─────────────────────────────────────────────────────────────
  /** Pure evaluation function: inputs → outputs */
  evaluate: ChipEvaluator<TParams>;

  // ─── State ──────────────────────────────────────────────────────────────────
  /** Factory for runtime state (only for stateful chips) */
  createState?: () => ChipRuntimeState;

  // ─── Rendering ──────────────────────────────────────────────────────────────
  /** Size in grid cells */
  size: GridSize;
}

// =============================================================================
// Utility Types
// =============================================================================

/** Extract the type string from a chip definition */
export type ChipType<T extends ChipDefinition> = T['type'];

/** Extract params type from a chip definition */
export type ChipParams<T extends ChipDefinition> = T extends ChipDefinition<infer P> ? P : never;

// =============================================================================
// Factory Helpers
// =============================================================================

/**
 * Create a chip definition with full type inference.
 * Use this to ensure type safety when defining chips.
 */
export function defineChip<TParams extends Record<string, ParamValue> = Record<string, ParamValue>>(
  definition: ChipDefinition<TParams>,
): ChipDefinition<TParams> {
  return definition;
}

/**
 * Create default params object from a chip definition.
 */
export function createDefaultParams<TParams extends Record<string, ParamValue>>(
  definition: ChipDefinition<TParams>,
): TParams {
  const params = {} as Record<string, ParamValue>;
  for (const p of definition.params ?? []) {
    params[p.key] = p.default;
  }
  return params as TParams;
}

/** Knob configuration derived from a chip definition's socket ports. */
export interface KnobConfig {
  portIndex: number;
  paramKey: string;
}

/**
 * Get the knob configuration from a chip definition.
 * Scans socket ports for one with a `knob` field set, returning the port index and param key.
 * Returns null if the definition has no knob port.
 */
export function getKnobConfig(
  def: ChipDefinition<Record<string, ParamValue>> | undefined,
): KnobConfig | null {
  if (!def) return null;
  for (let i = 0; i < def.sockets.length; i++) {
    const port = def.sockets[i];
    if (port.knob) {
      return { portIndex: i, paramKey: port.knob };
    }
  }
  return null;
}
