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
}

export interface MeterStyleOverrides {
  waveformRatio: number;
  levelBarRatio: number;
  needleRatio: number;
  verticalHeightRatio: number;
  needleGlow: number;
}

export interface ColorOverrides {
  pageBackground: string;
  signalPositive: string;
  signalNegative: string;
  colorNeutral: string;
  gridArea: string;
  meterHousing: string;
  meterInterior: string;
  surfaceNode: string;
  surfaceNodeBottom: string;
  portFill: string;
  portStroke: string;
  gridLine: string;
  meterNeedle: string;
  textPrimary: string;
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
    shadowBlur: 0.2,
    shadowOffsetY: 0.06,
    borderRadius: 0.12,
    gradientIntensity: 1.0,
    hoverBrightness: 0.15,
    borderWidth: 1.5,
    portRadius: 0.12,
  },
  wireStyle: {
    baseWidth: 2,
    baseOpacity: 0.4,
    glowThreshold: 75,
    glowMaxRadius: 12,
    colorRampEnd: 75,
  },
  gridStyle: {
    lineOpacity: 1.0,
    shadowDepth: 0.4,
    borderHighlight: 0.06,
    borderShadow: 0.4,
    insetDepthTop: 0.4,
    insetDepthSide: 0.3,
  },
  meterStyle: {
    waveformRatio: 0.59,
    levelBarRatio: 0.30,
    needleRatio: 0.10,
    verticalHeightRatio: 0.35,
    needleGlow: 8,
  },
  colors: {
    pageBackground: '#0a0a14',
    signalPositive: '#e8a838',
    signalNegative: '#38b8a0',
    colorNeutral: '#3a3a4a',
    gridArea: '#141422',
    meterHousing: '#0a0a14',
    meterInterior: '#0a0a14',
    surfaceNode: '#2d2d44',
    surfaceNodeBottom: '#222238',
    portFill: '#3a7bd5',
    portStroke: '#5a9bf5',
    gridLine: '#1e1e38',
    meterNeedle: '#e03838',
    textPrimary: '#e0e0f0',
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
