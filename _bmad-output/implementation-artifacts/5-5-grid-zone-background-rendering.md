# Story 5.5: Grid Zone & Background Rendering

## Story

As a player,
I want to see the gameboard grid with distinct zones for meters and the playable area,
So that the spatial layout is clear before I start building.

## Acceptance Criteria

- Playable area (cols 3-28) shows subtle grid lines at cell boundaries using `tokens.gridArea` color
- Left meter zone (cols 0-2) and right meter zone (cols 29-31) render with `tokens.meterHousing` background
- Grid lines are drawn behind all other elements (lowest z-order)
- Grid opacity may reduce during zoom animations
- `gameboard/canvas/render-grid.ts` exports `drawGrid(ctx, tokens, state, cellSize)`

## Implementation Details

### New File: `src/gameboard/canvas/render-grid.ts`

**Function:** `drawGrid(ctx, tokens, state, cellSize)`

Follows the standard draw function signature (ctx, tokens, state, ...params). Never calls getState() or reads CSS.

**Draw order within drawGrid:**
1. Fill playable area background (cols 3-28, rows 0-17) with `tokens.gridArea`
2. Fill left meter zone (cols 0-2, rows 0-17) with `tokens.meterHousing`
3. Fill right meter zone (cols 29-31, rows 0-17) with `tokens.meterHousing`
4. Draw vertical grid lines in the playable area at each cell boundary using `tokens.gridLine`
5. Draw horizontal grid lines across the full gameboard height using `tokens.gridLine`
6. Apply `state.gridOpacity` as globalAlpha if provided (for zoom animation dimming)

**State interface (in render-types.ts):**
```typescript
export interface RenderGridState {
  gridOpacity?: number; // 0-1, defaults to 1
}
```

### Render Loop Integration

`render-loop.ts` calls `drawGrid` immediately after clearing the canvas — before all other draw calls. This ensures grid is at the lowest z-order.

### Tests

- Grid lines render at correct pixel positions for various cellSizes
- Zone backgrounds fill correct column ranges
- Contract test: render-grid.ts follows draw function rules (no useGameStore, no COLORS, imports ThemeTokens)

## Dependencies

- Story 5.1 (grid constants: PLAYABLE_START/END, METER zones)
- Story 5.2 (tokens: gridArea, meterHousing, gridLine)
- Story 5.4 (render-loop bridge pattern, render-types.ts)

## FRs Covered

FR34 (visual)
