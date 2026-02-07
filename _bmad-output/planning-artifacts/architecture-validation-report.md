# Architecture Validation Report

**Document reviewed:** `_bmad-output/planning-artifacts/architecture.md`
**Reviewer:** Claude Opus 4.5 (fresh-eyes review, no prior involvement in authoring)
**Date:** 2026-02-04
**Verdict:** PASS with findings (3 moderate issues, 4 minor notes)

---

## Methodology

Cross-referenced the architecture against:
1. The actual codebase (file structure, existing types, current render loop, store slices, constants)
2. UX Design Specification (`ux-design-specification.md`)
3. Original Architecture (`game-architecture.md`)
4. Epics & Stories (`epics.md`)
5. Project Context rules

---

## Validation Summary

| Category | Result | Notes |
|----------|--------|-------|
| Decision coherence | PASS | All 6 decisions mutually compatible |
| Pattern consistency | PASS | Uniform `(ctx, tokens, state, rect)` signature throughout |
| Requirements coverage | PASS | All 33 FRs and 10 NFRs mapped to modules |
| Domain boundaries | PASS | Import rules consistent; `shared/routing/` resolution correct |
| Structure completeness | PASS | File-level granularity for all modules |
| Accuracy vs. codebase | PASS with findings | See migration gaps below |
| UX spec alignment | PASS | All 10 UX redesign requirements addressed |
| Anti-patterns | PASS | 6 anti-patterns documented, cover known risks |
| Data flow | PASS | 4 flow paths (input, rAF, engine tick, theme switch) non-conflicting |

---

## Issues Found

### I-1: Wire data model migration path undocumented (Moderate)

**Current codebase** (`shared/types/index.ts:27-35`):
```typescript
interface Wire {
  id: string;
  from: PortRef;
  to: PortRef;
  wtsDelay: number;
  signals: Signal[];
}
```

**Architecture specifies:**
```typescript
interface Wire {
  id: string;
  source: PortRef;
  target: PortRef;
  path: GridPoint[];
  signalBuffer: number[];
  writeHead: number;
}
```

Changes: `from`/`to` renamed to `source`/`target`; `wtsDelay` and `signals: Signal[]` removed; `path`, `signalBuffer`, `writeHead` added. This is a breaking change to a core type used across engine, store, and gameboard.

**Recommendation:** Add a migration note in the architecture or epics documenting that the Wire type change affects: `shared/types/`, `engine/graph/`, `wts/scheduler/`, `store/slices/gameboard-slice.ts`, and all `gameboard/canvas/render-*.ts` files. The `Signal` type may also become unused.

---

### I-2: NodeState.position type migration undocumented (Moderate)

**Current codebase** (`shared/types/index.ts:48-49`):
```typescript
interface NodeState {
  position: Vec2;  // { x: number, y: number } -- pixel coordinates
}
```

**Architecture rule:** "Zustand state always stores grid coordinates. Pixel coordinates are computed at render time only."

This means `NodeState.position` must change from `Vec2` (`{x, y}` pixels) to a grid coordinate type (`{col, row}`). The architecture defines the grid coordinate system and conversion functions clearly but doesn't explicitly flag that the existing `NodeState.position` field and its `Vec2` type need migration.

**Recommendation:** Note the `Vec2 → GridPoint` migration in the architecture's "New Modules" section or create an explicit migration story. All code that reads `node.position.x`/`.y` must be updated.

---

### I-3: Current render functions diverge significantly from architecture pattern (Moderate)

The architecture mandates `(ctx, tokens, state, rect)` signatures for all draw functions. The current render functions have different signatures:

| Current | Architecture |
|---------|-------------|
| `renderNodes(ctx, nodes)` | `drawNodes(ctx, tokens, state.nodes, cellSize)` |
| `renderWires(ctx, wires, nodes, width, height)` | `drawWires(ctx, tokens, state.wires, cellSize)` |
| `renderConnectionPoints(ctx, width, height)` | Part of meter rendering |
| `renderWaveforms(ctx, width, height)` | Meter waveform channel |

The render loop (`render-loop.ts:43`) also reads `COLORS` from hardcoded constants, not from a `ThemeTokens` cache.

**Impact:** Every render function must be rewritten to conform to the new pattern. This is expected for a redesign, but the scope should be acknowledged in sprint planning. The current render functions are effectively deprecated by the architecture.

**Recommendation:** The architecture is correct as-is -- no change needed to the document. Flag this scope in Step 2 (Epic/Story updates) so implementation stories account for the full render layer rewrite.

---

### I-4: `VICTORY_CYCLES` constant still 2, architecture says 1 (Minor)

`shared/constants/index.ts:31` has `VICTORY_CYCLES: 2`. The architecture's resolved contradiction #2 correctly identifies this needs updating to 1 but notes "Epics (Story 2.2) and project-context to be updated." Since Step 2 (Update Epics) hasn't run yet, this is expected. No action needed on the architecture doc.

---

### I-5: `ui/modals/` → `ui/overlays/` rename not noted (Minor)

The current codebase has `src/ui/modals/` (empty directory). The architecture's project structure shows `src/ui/overlays/` with 6 component files. The rename from `modals` to `overlays` is implicit but not called out as a migration step.

**Recommendation:** Minor -- the directory is empty, so it's just a rename/delete of an empty folder. No code impact.

---

### I-6: `gameboard/visualization/` fate unclear (Minor)

The current codebase has `gameboard/visualization/` with `waveform-buffer.ts` and its test. The architecture's project structure includes this directory unchanged, but the new `gameboard/meters/` module covers waveform rendering with its own circular buffer (`Float64Array(128)`).

**Question:** Does `gameboard/visualization/waveform-buffer.ts` remain as-is, get merged into meters, or get deprecated? The architecture shows both modules coexisting but doesn't clarify the relationship.

**Recommendation:** Add a one-line note clarifying whether the existing waveform buffer is superseded by the meter circular buffer or serves a different purpose (e.g., connection-point waveforms vs. meter waveforms).

---

### I-7: Connection point model flexibility scope (Minor)

The architecture states "Connection point per-puzzle configuration" where puzzles specify which of 6 connection points are active and their direction. The current codebase has a fixed model:

```typescript
// shared/constants/index.ts
CONNECTION_POINT_CONFIG = {
  INPUT_COUNT: 3,  // always left
  OUTPUT_COUNT: 3, // always right
}
```

The architecture correctly describes the target state. The scope of changing from fixed 3-input/3-output to per-puzzle configurable connection points should surface in the epics/stories (Step 2).

---

## Strengths Confirmed

1. **Zero new dependencies** -- Verified. `package.json` needs no additions.
2. **Decision mutual compatibility** -- D1 (A*) operates on D6's 32x18 grid. D2 (meters) occupy D6's 3-column zones. D3 (lid animation) and D5 (wire rendering) consume D4 (token cache). All stay within Canvas 2D.
3. **Bridge pattern** -- `render-loop.ts` as sole Zustand-Canvas bridge is already partially implemented and scales cleanly.
4. **Domain boundary resolution** -- Moving routing to `shared/routing/` correctly resolves the store→gameboard import violation.
5. **Discriminated union consistency** -- `LidAnimationState`, `ValidationCeremonyState`, `activeOverlay`, and `interactionMode` all use the same pattern. The existing `interactionMode` in the codebase already follows this (e.g., `type: 'drawing-wire'`).
6. **Occupancy as derived state** -- Recompute-on-deserialize eliminates serialization bugs.
7. **Anti-patterns are actionable** -- Each "DO NOT" maps to a specific code smell that AI agents might introduce.
8. **NFR1 (60fps) support** -- Token cache eliminates per-frame DOM reads; single rAF loop avoids double-rendering.

---

## Codebase Reality Check

| Architecture Claim | Verified |
|-------------------|----------|
| 505 tests, 34 suites | Not re-run (validation scope is architecture doc, not test suite) |
| Empty stub directories exist | YES -- `debug/`, `validation/`, `persistence/`, `progression/` have subdirectories but no files |
| `gameboard/interaction/` empty | YES |
| `gameboard/navigation/` empty | YES |
| `ui/layout/` empty | YES |
| `assets/styles/` empty | YES |
| No `shared/grid/`, `shared/tokens/`, `shared/routing/` | YES -- these must be created |
| No `gameboard/meters/`, `gameboard/animation/` | YES -- these must be created |
| No overlay/animation/meter/routing store slices | YES -- only the 10 original slices exist |
| `render-loop.ts` imports `useGameStore` | YES (`render-loop.ts:1`) |
| Engine has zero React/Canvas imports | Not verified (out of scope) |

---

## Recommendations for Next Steps

1. **No changes needed to the architecture document.** The issues found are migration-scope items that belong in the epics/stories (Step 2), not in the architecture itself. The architecture correctly describes the target state.

2. **Step 2 (Update Epics) should account for:**
   - Wire type migration (`from`/`to` → `source`/`target`, signal model change)
   - NodeState position migration (`Vec2` → `GridPoint`)
   - Full render layer rewrite (every `render-*.ts` function)
   - `VICTORY_CYCLES` constant update (2 → 1)
   - Connection point model flexibility
   - `gameboard/visualization/` disposition

3. **The architecture is implementation-ready.** Decision completeness, pattern documentation, and structure granularity are sufficient for sprint planning and story creation.
