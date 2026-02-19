import type { ChipId } from '../../shared/types/index.ts';

/** Serializable config for a single chip in the baked graph. */
export interface BakedChipConfig {
  id: ChipId;
  type: string;
  params: Record<string, number | string | boolean>;
  socketCount: number;
  plugCount: number;
}

/** Serializable edge between two chips in the baked graph. */
export interface BakedEdge {
  fromChipId: ChipId;
  fromPort: number;
  toChipId: ChipId;
  toPort: number;
}

/** Serializable metadata describing the baked graph structure. */
export interface BakeMetadata {
  topoOrder: ChipId[];
  chipConfigs: BakedChipConfig[];
  edges: BakedEdge[];
  socketCount: number;
  plugCount: number;
  /** For utility chips: per-CP direction. CPs 0-2 = left, 3-5 = right. */
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
  cyclePath?: ChipId[];
}
