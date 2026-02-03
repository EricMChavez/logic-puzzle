/** Node rendering dimensions */
export const NODE_CONFIG = {
  WIDTH: 140,
  HEIGHT: 60,
  BORDER_RADIUS: 6,
  PORT_RADIUS: 6,
  PORT_OFFSET_X: 0,
  FONT_SIZE: 13,
  LABEL_FONT: '13px system-ui, sans-serif',
  PARAM_FONT: '10px system-ui, sans-serif',
} as const;

/** Connection point rendering (gameboard I/O) */
export const CONNECTION_POINT_CONFIG = {
  /** Number of input connection points (left side) */
  INPUT_COUNT: 3,
  /** Number of output connection points (right side) */
  OUTPUT_COUNT: 3,
  /** Radius of connection point circles */
  RADIUS: 8,
  /** Horizontal margin from canvas edge */
  MARGIN_X: 30,
} as const;

/** Signal processing constants */
export const SIGNAL_CONFIG = {
  MIN_VALUE: -100,
  MAX_VALUE: 100,
  MATCH_TOLERANCE: 5,
  VICTORY_CYCLES: 2,
} as const;

/** WTS timing constants */
export const WTS_CONFIG = {
  SUBDIVISIONS: 16,
  DEFAULT_SPEED: 1,
} as const;

/** Validation constants */
export const VALIDATION_CONFIG = {
  MATCH_TOLERANCE: 5,
  VICTORY_CYCLES: 2,
} as const;

/** Color palette for rendering */
export const COLORS = {
  BACKGROUND: '#1a1a2e',
  NODE_FILL: '#2d2d44',
  NODE_STROKE: '#4a4a6a',
  NODE_LABEL: '#e0e0f0',
  NODE_PARAM: '#9090b0',
  PORT_FILL: '#3a7bd5',
  PORT_STROKE: '#5a9bf5',
  PORT_CONNECTED: '#50c878',
  WIRE: '#5a9bf5',
  WIRE_SIGNAL: '#50c878',
  CONNECTION_POINT_FILL: '#e8a838',
  CONNECTION_POINT_STROKE: '#f0c868',
  CONNECTION_POINT_LABEL: '#e8a838',
  GRID_LINE: '#1e1e38',
  TARGET_WAVEFORM: '#50c878',
} as const;

/** Display labels for node types */
export const NODE_TYPE_LABELS: Record<string, string> = {
  multiply: 'Multiply',
  mix: 'Mix',
  invert: 'Invert',
  threshold: 'Threshold',
  delay: 'Delay',
};
