import type { NodeId } from '../../shared/types/index.ts';

/** Serializable config for a single node in the baked graph. */
export interface BakedNodeConfig {
  id: NodeId;
  type: string;
  params: Record<string, number | string | boolean>;
  inputCount: number;
  outputCount: number;
}

/** Serializable edge between two nodes in the baked graph. */
export interface BakedEdge {
  fromNodeId: NodeId;
  fromPort: number;
  toNodeId: NodeId;
  toPort: number;
  wtsDelay: number;
}

/** Serializable metadata describing the baked graph structure. */
export interface BakeMetadata {
  topoOrder: NodeId[];
  nodeConfigs: BakedNodeConfig[];
  edges: BakedEdge[];
  inputDelays: number[];
  inputCount: number;
  outputCount: number;
  /** For utility nodes: per-CP direction. CPs 0-2 = left, 3-5 = right. */
  cpLayout?: ('input' | 'output' | 'off')[];
}

/** Result of baking a graph: an evaluate closure plus serializable metadata. */
export interface BakeResult {
  evaluate: (inputs: number[]) => number[];
  metadata: BakeMetadata;
}

/** Error type for bake failures. */
export interface BakeError {
  message: string;
  cyclePath?: NodeId[];
}
