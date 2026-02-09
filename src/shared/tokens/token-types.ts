/**
 * All design token keys.
 * Each maps to a CSS custom property: --token-<css-name>
 * Order matches the CSS files for easy cross-referencing.
 */
export const TOKEN_KEYS = [
  // Surfaces
  'pageBackground',
  'gameboardSurface',
  'gridArea',
  'meterHousing',
  'meterInterior',
  'surfaceNode',
  'surfaceNodeBottom',

  // Signals / Polarity
  'signalPositive',
  'signalNegative',
  'colorNeutral',
  'colorTarget',
  'colorValidationMatch',
  'meterNeedle',
  'colorError',
  'meterBorder',
  'boardBorder',

  // Depth
  'depthRaised',
  'depthSunken',

  // Text
  'textPrimary',
  'textSecondary',

  // Selection
  'colorSelection',

  // Wire
  'wireWidthBase',

  // Ports
  'portFill',
  'portStroke',
  'portConnected',

  // Grid
  'gridLine',

  // Animation (duration strings, e.g. "500ms" or "0ms")
  'animZoomDuration',
  'animNodeScaleDuration',
  'animWireDrawDuration',
  'animEasingDefault',
  'animEasingBounce',
  'animCeremonyBurstDuration',
  'animCeremonyRevealDuration',
] as const;

/** Union type of all token key strings */
export type TokenKey = (typeof TOKEN_KEYS)[number];

/** Flat typed object mapping each token key to its resolved CSS value string */
export type ThemeTokens = Record<TokenKey, string>;

/**
 * Maps each TokenKey to its CSS custom property name.
 * E.g. 'pageBackground' → '--token-surface-page-background'
 */
export const TOKEN_CSS_MAP: Record<TokenKey, string> = {
  pageBackground: '--token-surface-page-background',
  gameboardSurface: '--token-surface-gameboard',
  gridArea: '--token-surface-grid-area',
  meterHousing: '--token-surface-meter-housing',
  meterInterior: '--token-surface-meter-interior',
  surfaceNode: '--token-surface-node',
  surfaceNodeBottom: '--token-surface-node-bottom',

  signalPositive: '--token-signal-positive',
  signalNegative: '--token-signal-negative',
  colorNeutral: '--token-color-neutral',
  colorTarget: '--token-color-target',
  colorValidationMatch: '--token-color-validation-match',
  meterNeedle: '--token-meter-needle',
  colorError: '--token-color-error',
  meterBorder: '--token-meter-border',
  boardBorder: '--token-board-border',

  depthRaised: '--token-depth-raised',
  depthSunken: '--token-depth-sunken',

  textPrimary: '--token-text-primary',
  textSecondary: '--token-text-secondary',

  colorSelection: '--token-color-selection',

  wireWidthBase: '--token-wire-width-base',

  portFill: '--token-port-fill',
  portStroke: '--token-port-stroke',
  portConnected: '--token-port-connected',

  gridLine: '--token-grid-line',

  animZoomDuration: '--token-anim-zoom-duration',
  animNodeScaleDuration: '--token-anim-node-scale-duration',
  animWireDrawDuration: '--token-anim-wire-draw-duration',
  animEasingDefault: '--token-anim-easing-default',
  animEasingBounce: '--token-anim-easing-bounce',
  animCeremonyBurstDuration: '--token-anim-ceremony-burst-duration',
  animCeremonyRevealDuration: '--token-anim-ceremony-reveal-duration',
};
