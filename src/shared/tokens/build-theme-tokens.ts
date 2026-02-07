import { TOKEN_KEYS, TOKEN_CSS_MAP } from './token-types';
import type { TokenKey, ThemeTokens } from './token-types';

/**
 * Build a ThemeTokens cache by reading CSS custom properties from the DOM.
 *
 * Called once on init and once on each theme switch — never per frame.
 * Canvas render functions receive the returned object as a parameter.
 *
 * @param element - The element to read computed styles from (defaults to document.documentElement)
 */
export function buildThemeTokens(element?: Element): ThemeTokens {
  const el = element ?? document.documentElement;
  const styles = getComputedStyle(el);

  const tokens = {} as Record<string, string>;

  for (const key of TOKEN_KEYS) {
    const cssVar = TOKEN_CSS_MAP[key as TokenKey];
    const value = styles.getPropertyValue(cssVar).trim();
    tokens[key] = value;
  }

  return tokens as ThemeTokens;
}
