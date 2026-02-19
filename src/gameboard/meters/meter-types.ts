import { TOTAL_SLOTS, slotSide, slotPerSideIndex } from '../../shared/grid/slot-helpers';

/** Number of samples stored in each meter (256 cycles) */
export const METER_BUFFER_CAPACITY = 256;

/** @deprecated Use SLOTS_PER_SIDE from slot-helpers instead */
export const METERS_PER_SIDE = 3;

/** Grid rows each meter occupies (12 rows × 3 meters = 36 rows, no gaps, doubled density) */
export const METER_GRID_ROWS = 12;

/** Grid columns each meter occupies (matches meter zone width, doubled density) */
export const METER_GRID_COLS = 10;

/** Gap between meters in grid rows (0 to maximize meter height) */
export const METER_GAP_ROWS = 0;

/** Per-meter vertical offset in grid rows (spreads meters apart) */
export const METER_VERTICAL_OFFSETS = [-1, 0, 1] as const;

/**
 * Combined mode for a meter slot — replaces separate direction + visualState fields.
 * - 'input'  — active, emits signal into board, CP = full circle
 * - 'output' — active, receives signal from board, CP = cutout socket
 * - 'off'    — visible but inactive, shows housing + X indicator, clickable for configuration
 * - 'hidden' — completely invisible, not rendered, not clickable
 */
export type MeterMode = 'input' | 'output' | 'off' | 'hidden';

/** Which side the meter is on */
export type MeterSide = 'left' | 'right';

/** Compound key identifying a specific meter slot. Now uses flat slot index. */
export type MeterKey = `slot:${number}`;

/** State of a single meter slot in the Zustand store. Slot index is the map key — side/index derived. */
export interface MeterSlotState {
  mode: MeterMode;
}

/** Extract the signal direction from a meter mode. Off/hidden default to 'input'. */
export function modeToDirection(mode: MeterMode): 'input' | 'output' {
  return mode === 'output' ? 'output' : 'input';
}

/** Whether a meter mode represents an active, signal-carrying state. */
export function isMeterActive(mode: MeterMode): boolean {
  return mode === 'input' || mode === 'output';
}

/**
 * Derive a 6-element directions array from meter slots.
 * Slots keyed by `slot:0` through `slot:5`.
 */
export function deriveDirectionsFromMeterSlots(
  meterSlots: ReadonlyMap<MeterKey, MeterSlotState>,
): ('input' | 'output' | 'off')[] {
  const directions: ('input' | 'output' | 'off')[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = meterSlots.get(meterKey(i));
    const mode = slot?.mode ?? 'off';
    directions.push(mode === 'hidden' ? 'off' : mode === 'off' ? 'off' : mode);
  }
  return directions;
}

/** Build a MeterKey from a flat slot index (0-5). */
export function meterKey(slotIndex: number): MeterKey;
/** @deprecated Build a MeterKey from side + index. Use meterKey(slotIndex) instead. */
export function meterKey(side: MeterSide, index: number): MeterKey;
export function meterKey(sideOrSlot: MeterSide | number, index?: number): MeterKey {
  if (typeof sideOrSlot === 'number') {
    return `slot:${sideOrSlot}`;
  }
  // Legacy: convert side+index to flat slot index
  const slotIndex = sideOrSlot === 'left' ? index! : index! + 3;
  return `slot:${slotIndex}`;
}

/** Get the physical side for a meter key. */
export function meterKeyToSide(key: MeterKey): MeterSide {
  const slotIndex = meterKeyToSlotIndex(key);
  return slotSide(slotIndex);
}

/** Get the per-side index for a meter key. */
export function meterKeyToPerSideIndex(key: MeterKey): number {
  const slotIndex = meterKeyToSlotIndex(key);
  return slotPerSideIndex(slotIndex);
}

/** Extract the slot index from a MeterKey. */
export function meterKeyToSlotIndex(key: MeterKey): number {
  return parseInt(key.split(':')[1], 10);
}

/**
 * Channel layout ratios within a meter housing.
 * Needle and level bar are sized to match their original 6-col pixel widths
 * (0.10 × 6 = 0.6 cols, 0.30 × 6 = 1.8 cols) so only the waveform stretches.
 * Needle length = 4.0 × 6% = 24% of 10-col width = 2.4 cols (same as 40% of 6 cols).
 */
export const CHANNEL_RATIOS = {
  waveform: 0.754,
  gapA: 0.00,
  levelBar: 0.18,
  gapB: 0.00,
  needle: 0.06,
} as const;

/**
 * Vertical height ratio for waveform and level bar channels.
 * Matches the needle's vertical span at ±60° from horizontal.
 * Vertical span = needleLength × sin(60°) × 2 = needleLength × √3
 * Needle length = 2.4 cols (unchanged from original 6-col layout).
 * With meter height = 12 rows: ratio = (2.4 × √3) / 12 ≈ 0.346
 */
export const VERTICAL_HEIGHT_RATIO = 0.35;
