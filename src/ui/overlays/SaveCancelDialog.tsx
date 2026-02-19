import { useGameStore } from '../../store/index.ts';
import { bakeGraph } from '../../engine/baking/index.ts';
import { generateId } from '../../shared/generate-id.ts';
import { captureViewportSnapshot } from '../../gameboard/canvas/snapshot.ts';
import { getNodeGridSize } from '../../shared/grid/index.ts';
import type { ChipSwap } from '../../store/slices/navigation-slice.ts';
import styles from './SaveCancelDialog.module.css';

/**
 * Start zoom-out transition.
 * If in reveal-paused state (two-part flow), use confirmRevealAndZoom.
 * Otherwise, capture viewport and start a combined zoom-out (fallback).
 */
function startZoomOut(state: ReturnType<typeof useGameStore.getState>): void {
  // Two-part flow: reveal already completed, just confirm and zoom
  if (state.zoomTransitionState.type === 'reveal-paused') {
    state.confirmRevealAndZoom();
    return;
  }

  // Fallback: combined zoom-out (when reveal wasn't triggered, e.g. no crop)
  if (state.zoomTransitionState.type !== 'idle') return;
  const snapshot = captureViewportSnapshot();
  if (!snapshot) return;

  const lastEntry = state.boardStack[state.boardStack.length - 1];
  if (lastEntry) {
    const parentNode = lastEntry.board.chips.get(lastEntry.chipIdInParent);
    if (parentNode) {
      const { cols, rows } = getNodeGridSize(parentNode);
      const targetRect = { col: parentNode.position.col, row: parentNode.position.row, cols, rows };
      state.startZoomCapture(snapshot, targetRect, 'out', lastEntry.zoomedCrop);
      return;
    }
  }
  // Fallback: synthetic center rect
  state.startZoomCapture(snapshot, { col: 28, row: 16, cols: 5, rows: 3 }, 'out');
}

export function SaveCancelDialog() {
  const overlayType = useGameStore((s) => s.activeOverlay.type);

  if (overlayType !== 'unsaved-changes') return null;

  function handleSave() {
    const state = useGameStore.getState();
    const editingUtilityId = state.editingUtilityId;
    if (!editingUtilityId || !state.activeBoard) return;

    const bakeResult = bakeGraph(state.activeBoard.chips, state.activeBoard.paths);
    if (!bakeResult.ok) {
      state.closeOverlay();
      return;
    }

    const { metadata } = bakeResult.value;
    const cpLayout = metadata.cpLayout;
    const existingEntry = state.craftedUtilities.get(editingUtilityId);
    const chipIdInParent = state.editingChipIdInParent;

    if (existingEntry) {
      const overwrite = window.confirm(`Overwrite "${existingEntry.title}"?`);
      if (overwrite) {
        state.updateCraftedUtility(editingUtilityId, metadata, state.activeBoard);
        startZoomOut(state);
        state.finishEditingUtility();
      } else {
        const newName = window.prompt('Name for new custom chip:');
        if (!newName) return;
        const newUtilityId = generateId();
        state.addCraftedUtility({
          utilityId: newUtilityId,
          title: newName,
          socketCount: metadata.socketCount,
          plugCount: metadata.plugCount,
          bakeMetadata: metadata,
          board: state.activeBoard,
          versionHash: generateId(),
          cpLayout,
        });
        startZoomOut(state);
        const swap: ChipSwap | undefined = chipIdInParent ? {
          chipId: chipIdInParent,
          newType: `utility:${newUtilityId}`,
          socketCount: metadata.socketCount,
          plugCount: metadata.plugCount,
          cpLayout,
        } : undefined;
        state.finishEditingUtility(swap);
      }
    } else {
      const name = window.prompt('Name for this custom chip:');
      if (!name) return;
      state.addCraftedUtility({
        utilityId: editingUtilityId,
        title: name,
        socketCount: metadata.socketCount,
        plugCount: metadata.plugCount,
        bakeMetadata: metadata,
        board: state.activeBoard,
        versionHash: generateId(),
        cpLayout,
      });
      startZoomOut(state);
      const swap: ChipSwap | undefined = chipIdInParent ? {
        chipId: chipIdInParent,
        newType: `utility:${editingUtilityId}`,
        socketCount: metadata.socketCount,
        plugCount: metadata.plugCount,
        cpLayout,
      } : undefined;
      state.finishEditingUtility(swap);
    }

    state.closeOverlay();
  }

  function handleDiscard() {
    const state = useGameStore.getState();
    startZoomOut(state);
    state.finishEditingUtility();
    state.closeOverlay();
  }

  function handleKeepEditing() {
    const state = useGameStore.getState();
    state.cancelReveal();
    state.closeOverlay();
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>Unsaved Changes</h3>
        <p className={styles.message}>
          You have unsaved changes to this custom chip. What would you like to do?
        </p>
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${styles.btnCancel}`} onClick={handleKeepEditing}>
            Keep Editing
          </button>
          <button className={`${styles.btn} ${styles.btnDiscard}`} onClick={handleDiscard}>
            Discard
          </button>
          <button className={`${styles.btn} ${styles.btnSave}`} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
