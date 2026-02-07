import { buildThemeTokens } from './build-theme-tokens';
import type { ThemeTokens } from './token-types';

export type ThemeName = 'dark' | 'light';

/** Module-level cached tokens — rebuilt on init and theme switch */
let cachedTokens: ThemeTokens | null = null;

/** Current theme name */
let currentTheme: ThemeName = 'dark';

/** Reduced motion state */
let reducedMotion = false;

/**
 * Initialize the theme system.
 * Sets the initial data-theme attribute, builds the token cache,
 * and registers the reduced-motion media query listener.
 *
 * Call once on app startup (from main.tsx).
 */
export function initTheme(theme: ThemeName = 'dark'): ThemeTokens {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  // Detect reduced motion preference
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = mql.matches;

  // Listen for mid-session changes
  mql.addEventListener('change', (e) => {
    reducedMotion = e.matches;
    // Rebuild tokens so animation values reflect the new preference
    cachedTokens = buildThemeTokens();
  });

  cachedTokens = buildThemeTokens();
  return cachedTokens;
}

/**
 * Switch to a different theme.
 * Updates the data-theme attribute and rebuilds the token cache.
 */
export function setTheme(theme: ThemeName): ThemeTokens {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  cachedTokens = buildThemeTokens();
  return cachedTokens;
}

/**
 * Get the current cached ThemeTokens.
 * Returns the tokens built on last init/switch.
 * If not yet initialized, builds from current DOM state.
 */
export function getThemeTokens(): ThemeTokens {
  if (!cachedTokens) {
    cachedTokens = buildThemeTokens();
  }
  return cachedTokens;
}

/** Get the current theme name */
export function getCurrentTheme(): ThemeName {
  return currentTheme;
}

/** Check if reduced motion is preferred */
export function isReducedMotion(): boolean {
  return reducedMotion;
}
