/** Supported waveform shapes for puzzle inputs/outputs.
 *  Full = 256, Half = 128, Third ≈ 85.33, Quarter = 64, Sixth ≈ 42.67 ticks per cycle. */
export type WaveformShape =
  | 'sine-full' | 'sine-half' | 'sine-third' | 'sine-quarter' | 'sine-fifth' | 'sine-sixth'
  | 'sine-full-reduced' | 'sine-half-reduced' | 'sine-third-reduced' | 'sine-quarter-reduced' | 'sine-fifth-reduced' | 'sine-sixth-reduced'
  | 'triangle-full' | 'triangle-half' | 'triangle-third' | 'triangle-quarter' | 'triangle-fifth' | 'triangle-sixth'
  | 'triangle-full-reduced' | 'triangle-half-reduced' | 'triangle-third-reduced' | 'triangle-quarter-reduced' | 'triangle-fifth-reduced' | 'triangle-sixth-reduced'
  | 'square-full' | 'square-half' | 'square-third' | 'square-quarter' | 'square-fifth' | 'square-sixth'
  | 'square-full-reduced' | 'square-half-reduced' | 'square-third-reduced' | 'square-quarter-reduced' | 'square-fifth-reduced' | 'square-sixth-reduced'
  | 'sawtooth-full' | 'sawtooth-half' | 'sawtooth-third' | 'sawtooth-quarter' | 'sawtooth-fifth' | 'sawtooth-sixth'
  | 'sawtooth-full-reduced' | 'sawtooth-half-reduced' | 'sawtooth-third-reduced' | 'sawtooth-quarter-reduced' | 'sawtooth-fifth-reduced' | 'sawtooth-sixth-reduced'
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

// =============================================================================
// SlotConfig — flat 0-5 slot index system
// =============================================================================

/** Definition of a single slot (0-5) on the gameboard edge. */
export interface SlotDef {
  active: boolean;
  direction: 'input' | 'output';
}

/**
 * Configuration for all 6 connection point slots on a gameboard.
 * Slot 0-2 = left side (top/mid/bottom), Slot 3-5 = right side (top/mid/bottom).
 * Physical side is always derived: `slotSide(i)`.
 */
export type SlotConfig = readonly [SlotDef, SlotDef, SlotDef, SlotDef, SlotDef, SlotDef];

/**
 * Build a SlotConfig from activeInputs/activeOutputs counts.
 * Inputs fill left slots top-down (0, 1, 2). Outputs fill right slots top-down (3, 4, 5).
 */
export function buildSlotConfig(activeInputs: number, activeOutputs: number): SlotConfig {
  return [
    { active: 0 < activeInputs, direction: 'input' },
    { active: 1 < activeInputs, direction: 'input' },
    { active: 2 < activeInputs, direction: 'input' },
    { active: 0 < activeOutputs, direction: 'output' },
    { active: 1 < activeOutputs, direction: 'output' },
    { active: 2 < activeOutputs, direction: 'output' },
  ] as SlotConfig;
}

/**
 * Build a SlotConfig from a 6-element directions array.
 * 'off' slots are marked inactive. 'input'/'output' mapped to their actual direction.
 */
export function buildSlotConfigFromDirections(
  dirs: readonly ('input' | 'output' | 'off')[],
): SlotConfig {
  const slots: SlotDef[] = [];
  for (let i = 0; i < 6; i++) {
    const dir = dirs[i] ?? 'off';
    slots.push({
      active: dir !== 'off',
      direction: dir === 'off' ? (i < 3 ? 'input' : 'output') : dir,
    });
  }
  return slots as unknown as SlotConfig;
}

/**
 * Map a per-direction index ("the Nth input" or "the Nth output") to a flat slot index.
 * Returns -1 if not found.
 */
export function directionIndexToSlot(
  config: SlotConfig,
  direction: 'input' | 'output',
  dirIndex: number,
): number {
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (config[i].active && config[i].direction === direction) {
      if (count === dirIndex) return i;
      count++;
    }
  }
  return -1;
}

/**
 * Map a flat slot index to a per-direction index ("this slot is the Nth output").
 * Returns -1 if the slot is inactive or not found.
 */
export function slotToDirectionIndex(config: SlotConfig, slotIndex: number): number {
  const slot = config[slotIndex];
  if (!slot?.active) return -1;
  let count = 0;
  for (let i = 0; i < slotIndex; i++) {
    if (config[i].active && config[i].direction === slot.direction) {
      count++;
    }
  }
  return count;
}

/**
 * Derive a 6-element directions array from a SlotConfig.
 */
export function slotConfigToDirections(config: SlotConfig): ('input' | 'output' | 'off')[] {
  return config.map(s => s.active ? s.direction : 'off');
}

// =============================================================================
// Legacy ConnectionPointConfig (deprecated — bridges during migration)
// =============================================================================

/** @deprecated Use SlotDef instead */
export interface ConnectionPointSlot {
  active: boolean;
  direction: 'input' | 'output';
  cpIndex?: number;
}

/** @deprecated Use SlotConfig instead */
export interface ConnectionPointConfig {
  left: ConnectionPointSlot[];
  right: ConnectionPointSlot[];
}

/** @deprecated Use buildSlotConfig instead */
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

/** @deprecated Use buildSlotConfigFromDirections instead */
export function buildCustomNodeConnectionPointConfig(): ConnectionPointConfig {
  return buildUtilityConnectionPointConfig(['input', 'input', 'input', 'output', 'output', 'output']);
}

/** @deprecated Use buildSlotConfigFromDirections instead */
export function buildUtilityConnectionPointConfig(
  directions: readonly ('input' | 'output' | 'off')[],
): ConnectionPointConfig {
  const left: ConnectionPointSlot[] = [];
  for (let i = 0; i < 3; i++) {
    const dir = directions[i];
    left.push({
      active: dir !== 'off',
      direction: dir === 'off' ? 'input' : dir,
      cpIndex: i,
    });
  }
  const right: ConnectionPointSlot[] = [];
  for (let i = 0; i < 3; i++) {
    const dir = directions[i + 3];
    right.push({
      active: dir !== 'off',
      direction: dir === 'off' ? 'output' : dir,
      cpIndex: i,
    });
  }
  return { left, right };
}

/**
 * Convert a SlotConfig to a legacy ConnectionPointConfig.
 * Bridges new code to old consumers during migration.
 */
export function slotConfigToConnectionPointConfig(config: SlotConfig): ConnectionPointConfig {
  const left: ConnectionPointSlot[] = [];
  const right: ConnectionPointSlot[] = [];
  // Count per-direction indices
  let inputIdx = 0;
  let outputIdx = 0;
  for (let i = 0; i < 3; i++) {
    const slot = config[i];
    left.push({
      active: slot.active,
      direction: slot.direction,
      cpIndex: slot.active ? (slot.direction === 'input' ? inputIdx++ : outputIdx++) : i,
    });
  }
  for (let i = 3; i < 6; i++) {
    const slot = config[i];
    right.push({
      active: slot.active,
      direction: slot.direction,
      cpIndex: slot.active ? (slot.direction === 'input' ? inputIdx++ : outputIdx++) : i - 3,
    });
  }
  return { left, right };
}

/** A user-defined waveform entry (paste into custom-waveforms.ts). */
export interface CustomWaveformEntry {
  id: string;
  name: string;
  samples: number[]; // 256 values, each [-100, +100]
}

/** null = all chips unlimited. Record maps chip type → max count (-1 = unlimited). */
export type AllowedChips = Record<string, number> | null;

/** Serialized chip for initial puzzle state */
export interface InitialChipDef {
  id: string;
  type: string;
  position: { col: number; row: number };
  params: Record<string, unknown>;
  socketCount: number;
  plugCount: number;
  rotation?: 0 | 90 | 180 | 270;
  /** If true, chip cannot be moved/deleted by the player. Default: true for built-in, false for custom. */
  locked?: boolean;
}

/** Serialized path for initial puzzle state */
export interface InitialPathDef {
  source: { chipId: string; portIndex: number };
  target: { chipId: string; portIndex: number };
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
  /** Chip types the player may use. null = all unlimited. Record maps type → max count (-1 = unlimited). */
  allowedChips: AllowedChips;
  /** Test cases the player's circuit must satisfy */
  testCases: PuzzleTestCase[];
  /** Flat slot configuration (derived from activeInputs/activeOutputs if not set).
   *  Slots 0-2 = left, 3-5 = right. Replaces connectionPoints. */
  slotConfig?: SlotConfig;
  /** @deprecated Use slotConfig instead */
  connectionPoints?: ConnectionPointConfig;
  /** Chips pre-placed on the board when the puzzle starts */
  initialChips?: InitialChipDef[];
  /** Paths pre-connected when the puzzle starts */
  initialPaths?: InitialPathDef[];
  /** Optional tutorial message rendered on the gameboard surface (under dots and streak) */
  tutorialMessage?: string;
  /** Optional card title (rendered in Bungee font above tutorialMessage) */
  tutorialTitle?: string;
}
