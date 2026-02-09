/** Gameboard layout styling */
export const GAMEBOARD_STYLE = {
  /** Corner radius ratio (multiplied by cellSize at render time) */
  CORNER_RADIUS_RATIO: 0.5,
} as const;

/** Ratio-based node styling (multiplied by cellSize at render time) */
export const NODE_STYLE = {
  BORDER_RADIUS_RATIO: 0.1,
  PORT_RADIUS_RATIO: 0.25,
  LABEL_FONT_RATIO: 0.40,
  PARAM_FONT_RATIO: 0.22,
  LABEL_FONT_FAMILY: "'Inter', 'Segoe UI', system-ui, sans-serif",
  PARAM_FONT_FAMILY: "'Consolas', 'JetBrains Mono', monospace",
  SHADOW_BLUR_RATIO: 0.29,
  SHADOW_OFFSET_Y_RATIO: 0.12,
  FOCUS_RING_WIDTH: 2,
  SELECTION_PAD: 3,
  /** Half-cell offset so ports sit on grid lines while body is offset */
  BODY_OFFSET: 0.5,
} as const;

/** Connection point rendering (gameboard I/O) */
export const CONNECTION_POINT_CONFIG = {
  /** Number of input connection points (left side) */
  INPUT_COUNT: 3,
  /** Number of output connection points (right side) */
  OUTPUT_COUNT: 3,
  /** Radius of connection point circles */
  RADIUS: 8,
} as const;

/** Signal processing constants */
export const SIGNAL_CONFIG = {
  MIN_VALUE: -100,
  MAX_VALUE: 100,
  MATCH_TOLERANCE: 0,
} as const;

/** WTS timing constants */
export const WTS_CONFIG = {
  SUBDIVISIONS: 16,
  DEFAULT_SPEED: 1,
} as const;

/** Validation constants */
export const VALIDATION_CONFIG = {
  MATCH_TOLERANCE: 2,
} as const;

/** Color palette for rendering */
export const COLORS = {
  BACKGROUND: '#1a1a2e',
  NODE_FILL: '#44484e',
  NODE_STROKE: '#4a4a6a',
  NODE_LABEL: '#e0e0f0',
  NODE_PARAM: '#9090b0',
  PORT_FILL: '#3a7bd5',
  PORT_STROKE: '#5a9bf5',
  PORT_CONNECTED: '#50c878',
  WIRE: '#5a9bf5',
  WIRE_SIGNAL: '#50c878',
  CONNECTION_POINT_FILL: '#ff9200',
  CONNECTION_POINT_STROKE: '#f0c868',
  CONNECTION_POINT_LABEL: '#ff9200',
  GRID_LINE: '#16161a',
  TARGET_WAVEFORM: '#c8c8d8',
} as const;

/** Display labels for node types (derived from registry for v2 nodes) */
export const NODE_TYPE_LABELS: Record<string, string> = {
  // v2 nodes
  inverter: 'Inverter',
  delay: 'Delay',
  mixer: 'Mixer',
  amp: 'Amp',
  diverter: 'Diverter',
  polarizer: 'Polarizer',
  shifter: 'Shifter',
  // Custom blank (unsaved utility node)
  'custom-blank': 'Custom',
  // Legacy v1 nodes (for migration period)
  multiply: 'Multiply',
  mix: 'Mix',
  invert: 'Invert',
  threshold: 'Threshold',
};

/** Nodes that use a bottom-port knob control (portIndex + paramKey mapping) */
export const KNOB_NODES: Record<string, { portIndex: number; paramKey: string }> = {
  mixer: { portIndex: 2, paramKey: 'mix' },
  amp: { portIndex: 1, paramKey: 'gain' },
  diverter: { portIndex: 1, paramKey: 'fade' },
  shifter: { portIndex: 1, paramKey: 'shift' },
};
