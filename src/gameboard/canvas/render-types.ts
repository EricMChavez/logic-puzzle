/**
 * Typed state-slice interfaces for each Canvas renderer.
 *
 * Each draw function receives only the slice of Zustand state it needs,
 * keeping render-loop.ts as the sole getState() bridge.
 */

import type { GameboardState, NodeState, Vec2 } from '../../shared/types/index.ts';
import type { InteractionMode } from '../../store/slices/interaction-slice.ts';
import type { PuzzleNodeEntry } from '../../store/slices/palette-slice.ts';
import type { UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';
import type { MeterKey, MeterSlotState } from '../meters/meter-types.ts';

/** Knob display state for a knob-equipped node (mixer, amp, etc.) */
export interface KnobInfo {
  value: number;
  isWired: boolean;
}

/** State needed by drawNodes */
export interface RenderNodesState {
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>;
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>;
  chips: ReadonlyMap<string, NodeState>;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  knobValues: ReadonlyMap<string, KnobInfo>;
  /** Signal value per port, keyed by `${chipId}:input:${portIndex}` or `${chipId}:output:${portIndex}`. */
  portSignals: ReadonlyMap<string, number>;
  /** Node ID whose knob is showing a rejected-click flash (wired knob was clicked) */
  rejectedKnobNodeId: string | null;
  /** Set of connected input port keys: `${chipId}:${portIndex}` */
  connectedInputPorts: ReadonlySet<string>;
  /** Set of node IDs reachable from input sources (live nodes) */
  liveNodeIds: ReadonlySet<string>;
}

/** State needed by renderConnectionPoints */
export interface RenderConnectionPointsState {
  activePuzzle: PuzzleDefinition | null;
  perPortMatch: readonly boolean[];
  /** Non-null when editing a utility node */
  editingUtilityId?: string | null;
  /** Meter slots for deriving CP directions during utility editing */
  meterSlots?: ReadonlyMap<MeterKey, MeterSlotState>;
  /** Latest signal value per CP, keyed by `${direction}:${cpIndex}` (e.g. "input:0", "output:1"). */
  cpSignals: ReadonlyMap<string, number>;
  /** Set of connected output CP keys: `output:${cpIndex}` */
  connectedOutputCPs: ReadonlySet<string>;
}

/** State needed by drawGrid */
export interface RenderGridState {
  /** Optional opacity multiplier (0-1) for grid dimming during zoom animations */
  gridOpacity?: number;
  /** Optional card title (Bungee font) for the board message card */
  tutorialTitle?: string;
  /** Optional tutorial message to render on the gameboard surface */
  tutorialMessage?: string;
}

/** State needed by meter rendering */
export interface RenderMetersState {
  meterSlots: ReadonlyMap<MeterKey, MeterSlotState>;
  activePuzzle: PuzzleDefinition | null;
}

/** State needed by ceremony draw functions */
export interface RenderCeremonyState {
  puzzleName: string;
  puzzleDescription: string;
}

/** State needed by the render loop to orchestrate all draw calls */
export interface RenderLoopState {
  activeBoard: GameboardState | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  interactionMode: InteractionMode;
  mousePosition: Vec2 | null;
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>;
  utilityNodes: ReadonlyMap<string, UtilityNodeEntry>;
  activePuzzle: PuzzleDefinition | null;
  perPortMatch: readonly boolean[];
}
