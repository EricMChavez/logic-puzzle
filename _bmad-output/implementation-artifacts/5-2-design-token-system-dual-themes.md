# Story 5.2: Design Token System & Dual Themes

Status: done

## Story

As a developer,
I want a three-tier design token system with dark and light themes,
so that Canvas rendering and CSS styling read from a single, cached, typed token source.

## Acceptance Criteria

1. **Given** the app loads, **When** the theme initializes, **Then** `assets/styles/tokens.css` defines CSS custom properties for semantic tokens
2. **Given** the dark theme, **When** active, **Then** `theme-dark.css` defines Signal Bench overrides (near-black surfaces, amber/teal polarity)
3. **Given** the light theme, **When** active, **Then** `theme-light.css` defines Studio Monitor overrides (warm gray surfaces, deeper amber/teal)
4. **Given** animation tokens, **When** `prefers-reduced-motion` is active, **Then** `animations.css` resolves durations to 0 or reduced values
5. **Given** TypeScript code, **When** importing tokens, **Then** `TokenKey` union and `ThemeTokens` type are exported from `shared/tokens/`
6. **Given** theme init or switch, **When** `buildThemeTokens()` runs, **Then** it reads CSS custom properties via `getComputedStyle` once and builds a `ThemeTokens` object
7. **Given** Canvas code, **When** rendering, **Then** it never calls `getComputedStyle` -- it receives `tokens: ThemeTokens` as a parameter
8. **Given** a theme switch, **When** triggered, **Then** `data-theme` attribute is set on root element and `buildThemeTokens()` is re-invoked
9. **Given** polarity colors, **When** used against backgrounds, **Then** WCAG AA contrast ratios (4.5:1 text, 3:1 non-text) are met in both themes
10. **Given** reduced-motion preference changes, **When** user toggles OS preference, **Then** animation tokens update mid-session

## Tasks / Subtasks

- [x] Task 1: Create CSS token files (AC: #1, #2, #3, #4)
  - [x] 1.1 Create `src/assets/styles/tokens.css` with base/semantic CSS custom properties (27 tokens)
  - [x] 1.2 Create `src/assets/styles/theme-dark.css` with Signal Bench overrides
  - [x] 1.3 Create `src/assets/styles/theme-light.css` with Studio Monitor overrides
  - [x] 1.4 Create `src/assets/styles/animations.css` with duration/easing tokens + prefers-reduced-motion

- [x] Task 2: Create TypeScript token types and builder (AC: #5, #6, #7)
  - [x] 2.1 Create `src/shared/tokens/token-types.ts` with TOKEN_KEYS array (27 keys), TokenKey union, ThemeTokens type, TOKEN_CSS_MAP
  - [x] 2.2 Create `src/shared/tokens/build-theme-tokens.ts` with buildThemeTokens() function
  - [x] 2.3 Create `src/shared/tokens/index.ts` barrel export

- [x] Task 3: Theme initialization and switching (AC: #8, #10)
  - [x] 3.1 Import CSS files in main.tsx
  - [x] 3.2 Set initial data-theme="dark" via initTheme()
  - [x] 3.3 Create `src/shared/tokens/theme-manager.ts` with initTheme(), setTheme(), getThemeTokens(), getCurrentTheme(), isReducedMotion(), reduced-motion listener

- [x] Task 4: Tests (AC: #5, #6)
  - [x] 4.1 Create `src/shared/tokens/tokens.test.ts` — 21 tests using vi.stubGlobal mocks (no jsdom dependency)
  - [x] 4.2 Run `npx tsc --noEmit` — zero errors
  - [x] 4.3 Run `npx vitest run` — 551 tests passing across 36 suites, zero regressions

## Dev Notes

### Architecture

- **Three-tier flow**: CSS custom properties (source of truth) → `buildThemeTokens()` reads via `getComputedStyle` → `ThemeTokens` cache object → Canvas render functions receive as parameter
- **Theme manager**: Module-level singleton. `initTheme()` called once on app startup. `setTheme()` swaps `data-theme` attribute and rebuilds cache. `getThemeTokens()` returns cached object.
- **No Zustand slice for theme**: Theme is UI chrome, not game state. Module-level state in theme-manager.ts is sufficient. Render loop reads tokens via `getThemeTokens()`.
- **Reduced motion**: `matchMedia('(prefers-reduced-motion: reduce)')` listener updates animation tokens in the cache.
- **COLORS constant**: Remains unchanged for now. Story 5.4 will refactor render functions to accept `tokens` parameter, at which point COLORS usage will be removed.

### Token Key Inventory

| Category | Keys | Purpose |
|----------|------|---------|
| Surfaces | pageBackground, gameboardSurface, gridArea, meterHousing, meterInterior, surfaceNode, surfaceNodeBottom | Background fills |
| Signals | signalPositive, signalNegative, colorNeutral, colorTarget, meterNeedle | Signal visualization |
| Depth | depthRaised, depthSunken | Shadows and insets |
| Selection | colorSelection | Focus rings, highlights |
| Text | textPrimary, textSecondary | Labels |
| Wire | wireWidthBase | Wire stroke width |
| Animation | animZoomDuration, animNodeScaleDuration, animWireDrawDuration | Timing |

### File Structure

```
src/assets/styles/tokens.css          (NEW)
src/assets/styles/theme-dark.css      (NEW)
src/assets/styles/theme-light.css     (NEW)
src/assets/styles/animations.css      (NEW)
src/shared/tokens/token-types.ts      (NEW)
src/shared/tokens/build-theme-tokens.ts (NEW)
src/shared/tokens/theme-manager.ts    (NEW)
src/shared/tokens/index.ts            (NEW)
src/shared/tokens/tokens.test.ts      (NEW)
src/main.tsx                          (MODIFY — import CSS, call initTheme)
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision 4: Token Cache]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- Created 4 CSS files establishing the three-tier design token system:
  - `tokens.css`: 27 CSS custom properties across 8 categories (surface, signal, depth, text, selection, wire, port, grid, animation)
  - `theme-dark.css`: Signal Bench dark theme — near-black surfaces (#050508-#141422), amber (#e8a838) positive, teal (#38b8a0) negative
  - `theme-light.css`: Studio Monitor light theme — warm gray surfaces (#d8d4d0-#e8e4e0), deeper amber (#c08020) positive, deeper teal (#208870) negative
  - `animations.css`: 3 duration tokens + 2 easing tokens; `prefers-reduced-motion: reduce` sets all durations to 0ms
- Created `src/shared/tokens/` module with 4 files:
  - `token-types.ts`: TOKEN_KEYS const array (27 keys), TokenKey union type, ThemeTokens record type, TOKEN_CSS_MAP mapping keys to CSS variable names
  - `build-theme-tokens.ts`: buildThemeTokens() reads CSS vars via getComputedStyle, accepts optional element parameter
  - `theme-manager.ts`: Module-level singleton with initTheme(), setTheme(), getThemeTokens(), getCurrentTheme(), isReducedMotion(). Registers matchMedia listener for mid-session reduced-motion changes.
  - `index.ts`: Barrel re-export of all types and functions
- Updated `main.tsx`: imports all 4 CSS files, calls initTheme('dark') before first render
- Tests: 21 new tests using vi.stubGlobal mocks (no jsdom needed). Token key completeness (8 tests), buildThemeTokens with mocked getComputedStyle (9 tests), theme switching produces different values (3 tests), cross-theme animation consistency (1 test).
- TypeScript clean, 551 total tests passing (21 new + 530 existing), zero regressions.

### File List

- `src/assets/styles/tokens.css` (NEW)
- `src/assets/styles/theme-dark.css` (NEW)
- `src/assets/styles/theme-light.css` (NEW)
- `src/assets/styles/animations.css` (NEW)
- `src/shared/tokens/token-types.ts` (NEW)
- `src/shared/tokens/build-theme-tokens.ts` (NEW)
- `src/shared/tokens/theme-manager.ts` (NEW)
- `src/shared/tokens/index.ts` (NEW)
- `src/shared/tokens/tokens.test.ts` (NEW)
- `src/main.tsx` (MODIFIED — import CSS files, call initTheme)

## Change Log

- 2026-02-04: Implemented Story 5.2 Design Token System & Dual Themes — CSS tokens, TS builder, theme manager, 21 tests
