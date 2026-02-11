import { useGameStore } from '../../store/index.ts';
import { NODE_TYPE_LABELS } from '../../shared/constants/index.ts';
import { stopSimulation } from '../../simulation/simulation-controller.ts';
import type { MixMode } from '../../engine/nodes/mix.ts';
import styles from './NodeControls.module.css';

const MIX_MODES: MixMode[] = ['Add', 'Subtract', 'Average', 'Max', 'Min'];

export function NodeControls() {
  const selectedNodeId = useGameStore((s) => s.selectedNodeId);
  const activeBoard = useGameStore((s) => s.activeBoard);
  const updateNodeParams = useGameStore((s) => s.updateNodeParams);
  const removeNode = useGameStore((s) => s.removeNode);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const readOnly = useGameStore((s) => s.activeBoardReadOnly);
  const zoomIntoNode = useGameStore((s) => s.zoomIntoNode);

  if (!selectedNodeId || !activeBoard) return null;
  const node = activeBoard.nodes.get(selectedNodeId);
  if (!node) return null;

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
    if (state.simulationRunning) {
      stopSimulation();
      state.setSimulationRunning(false);
    }
    const snapshot = document.querySelector('canvas')?.toDataURL() ?? '';
    state.startZoomTransition('in', snapshot);
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
              title="Delete node"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {!readOnly && node.type === 'mix' && (
        <label className={styles.field}>
          <span>Mode</span>
          <select
            value={String(node.params['mode'] ?? 'Add')}
            onChange={(e) =>
              updateNodeParams(selectedNodeId, { mode: e.target.value })
            }
          >
            {MIX_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      )}

      {readOnly && node.type === 'mix' && (
        <div className={styles.field}>
          <span>Mode: {String(node.params['mode'] ?? 'Add')}</span>
        </div>
      )}

      {!readOnly && node.type === 'threshold' && (
        <label className={styles.field}>
          <span>Threshold: {node.params['threshold'] ?? 0}</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={Number(node.params['threshold'] ?? 0)}
            onChange={(e) =>
              updateNodeParams(selectedNodeId, { threshold: Number(e.target.value) })
            }
          />
        </label>
      )}

      {readOnly && node.type === 'threshold' && (
        <div className={styles.field}>
          <span>Threshold: {node.params['threshold'] ?? 0}</span>
        </div>
      )}

    </div>
  );
}
