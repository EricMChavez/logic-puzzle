import type { GridPoint } from '../grid/types';

/** Unique identifier for a node instance */
export type NodeId = string;

/** Valid rotation angles for nodes (degrees clockwise) */
export type NodeRotation = 0 | 90 | 180 | 270;

/** Unique identifier for a gameboard */
export type GameboardId = string;

/** 2D pixel position vector (used at render time only) */
export interface Vec2 {
  x: number;
  y: number;
}

/** Reference to a specific port on a node */
export interface PortRef {
  nodeId: NodeId;
  portIndex: number;
  side: 'input' | 'output';
}

/** A wire connecting two ports */
export interface Wire {
  id: string;
  source: PortRef;
  target: PortRef;
  /** Auto-routed path through the grid */
  path: GridPoint[];
}

/** The type of a fundamental node */
export type FundamentalNodeType =
  | 'offset'
  | 'scale'
  | 'threshold'
  | 'max'
  | 'min'
  | 'memory'
  | 'split';

/** State of a single node on a gameboard */
export interface NodeState {
  id: NodeId;
  type: string;
  position: GridPoint;
  params: Record<string, number | string | boolean>;
  /** Number of input ports */
  inputCount: number;
  /** Number of output ports */
  outputCount: number;
  /** Version hash from the library entry at placement time */
  libraryVersionHash?: string;
  /** Node rotation (0, 90, 180, or 270 degrees). Default 0. */
  rotation?: NodeRotation;
  /** If true, node cannot be deleted (used for starting nodes in custom puzzles) */
  locked?: boolean;
}

/** Complete state of a gameboard */
export interface GameboardState {
  id: GameboardId;
  nodes: Map<NodeId, NodeState>;
  wires: Wire[];
}

/** Creates a new wire */
export function createWire(
  id: string,
  source: PortRef,
  target: PortRef,
): Wire {
  return {
    id,
    source,
    target,
    path: [],
  };
}
