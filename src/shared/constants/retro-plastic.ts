/** Shared retro aged-plastic colors for canvas-rendered UI panels.
 *  Used by render-playback-bar.ts and render-chip-drawer.ts. */

/** Beige panel gradient (yellowed aged plastic, hue ~38°) */
export const RETRO_PANEL = {
  GRAD_TOP: '#dfd7bd',
  GRAD_MID: '#cdc5a8',
  GRAD_BOT: '#c1b99b',
} as const;

/** Screw radial gradient */
export const RETRO_SCREW = {
  GRAD_LIGHT: '#b9b091',
  GRAD_DARK: '#a9a083',
} as const;
