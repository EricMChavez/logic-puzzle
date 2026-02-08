/** Supported waveform shapes for puzzle inputs/outputs */
export type WaveformShape = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'constant'
  | 'rectified-sine' | 'rectified-triangle' | 'clipped-sine'
  | 'fullwave-rectified-sine' | 'fullwave-rectified-triangle'
  | 'samples';

/** Definition of a single waveform signal */
export interface WaveformDef {
  shape: WaveformShape;
  /** Peak amplitude (signal range units, 0–100) */
  amplitude: number;
  /** Period in ticks */
  period: number;
  /** Phase offset in ticks */
  phase: number;
  /** DC offset added after scaling */
  offset: number;
  /** Raw samples for 'samples' shape (loops when tick exceeds length) */
  samples?: number[];
}

/** A single test case within a puzzle */
export interface PuzzleTestCase {
  name: string;
  /** One WaveformDef per active input connection point */
  inputs: WaveformDef[];
  /** One WaveformDef per active output connection point (the target) */
  expectedOutputs: WaveformDef[];
}

/** Configuration for a single connection point slot */
export interface ConnectionPointSlot {
  /** Whether this connection point is active (visible and usable) */
  active: boolean;
  /** Direction: 'input' emits signals into the board, 'output' receives signals */
  direction: 'input' | 'output';
  /** Sequential index within this direction type (e.g., 0th input, 1st output).
   *  Used by the render loop to build the correct buffer key (direction:cpIndex). */
  cpIndex?: number;
}

/**
 * Configuration for all 6 connection point slots on a gameboard.
 * Left side: 3 slots (indices 0-2), Right side: 3 slots (indices 0-2).
 */
export interface ConnectionPointConfig {
  /** Left-side connection point slots (up to 3) */
  left: ConnectionPointSlot[];
  /** Right-side connection point slots (up to 3) */
  right: ConnectionPointSlot[];
}

/**
 * Build a ConnectionPointConfig from activeInputs/activeOutputs counts.
 * Inputs occupy left slots, outputs occupy right slots.
 */
export function buildConnectionPointConfig(
  activeInputs: number,
  activeOutputs: number,
): ConnectionPointConfig {
  const left: ConnectionPointSlot[] = [];
  for (let i = 0; i < 3; i++) {
    left.push({ active: i < activeInputs, direction: 'input', cpIndex: i });
  }
  const right: ConnectionPointSlot[] = [];
  for (let i = 0; i < 3; i++) {
    right.push({ active: i < activeOutputs, direction: 'output', cpIndex: i });
  }
  return { left, right };
}

/**
 * Build a ConnectionPointConfig for utility node editing (bidirectional CPs).
 * All 6 slots are active. Left slots report as 'input', right as 'output'
 * for hit-testing purposes (the actual direction is determined by wiring).
 */
export function buildCustomNodeConnectionPointConfig(): ConnectionPointConfig {
  return {
    left: [
      { active: true, direction: 'input', cpIndex: 0 },
      { active: true, direction: 'input', cpIndex: 1 },
      { active: true, direction: 'input', cpIndex: 2 },
    ],
    right: [
      { active: true, direction: 'output', cpIndex: 0 },
      { active: true, direction: 'output', cpIndex: 1 },
      { active: true, direction: 'output', cpIndex: 2 },
    ],
  };
}

/** Complete definition of a puzzle level */
export interface PuzzleDefinition {
  id: string;
  title: string;
  description: string;
  /** Number of active input connection points (1–3) */
  activeInputs: number;
  /** Number of active output connection points (1–3) */
  activeOutputs: number;
  /** Node types the player may use. null = all allowed */
  allowedNodes: string[] | null;
  /** Test cases the player's circuit must satisfy */
  testCases: PuzzleTestCase[];
  /** Connection point configuration (derived from activeInputs/activeOutputs if not set) */
  connectionPoints?: ConnectionPointConfig;
}
