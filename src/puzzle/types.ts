/** Supported waveform shapes for puzzle inputs/outputs */
export type WaveformShape = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'constant';

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
}

/** A single test case within a puzzle */
export interface PuzzleTestCase {
  name: string;
  /** One WaveformDef per active input connection point */
  inputs: WaveformDef[];
  /** One WaveformDef per active output connection point (the target) */
  expectedOutputs: WaveformDef[];
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
}
