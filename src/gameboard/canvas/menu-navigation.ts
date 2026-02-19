/**
 * Menu node click → zoom transition + navigation dispatch.
 * Extracted to keep GameboardCanvas.tsx focused on event handling.
 */
import type { ChipState } from '../../shared/types/index.ts';
import { useGameStore } from '../../store/index.ts';
import { captureViewportSnapshot, captureCropSnapshot } from './snapshot.ts';
import { getNodeGridSize } from '../../shared/grid/index.ts';
import { initializeCreativeMode } from '../../App.tsx';
import { PUZZLE_LEVELS } from '../../puzzle/levels/index.ts';
import { createPuzzleGameboard } from '../../puzzle/puzzle-gameboard.ts';
import { buildSlotConfig } from '../../puzzle/types.ts';
import { TUTORIAL_PUZZLE } from '../../tutorial/tutorial-puzzle.ts';
import { TUTORIAL_STEPS } from '../../tutorial/tutorial-steps.ts';
import { withSoundsSuppressed } from '../../shared/audio/index.ts';

/**
 * Handle a click on a menu node: capture snapshot, start zoom animation,
 * then navigate to the appropriate destination.
 */
export function navigateFromMenuNode(node: ChipState): void {
  if (node.params.locked) return;

  const state = useGameStore.getState();
  if (state.zoomTransitionState.type !== 'idle') return;

  // Capture viewport snapshot for zoom animation
  const snapshot = captureViewportSnapshot();
  if (snapshot) {
    const { cols, rows } = getNodeGridSize(node);
    const targetRect = { col: node.position.col, row: node.position.row, cols, rows };
    const crop = captureCropSnapshot(node.id, targetRect) ?? undefined;
    state.startZoomCapture(snapshot, targetRect, 'in', crop);
  }

  const menuKey = node.type.slice('menu:'.length);

  if (menuKey === 'creative') {
    // Push home board onto stack, then navigate to creative mode
    state.zoomIntoMenuNode(node.id);
    initializeCreativeMode();
  } else if (menuKey === 'tutorial') {
    // Tutorial chip: load the interactive tutorial
    state.zoomIntoMenuNode(node.id);

    if (state.isCreativeMode) {
      state.exitCreativeMode();
    }

    // Load the tutorial puzzle (single test case: offset +50)
    withSoundsSuppressed(() => {
      state.loadPuzzle(TUTORIAL_PUZZLE);
      state.setActiveBoard(createPuzzleGameboard(TUTORIAL_PUZZLE));
      const slotConfig = TUTORIAL_PUZZLE.slotConfig
        ?? buildSlotConfig(TUTORIAL_PUZZLE.activeInputs, TUTORIAL_PUZZLE.activeOutputs);
      state.initializeMeters(slotConfig, 'off');
    });

    // Start the tutorial state machine (hidden until zoom animation completes)
    state.startTutorial(TUTORIAL_STEPS);
    state.setTutorialOverlayHidden(true);
  } else if (menuKey.startsWith('level-')) {
    // Extract puzzle ID (everything after 'level-')
    const puzzleId = menuKey.slice('level-'.length);
    const levelIndex = PUZZLE_LEVELS.findIndex(p => p.id === puzzleId);
    if (levelIndex < 0) return;

    const puzzle = PUZZLE_LEVELS[levelIndex];
    if (!puzzle) return;

    // Push motherboard onto stack
    state.zoomIntoMenuNode(node.id);

    // Exit creative mode if active
    if (state.isCreativeMode) {
      state.exitCreativeMode();
    }

    // Load the puzzle (restore saved board if available)
    withSoundsSuppressed(() => {
      state.setCurrentLevel(levelIndex);
      state.loadPuzzle(puzzle);
      const savedEntry = state.craftedPuzzles.get(puzzle.id);
      state.setActiveBoard(savedEntry?.savedBoard ?? createPuzzleGameboard(puzzle));
      const slotConfig = puzzle.slotConfig
        ?? buildSlotConfig(puzzle.activeInputs, puzzle.activeOutputs);
      state.initializeMeters(slotConfig, 'off');
    });
  } else if (menuKey.startsWith('custom-')) {
    // Extract custom puzzle ID (everything after 'custom-')
    const puzzleId = menuKey.slice('custom-'.length);

    // Push motherboard onto stack
    state.zoomIntoMenuNode(node.id);

    // Exit creative mode if active
    if (state.isCreativeMode) {
      state.exitCreativeMode();
    }

    // Load the custom puzzle
    state.loadCustomPuzzle(puzzleId);
  }
}
