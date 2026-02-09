/**
 * Visual override parameters controllable via Leva dev tools.
 * These override the theme tokens at render time for experimentation.
 */

export interface NodeStyleOverrides {
  shadowBlur: number;
  shadowOffsetY: number;
  borderRadius: number;
  gradientIntensity: number;
  hoverBrightness: number;
  borderWidth: number;
  portRadius: number;
}

export interface WireStyleOverrides {
  baseWidth: number;
  baseOpacity: number;
  glowThreshold: number;
  glowMaxRadius: number;
  colorRampEnd: number;
}

export interface GridStyleOverrides {
  lineOpacity: number;
  shadowDepth: number;
  borderHighlight: number;
  borderShadow: number;
  insetDepthTop: number;
  insetDepthSide: number;
  showGridLabels: boolean;
}

export interface MeterStyleOverrides {
  needleGlow: number;
}

export interface ColorOverrides {
  pageBackground: string;
  pageBackgroundCenter: string;
  signalPositive: string;
  signalNegative: string;
  colorNeutral: string;
  gridArea: string;
  gridAreaEdge: string;
  gridAreaCenter: string;
  meterInterior: string;
  surfaceNode: string;
  surfaceNodeBottom: string;
  portFill: string;
  portStroke: string;
  gridLine: string;
  meterNeedle: string;
  textPrimary: string;
  colorError: string;
  meterBorder: string;
  boardBorder: string;
  colorValidationMatch: string;
  colorTarget: string;
}

export interface DevOverrides {
  enabled: boolean;
  nodeStyle: NodeStyleOverrides;
  wireStyle: WireStyleOverrides;
  gridStyle: GridStyleOverrides;
  meterStyle: MeterStyleOverrides;
  colors: ColorOverrides;
}

/** Default values matching current implementation */
export const DEFAULT_DEV_OVERRIDES: DevOverrides = {
  enabled: false,
  nodeStyle: {
    shadowBlur: 0.29,
    shadowOffsetY: 0.12,
    borderRadius: 0.1,
    gradientIntensity: 1.0,
    hoverBrightness: 0.15,
    borderWidth: 0,
    portRadius: 0.25,
  },
  wireStyle: {
    baseWidth: 6,
    baseOpacity: 1,
    glowThreshold: 75,
    glowMaxRadius: 30,
    colorRampEnd: 100,
  },
  gridStyle: {
    lineOpacity: 0.8,
    shadowDepth: 1,
    borderHighlight: 0.3,
    borderShadow: 1,
    insetDepthTop: 1,
    insetDepthSide: 1,
    showGridLabels: false,
  },
  meterStyle: {
    needleGlow: 10,
  },
  colors: {
    pageBackground: '#0a0a0a',
    pageBackgroundCenter: '#282a2e',
    signalPositive: '#ff9200',
    signalNegative: '#0782e0',
    colorNeutral: '#242424',
    gridArea: '#000000',
    gridAreaEdge: '#000000',
    gridAreaCenter: '#0a0b0d',
    meterInterior: '#000000',
    surfaceNode: '#44484e',
    surfaceNodeBottom: '#2a2a2a',
    portFill: '#3a7bd5',
    portStroke: '#5a9bf5',
    gridLine: '#16161a',
    meterNeedle: '#f5f5f5',
    textPrimary: '#e0e0f0',
    colorError: '#e04040',
    meterBorder: '#6c6666',
    boardBorder: '#3d3e42',
    colorValidationMatch: '#22c55e',
    colorTarget: '#c8c8d8',
  },
};

/** Global mutable state for dev overrides (accessed by render functions) */
let _devOverrides: DevOverrides = { ...DEFAULT_DEV_OVERRIDES };

export function getDevOverrides(): DevOverrides {
  return _devOverrides;
}

export function setDevOverrides(overrides: Partial<DevOverrides>): void {
  _devOverrides = { ..._devOverrides, ...overrides };
}

export function setNodeStyleOverrides(overrides: Partial<NodeStyleOverrides>): void {
  _devOverrides.nodeStyle = { ..._devOverrides.nodeStyle, ...overrides };
}

export function setWireStyleOverrides(overrides: Partial<WireStyleOverrides>): void {
  _devOverrides.wireStyle = { ..._devOverrides.wireStyle, ...overrides };
}

export function setGridStyleOverrides(overrides: Partial<GridStyleOverrides>): void {
  _devOverrides.gridStyle = { ..._devOverrides.gridStyle, ...overrides };
}

export function setMeterStyleOverrides(overrides: Partial<MeterStyleOverrides>): void {
  _devOverrides.meterStyle = { ..._devOverrides.meterStyle, ...overrides };
}

export function setColorOverrides(overrides: Partial<ColorOverrides>): void {
  _devOverrides.colors = { ..._devOverrides.colors, ...overrides };
}

export function resetDevOverrides(): void {
  _devOverrides = { ...DEFAULT_DEV_OVERRIDES };
}
