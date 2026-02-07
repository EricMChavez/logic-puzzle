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

/** Number of signal buffer entries per wire (1 WTS = 16 subdivisions) */
export const WIRE_BUFFER_SIZE = 16;

/** A wire connecting two ports, carrying signal state via ring buffer */
export interface Wire {
  id: string;
  source: PortRef;
  target: PortRef;
  /** Auto-routed path through the grid (set by routing-slice, empty until Story 6.2) */
  path: GridPoint[];
  /** Ring buffer of signal values, size WIRE_BUFFER_SIZE (16) */
  signalBuffer: number[];
  /** Current write position in the ring buffer */
  writeHead: number;
}

/** The type of a fundamental node */
export type FundamentalNodeType =
  | 'multiply'
  | 'mix'
  | 'invert'
  | 'threshold'
  | 'delay'
  | 'constant';

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
}

/** Complete state of a gameboard */
export interface GameboardState {
  id: GameboardId;
  nodes: Map<NodeId, NodeState>;
  wires: Wire[];
}

/** Creates a new wire with an empty signal buffer */
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
    signalBuffer: new Array(WIRE_BUFFER_SIZE).fill(0),
    writeHead: 0,
  };
}
