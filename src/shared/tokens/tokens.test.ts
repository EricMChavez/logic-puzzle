import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TOKEN_KEYS, TOKEN_CSS_MAP } from './token-types';
import type { TokenKey } from './token-types';
import { buildThemeTokens } from './build-theme-tokens';

// --- Dark theme test values (matching tokens.css / theme-dark.css) ---
const DARK_VALUES: Record<string, string> = {
  '--token-surface-page-background': '#050508',
  '--token-surface-gameboard': '#0e0e18',
  '--token-surface-grid-area': '#141422',
  '--token-surface-meter-housing': '#0a0a14',
  '--token-surface-meter-interior': '#060610',
  '--token-surface-node': '#2d2d44',
  '--token-surface-node-bottom': '#222238',
  '--token-signal-positive': '#e8a838',
  '--token-signal-negative': '#38b8a0',
  '--token-color-neutral': '#3a3a4a',
  '--token-color-target': '#50c878',
  '--token-color-validation-match': '#22C55E',
  '--token-meter-needle': '#e03838',
  '--token-depth-raised': 'rgba(0, 0, 0, 0.4)',
  '--token-depth-sunken': 'rgba(0, 0, 0, 0.6)',
  '--token-text-primary': '#e0e0f0',
  '--token-text-secondary': '#9090b0',
  '--token-color-selection': '#5a9bf5',
  '--token-wire-width-base': '2.5',
  '--token-port-fill': '#3a7bd5',
  '--token-port-stroke': '#5a9bf5',
  '--token-port-connected': '#50c878',
  '--token-grid-line': '#1e1e38',
  '--token-anim-zoom-duration': '500ms',
  '--token-anim-node-scale-duration': '200ms',
  '--token-anim-wire-draw-duration': '300ms',
  '--token-anim-easing-default': 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--token-anim-easing-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--token-anim-ceremony-burst-duration': '300ms',
  '--token-anim-ceremony-reveal-duration': '500ms',
};

// --- Light theme test values (matching theme-light.css) ---
const LIGHT_VALUES: Record<string, string> = {
  ...DARK_VALUES,
  '--token-surface-page-background': '#d8d4d0',
  '--token-surface-gameboard': '#e8e4e0',
  '--token-surface-grid-area': '#dedad6',
  '--token-surface-node': '#f0ece8',
  '--token-signal-positive': '#c08020',
  '--token-signal-negative': '#208870',
  '--token-text-primary': '#1a1a28',
  '--token-text-secondary': '#4a4a60',
  '--token-color-selection': '#2a6ad0',
};

function mockGetComputedStyle(values: Record<string, string>) {
  return {
    getPropertyValue: (prop: string) => values[prop] ?? '',
  } as CSSStyleDeclaration;
}

function createMockElement(values: Record<string, string>) {
  return { __values: values } as unknown as Element;
}

describe('TOKEN_KEYS and TOKEN_CSS_MAP', () => {
  it('TOKEN_KEYS is non-empty', () => {
    expect(TOKEN_KEYS.length).toBeGreaterThan(0);
  });

  it('every TOKEN_KEY has a corresponding CSS variable in TOKEN_CSS_MAP', () => {
    for (const key of TOKEN_KEYS) {
      expect(TOKEN_CSS_MAP[key as TokenKey]).toBeDefined();
      expect(TOKEN_CSS_MAP[key as TokenKey]).toMatch(/^--token-/);
    }
  });

  it('TOKEN_CSS_MAP has no extra keys beyond TOKEN_KEYS', () => {
    const mapKeys = Object.keys(TOKEN_CSS_MAP);
    expect(mapKeys.length).toBe(TOKEN_KEYS.length);
    for (const key of mapKeys) {
      expect(TOKEN_KEYS).toContain(key);
    }
  });

  it('all CSS variable names are unique', () => {
    const cssVars = Object.values(TOKEN_CSS_MAP);
    const unique = new Set(cssVars);
    expect(unique.size).toBe(cssVars.length);
  });

  it('includes required surface tokens', () => {
    const required = [
      'pageBackground', 'gameboardSurface', 'gridArea',
      'meterHousing', 'meterInterior', 'surfaceNode', 'surfaceNodeBottom',
    ];
    for (const key of required) {
      expect(TOKEN_KEYS).toContain(key);
    }
  });

  it('includes required signal tokens', () => {
    const required = ['signalPositive', 'signalNegative', 'colorNeutral', 'colorTarget', 'meterNeedle'];
    for (const key of required) {
      expect(TOKEN_KEYS).toContain(key);
    }
  });

  it('includes required animation tokens', () => {
    const required = [
      'animZoomDuration', 'animNodeScaleDuration', 'animWireDrawDuration',
      'animCeremonyBurstDuration', 'animCeremonyRevealDuration',
    ];
    for (const key of required) {
      expect(TOKEN_KEYS).toContain(key);
    }
  });

  it('includes depth, text, selection, wire tokens', () => {
    const required = [
      'depthRaised', 'depthSunken',
      'textPrimary', 'textSecondary',
      'colorSelection',
      'wireWidthBase',
    ];
    for (const key of required) {
      expect(TOKEN_KEYS).toContain(key);
    }
  });

  it('every CSS variable in the map is covered by test values', () => {
    const cssVars = Object.values(TOKEN_CSS_MAP);
    for (const cssVar of cssVars) {
      expect(DARK_VALUES).toHaveProperty(cssVar);
    }
  });
});

describe('buildThemeTokens', () => {
  let originalGetComputedStyle: typeof globalThis.getComputedStyle;

  beforeEach(() => {
    originalGetComputedStyle = globalThis.getComputedStyle;
    vi.stubGlobal('getComputedStyle', (_el: Element) => mockGetComputedStyle(DARK_VALUES));
    // Mock document.documentElement for the default element path
    vi.stubGlobal('document', {
      documentElement: createMockElement(DARK_VALUES),
    });
  });

  afterEach(() => {
    vi.stubGlobal('getComputedStyle', originalGetComputedStyle);
    vi.unstubAllGlobals();
  });

  it('returns an object with all TOKEN_KEYS', () => {
    const tokens = buildThemeTokens();
    for (const key of TOKEN_KEYS) {
      expect(tokens).toHaveProperty(key);
    }
  });

  it('reads correct values for surface tokens', () => {
    const tokens = buildThemeTokens();
    expect(tokens.pageBackground).toBe('#050508');
    expect(tokens.surfaceNode).toBe('#2d2d44');
    expect(tokens.gameboardSurface).toBe('#0e0e18');
  });

  it('reads correct values for signal tokens', () => {
    const tokens = buildThemeTokens();
    expect(tokens.signalPositive).toBe('#e8a838');
    expect(tokens.signalNegative).toBe('#38b8a0');
    expect(tokens.colorTarget).toBe('#50c878');
    expect(tokens.meterNeedle).toBe('#e03838');
  });

  it('reads animation duration values', () => {
    const tokens = buildThemeTokens();
    expect(tokens.animZoomDuration).toBe('500ms');
    expect(tokens.animNodeScaleDuration).toBe('200ms');
    expect(tokens.animWireDrawDuration).toBe('300ms');
  });

  it('reads wire width as a numeric string', () => {
    const tokens = buildThemeTokens();
    expect(tokens.wireWidthBase).toBe('2.5');
    expect(Number(tokens.wireWidthBase)).toBe(2.5);
  });

  it('reads depth tokens as rgba values', () => {
    const tokens = buildThemeTokens();
    expect(tokens.depthRaised).toContain('rgba');
    expect(tokens.depthSunken).toContain('rgba');
  });

  it('reads text tokens', () => {
    const tokens = buildThemeTokens();
    expect(tokens.textPrimary).toBe('#e0e0f0');
    expect(tokens.textSecondary).toBe('#9090b0');
  });

  it('no token value is empty string', () => {
    const tokens = buildThemeTokens();
    for (const key of TOKEN_KEYS) {
      expect(tokens[key as TokenKey], `${key} should not be empty`).not.toBe('');
    }
  });

  it('accepts a custom element parameter', () => {
    const customEl = createMockElement(DARK_VALUES);
    vi.stubGlobal('getComputedStyle', (_el: Element) => mockGetComputedStyle(DARK_VALUES));
    const tokens = buildThemeTokens(customEl);
    expect(tokens.pageBackground).toBe('#050508');
  });
});

describe('theme switching produces different values', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dark and light themes produce different surface values', () => {
    vi.stubGlobal('document', { documentElement: createMockElement(DARK_VALUES) });

    vi.stubGlobal('getComputedStyle', () => mockGetComputedStyle(DARK_VALUES));
    const darkTokens = buildThemeTokens();

    vi.stubGlobal('getComputedStyle', () => mockGetComputedStyle(LIGHT_VALUES));
    const lightTokens = buildThemeTokens();

    expect(darkTokens.gameboardSurface).not.toBe(lightTokens.gameboardSurface);
    expect(darkTokens.textPrimary).not.toBe(lightTokens.textPrimary);
    expect(darkTokens.pageBackground).not.toBe(lightTokens.pageBackground);
  });

  it('dark and light themes produce different signal polarity values', () => {
    vi.stubGlobal('document', { documentElement: createMockElement(DARK_VALUES) });

    vi.stubGlobal('getComputedStyle', () => mockGetComputedStyle(DARK_VALUES));
    const darkTokens = buildThemeTokens();

    vi.stubGlobal('getComputedStyle', () => mockGetComputedStyle(LIGHT_VALUES));
    const lightTokens = buildThemeTokens();

    expect(darkTokens.signalPositive).not.toBe(lightTokens.signalPositive);
    expect(darkTokens.signalNegative).not.toBe(lightTokens.signalNegative);
  });

  it('animation durations are the same across themes', () => {
    vi.stubGlobal('document', { documentElement: createMockElement(DARK_VALUES) });

    vi.stubGlobal('getComputedStyle', () => mockGetComputedStyle(DARK_VALUES));
    const darkTokens = buildThemeTokens();

    vi.stubGlobal('getComputedStyle', () => mockGetComputedStyle(LIGHT_VALUES));
    const lightTokens = buildThemeTokens();

    expect(darkTokens.animZoomDuration).toBe(lightTokens.animZoomDuration);
  });
});
