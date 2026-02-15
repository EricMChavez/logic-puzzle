/** Gameboard layout styling */
export const GAMEBOARD_STYLE = {
  /** Corner radius ratio (multiplied by cellSize at render time) */
  CORNER_RADIUS_RATIO: 0.5,
} as const;

/** Ratio-based node styling (multiplied by cellSize at render time) */
export const NODE_STYLE = {
  BORDER_RADIUS_RATIO: 0,
  PORT_RADIUS_RATIO: 0.25,
  LABEL_FONT_RATIO: 0.40,
  PARAM_FONT_RATIO: 0.22,
  LABEL_FONT_FAMILY: "'Inter', 'Segoe UI', system-ui, sans-serif",
  PARAM_FONT_FAMILY: "'Consolas', 'JetBrains Mono', monospace",
  SHADOW_BLUR_RATIO: 0.29,
  SHADOW_OFFSET_Y_RATIO: 0.12,
  /** Letter spacing for node labels as a ratio of cellSize */
  LABEL_LETTER_SPACING_RATIO: 0.06,
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

/** Validation constants */
export const VALIDATION_CONFIG = {
  MATCH_TOLERANCE: 2,
} as const;

/** Color palette for rendering */
export const COLORS = {
  BACKGROUND: '#1a1a2e',
  NODE_FILL: '#212121',
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
  GRID_LINE: '#318373',
  TARGET_WAVEFORM: '#c8c8d8',
} as const;

/** Highlight streak (diagonal light band) configuration */
export const HIGHLIGHT_STREAK = {
  /** Angle in degrees from vertical (tilted right) */
  ANGLE_DEG: 50,
  /** Position of streak center along the gradient span (0 = start, 1 = end) */
  CENTER_POSITION: 0.35,
  /** Hard specular band */
  HARD_OPACITY: 0.04,
  HARD_BAND_WIDTH_RATIO: 0.05,
  /** Soft diffuse wash underneath */
  SOFT_OPACITY: 0.025,
  SOFT_BAND_WIDTH_RATIO: 1.5,
  /** Warm tint color (slightly warm white, like a desk lamp) */
  WARM_TINT: { r: 255, g: 248, b: 240 },
  /** Vertical fade ratio — fraction of height that fades to transparent at top/bottom */
  VERTICAL_FADE_RATIO: 0.3,
} as const;

/** Depth/shadow configuration for neumorphic levels */
export const DEPTH = {
  /** Gameboard inset shadow (sunken level) */
  INSET: {
    DARK_BLUR: 12,
    DARK_OFFSET: 4,
    DARK_COLOR: 'rgba(0,0,0,0.5)',
    LIGHT_BLUR: 8,
    LIGHT_OFFSET: 3,
    LIGHT_OPACITY: 0.03,
  },
} as const;

/** Board message card rendering configuration */
export const BOARD_MESSAGE_CARD = {
  /** Title font size as a ratio of cellSize */
  TITLE_FONT_SIZE_RATIO: 1.2,
  /** Body font size as a ratio of cellSize */
  BODY_FONT_SIZE_RATIO: 0.6,
  /** Horizontal padding as a ratio of cellSize */
  PADDING_H_RATIO: 0.8,
  /** Vertical padding as a ratio of cellSize */
  PADDING_V_RATIO: 0.4,
  /** Gap between title and body as a ratio of cellSize */
  GAP_RATIO: 0.5,
  /** Max card width as a fraction of playable area width */
  MAX_WIDTH_RATIO: 0.65,
  /** Top position as a fraction of total gameboard height */
  TOP_RATIO: 0.08,
  /** Corner radius as a ratio of cellSize */
  CORNER_RADIUS_RATIO: 0.4,
  /** Card background color */
  CARD_COLOR: '#ffffff',
  /** Card opacity (fully opaque — noise/streak layer on top) */
  CARD_OPACITY: 0.5,
  /** Body text line height multiplier */
  BODY_LINE_HEIGHT: 1.5,
} as const;

/** Playback bar grid region (centered in playable area, top rows) */
export const PLAYBACK_BAR = {
  COL_START: 24,
  COL_END: 41,    // inclusive
  ROW_START: 0,
  ROW_END: 1,     // inclusive (top of grid)
} as const;

/** Display labels for node types (derived from registry for v2 nodes) */
export const NODE_TYPE_LABELS: Record<string, string> = {
  offset: 'Offset',
  scale: 'Scale',
  threshold: 'Threshold',
  max: 'Max',
  min: 'Min',
  split: 'Split',
  memory: 'Memory',
  // Custom blank (unsaved utility node)
  'custom-blank': 'Custom',
};
