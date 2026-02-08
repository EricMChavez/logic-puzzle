/** Number of samples stored in each meter's circular buffer (16 WTS × 16 subdivisions) */
export const METER_BUFFER_CAPACITY = 256;

/** Number of meter slots per side (left / right) */
export const METERS_PER_SIDE = 3;

/** Grid rows each meter occupies (12 rows × 3 meters = 36 rows, no gaps, doubled density) */
export const METER_GRID_ROWS = 12;

/** Grid columns each meter occupies (matches meter zone width, doubled density) */
export const METER_GRID_COLS = 10;

/** Gap between meters in grid rows (0 to maximize meter height) */
export const METER_GAP_ROWS = 0;

/** Per-meter vertical offset in grid rows (spreads meters apart) */
export const METER_VERTICAL_OFFSETS = [-1, 0, 1] as const;

/** Visual state of a meter */
export type MeterVisualState = 'active' | 'hidden' | 'dimmed' | 'confirming' | 'mismatch';

/** Which side the meter is on */
export type MeterSide = 'left' | 'right';

/** Compound key identifying a specific meter slot */
export type MeterKey = `${MeterSide}:${number}`;

/** State of a single meter slot in the Zustand store */
export interface MeterSlotState {
  side: MeterSide;
  index: number;
  visualState: MeterVisualState;
  /** Direction of the associated connection point */
  direction: 'input' | 'output';
  /** Sequential index within this direction type (for buffer key lookup) */
  cpIndex?: number;
}

/** Build a MeterKey from side + index */
export function meterKey(side: MeterSide, index: number): MeterKey {
  return `${side}:${index}`;
}

/**
 * Channel layout ratios within a meter housing.
 * Needle and level bar are sized to match their original 6-col pixel widths
 * (0.10 × 6 = 0.6 cols, 0.30 × 6 = 1.8 cols) so only the waveform stretches.
 * Needle length = 4.0 × 6% = 24% of 10-col width = 2.4 cols (same as 40% of 6 cols).
 */
export const CHANNEL_RATIOS = {
  waveform: 0.754,
  gapA: 0.006,
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
