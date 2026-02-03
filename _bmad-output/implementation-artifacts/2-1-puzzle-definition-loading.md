# Story 2.1: Puzzle Definition & Loading

Status: review

## Story

As a player,
I want to see a puzzle with input waveforms feeding into my gameboard and a target output to match,
so that I have a clear goal to work toward.

## Acceptance Criteria

1. **Given** a puzzle level is loaded **When** the gameboard renders **Then** input waveforms are visible on the left-side connection points cycling continuously
2. **Given** a puzzle level is loaded **When** the gameboard renders **Then** target output waveforms display on the right side as overlay/preview
3. Level data structure contains: input waveform definitions, target waveform definitions, multi-waveform test suite
4. Waveform generators produce sine, square, triangle, and sawtooth waves as pure functions
5. Input signals feed into the graph at the gameboard's left-side connection points each tick

## Tasks / Subtasks

- [x] Task 1: Verify and test existing puzzle infrastructure (AC: 3, 4)
  - [x] 1.1 Write unit tests for all waveform generators in `src/puzzle/waveform-generators.test.ts` (sine, square, triangle, sawtooth, constant; edge cases at period boundaries, amplitude=0, large tick values)
  - [x] 1.2 Write unit tests for `createConnectionPointNode()` and helper functions in `src/puzzle/connection-point-nodes.test.ts`
  - [x] 1.3 Write unit tests for `createPuzzleGameboard()` (verify correct virtual nodes created for 1-input/1-output and 2-input/1-output puzzles)
  - [x] 1.4 Verify waveform generators are pure functions with no side effects (confirmed via tests)

- [x] Task 2: Input waveform visualization on connection points (AC: 1, 5)
  - [x] 2.1 Verified input waveforms render at left-side connection points during simulation via `waveformBuffers.get('input:N')` in `render-waveforms.ts`
  - [x] 2.2 No changes needed — render-waveforms.ts already draws input waveform paths at left connection point positions
  - [x] 2.3 Waveforms cycle continuously while simulation runs (driven by simulation-controller tick loop)

- [x] Task 3: Target waveform overlay on output connection points (AC: 2)
  - [x] 3.1 Target waveform rendering already implemented via `drawTargetWaveform()` in `render-waveforms.ts` using `waveformBuffers.get('target:N')`
  - [x] 3.2 Target renders as dashed green line (#50c878) at 70% opacity — visually distinct from solid actual output waveform
  - [x] 3.3 Actual output waveform (`output:N`) renders alongside target in same waveform box

- [x] Task 4: Puzzle info UI (AC: 1, 2)
  - [x] 4.1 Created `PuzzleInfoBar` React component showing puzzle title and description
  - [x] 4.2 Shows active test case indicator (e.g., "Test 1/2: Sine wave")

- [x] Task 5: Level data integrity (AC: 3)
  - [x] 5.1 Fixed TUTORIAL_INVERT expectedOutputs (were identical to inputs; corrected to phase-shifted inversions)
  - [x] 5.2 Fixed TUTORIAL_MIX expectedOutputs (was constant-0 placeholder; corrected to representable sums) and added second test case
  - [x] 5.3 Created comprehensive level integrity test suite verifying activeInputs/activeOutputs match test case array lengths, unique IDs, positive periods, and mathematical correctness of expected outputs

## Dev Notes

### Architecture Compliance

- **Engine isolation**: Waveform generators in `src/puzzle/` are pure TS — no React/Canvas imports. Correct.
- **Store communication**: Puzzle state flows through `src/store/slices/puzzle-slice.ts`. Canvas reads via `getState()` in rAF loop. Correct.
- **No lateral imports**: `src/puzzle/` imports only from `src/shared/`. `src/simulation/` reads puzzle state from store. Correct.

### Signal Flow in Puzzle Mode

```
[WaveformDef] → generateWaveformValue(tick, def) → connection-input node output
  → wire → player's circuit → wire → connection-output node input
                                        ↕ compared visually with
[WaveformDef] → generateWaveformValue(tick, def) → target buffer → overlay render
```

### What NOT to Build in This Story

- **Validation logic** (matching actual vs target) — Story 2.2
- **Victory detection / streak counter** — Story 2.2
- **Formula baking** — Story 2.3
- **Completion ceremony** — Story 2.4

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.1]
- [Source: _bmad-output/game-architecture.md — Puzzle Validation Engine, Waveform Visualization]
- [Source: _bmad-output/project-context.md — Signal Processing Rules, Rendering & State Architecture]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- Most of Story 2.1 was already implemented in uncommitted work from Epic 1 overflow (puzzle types, waveform generators, connection point nodes, simulation integration, target waveform overlay rendering)
- Fixed critical data bug: TUTORIAL_INVERT expected outputs were identical to inputs (not inverted). Corrected by applying half-period phase shift.
- Fixed critical data bug: TUTORIAL_MIX expected output was a constant-0 placeholder. Corrected by choosing same-frequency inputs whose sum is representable as a single WaveformDef. Added second test case (sine + constant).
- Created PuzzleInfoBar UI component showing puzzle title, description, and active test case indicator.
- Added 26 new tests across tutorial level integrity checks, including mathematical verification that expected outputs match inverted/summed inputs.
- All 174 tests pass. TypeScript compiles cleanly.

### Change Log

- 2026-02-03: Story 2.1 implementation — fixed level data, added PuzzleInfoBar, added level integrity tests

### File List

- `src/puzzle/levels/tutorial-levels.ts` — Modified (fixed TUTORIAL_INVERT and TUTORIAL_MIX expectedOutputs)
- `src/puzzle/levels/tutorial-levels.test.ts` — Created (26 tests: level integrity, inversion correctness, sum correctness)
- `src/ui/puzzle/PuzzleInfoBar.tsx` — Created (puzzle title/description/test case display)
- `src/ui/puzzle/PuzzleInfoBar.module.css` — Created (styles)
- `src/App.tsx` — Modified (integrated PuzzleInfoBar)
