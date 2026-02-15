import { useGameStore } from '../../store/index.ts';
import { NODE_TYPE_LABELS } from '../../shared/constants/index.ts';
import { captureViewportSnapshot, captureCropSnapshot } from '../../gameboard/canvas/snapshot.ts';
import { getNodeGridSize } from '../../shared/grid/index.ts';
import styles from './NodeControls.module.css';

export function NodeControls() {
  const selectedNodeId = useGameStore((s) => s.selectedNodeId);
  const activeBoard = useGameStore((s) => s.activeBoard);
  const removeNode = useGameStore((s) => s.removeNode);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const readOnly = useGameStore((s) => s.activeBoardReadOnly);
  const zoomIntoNode = useGameStore((s) => s.zoomIntoNode);

  if (!selectedNodeId || !activeBoard) return null;
  const node = activeBoard.chips.get(selectedNodeId);
  if (!node) return null;

  // Menu nodes don't show controls (click navigates immediately)
  if (node.type.startsWith('menu:')) return null;

  const isPuzzleNode = node.type.startsWith('puzzle:');
  const isUtilityNode = node.type.startsWith('utility:');
  const puzzleId = isPuzzleNode ? node.type.slice('puzzle:'.length) : null;
  const utilityId = isUtilityNode ? node.type.slice('utility:'.length) : null;
  const puzzleEntry = puzzleId ? useGameStore.getState().puzzleNodes.get(puzzleId) : null;
  const utilityEntry = utilityId ? useGameStore.getState().utilityNodes.get(utilityId) : null;
  const label = isPuzzleNode && puzzleEntry
    ? puzzleEntry.title
    : isUtilityNode && utilityEntry
      ? utilityEntry.title
      : (NODE_TYPE_LABELS[node.type] ?? node.type);
  const isZoomable = isPuzzleNode || isUtilityNode;

  const isModified = (() => {
    if (!node.libraryVersionHash) return false;
    if (isPuzzleNode && puzzleEntry) return puzzleEntry.versionHash !== node.libraryVersionHash;
    if (isUtilityNode && utilityEntry) return utilityEntry.versionHash !== node.libraryVersionHash;
    return false;
  })();

  function handleEdit() {
    const state = useGameStore.getState();
    if (state.zoomTransitionState.type !== 'idle') return;
    if (!state.activeBoard) return;
    const node = state.activeBoard.chips.get(selectedNodeId!);
    if (!node) return;

    const snapshot = captureViewportSnapshot();
    if (snapshot) {
      const { cols, rows } = getNodeGridSize(node);
      const targetRect = { col: node.position.col, row: node.position.row, cols, rows };
      const crop = captureCropSnapshot(selectedNodeId!, targetRect) ?? undefined;
      state.startZoomCapture(snapshot, targetRect, 'in', crop);
    }
    zoomIntoNode(selectedNodeId!);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>
          {label}
          {isModified && <span className={styles.modifiedBadge}> modified</span>}
        </span>
        <div className={styles.headerButtons}>
          {isZoomable && (
            <button
              className={styles.editBtn}
              onClick={handleEdit}
              title="View internals"
            >
              Edit
            </button>
          )}
          {!readOnly && (
            <button
              className={styles.deleteBtn}
              onClick={() => {
                removeNode(selectedNodeId);
                clearSelection();
              }}
              title="Delete chip"
            >
              ×
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
