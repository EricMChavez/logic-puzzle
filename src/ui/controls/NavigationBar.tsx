import { useGameStore } from '../../store/index.ts';
import { stopSimulation } from '../../simulation/simulation-controller.ts';
import { bakeGraph } from '../../engine/baking/index.ts';
import { generateId } from '../../shared/generate-id.ts';
import type { BoardStackEntry, NodeSwap } from '../../store/slices/navigation-slice.ts';
import type { PuzzleNodeEntry, UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';
import styles from './NavigationBar.module.css';

export function computeBreadcrumbs(
  boardStack: BoardStackEntry[],
  puzzleNodes: Map<string, PuzzleNodeEntry>,
  activePuzzle: PuzzleDefinition | null,
  utilityNodes?: Map<string, UtilityNodeEntry>,
): string[] {
  const root = activePuzzle?.title ?? 'Sandbox';
  const segments = [root];

  for (const entry of boardStack) {
    const node = entry.board.nodes.get(entry.nodeIdInParent);
    if (node && node.type.startsWith('puzzle:')) {
      const puzzleId = node.type.slice('puzzle:'.length);
      const title = puzzleNodes.get(puzzleId)?.title ?? puzzleId;
      segments.push(title);
    } else if (node && node.type.startsWith('utility:') && utilityNodes) {
      const utilityId = node.type.slice('utility:'.length);
      const title = utilityNodes.get(utilityId)?.title ?? utilityId;
      segments.push(title);
    } else if (entry.nodeIdInParent) {
      segments.push(entry.nodeIdInParent);
    }
  }

  return segments;
}

export function NavigationBar() {
  const depth = useGameStore((s) => s.navigationDepth);
  const boardStack = useGameStore((s) => s.boardStack);
  const puzzleNodes = useGameStore((s) => s.puzzleNodes);
  const utilityNodes = useGameStore((s) => s.utilityNodes);
  const activePuzzle = useGameStore((s) => s.activePuzzle);
  const editingUtilityId = useGameStore((s) => s.editingUtilityId);
  const zoomOut = useGameStore((s) => s.zoomOut);

  if (depth === 0 && !editingUtilityId) return null;

  const breadcrumbs = computeBreadcrumbs(boardStack, puzzleNodes, activePuzzle, utilityNodes);

  function handleDone() {
    const state = useGameStore.getState();
    if (state.simulationRunning) {
      stopSimulation();
      state.setSimulationRunning(false);
    }
    const snapshot = document.querySelector('canvas')?.toDataURL() ?? '';
    state.startZoomTransition('out', snapshot);
    zoomOut();
  }

  function handleSave() {
    const state = useGameStore.getState();
    if (!editingUtilityId || !state.activeBoard) return;

    if (state.simulationRunning) {
      stopSimulation();
      state.setSimulationRunning(false);
    }

    const bakeResult = bakeGraph(state.activeBoard.nodes, state.activeBoard.wires);
    if (!bakeResult.ok) {
      alert(`Cannot save: ${bakeResult.error.message}`);
      return;
    }

    const { metadata } = bakeResult.value;
    const cpLayout = metadata.cpLayout;
    const existingEntry = state.utilityNodes.get(editingUtilityId);
    const nodeIdInParent = state.editingNodeIdInParent;

    if (existingEntry) {
      // Existing utility node: offer overwrite or rename
      const overwrite = window.confirm(`Overwrite "${existingEntry.title}"?`);
      if (overwrite) {
        state.updateUtilityNode(editingUtilityId, metadata, state.activeBoard);
        const snapshot = document.querySelector('canvas')?.toDataURL() ?? '';
        state.startZoomTransition('out', snapshot);
        state.finishEditingUtility();
      } else {
        // Rename: create a new utility node and swap only this instance
        const newName = window.prompt('Name for new custom node:');
        if (!newName) return;
        const newUtilityId = generateId();
        state.addUtilityNode({
          utilityId: newUtilityId,
          title: newName,
          inputCount: metadata.inputCount,
          outputCount: metadata.outputCount,
          bakeMetadata: metadata,
          board: state.activeBoard,
          versionHash: generateId(),
          cpLayout,
        });
        const snapshot = document.querySelector('canvas')?.toDataURL() ?? '';
        state.startZoomTransition('out', snapshot);
        // Swap this instance to the new type
        const swap: NodeSwap | undefined = nodeIdInParent ? {
          nodeId: nodeIdInParent,
          newType: `utility:${newUtilityId}`,
          inputCount: metadata.inputCount,
          outputCount: metadata.outputCount,
          cpLayout,
        } : undefined;
        state.finishEditingUtility(swap);
      }
    } else {
      // First save: prompt for name, add to palette, swap blank→named
      const name = window.prompt('Name for this custom node:');
      if (!name) return;
      state.addUtilityNode({
        utilityId: editingUtilityId,
        title: name,
        inputCount: metadata.inputCount,
        outputCount: metadata.outputCount,
        bakeMetadata: metadata,
        board: state.activeBoard,
        versionHash: generateId(),
        cpLayout,
      });
      const snapshot = document.querySelector('canvas')?.toDataURL() ?? '';
      state.startZoomTransition('out', snapshot);
      // Swap custom-blank → utility:id in parent
      const swap: NodeSwap | undefined = nodeIdInParent ? {
        nodeId: nodeIdInParent,
        newType: `utility:${editingUtilityId}`,
        inputCount: metadata.inputCount,
        outputCount: metadata.outputCount,
        cpLayout,
      } : undefined;
      state.finishEditingUtility(swap);
    }
  }

  function handleCancel() {
    const state = useGameStore.getState();
    if (state.simulationRunning) {
      stopSimulation();
      state.setSimulationRunning(false);
    }
    const snapshot = document.querySelector('canvas')?.toDataURL() ?? '';
    state.startZoomTransition('out', snapshot);
    state.finishEditingUtility();
  }

  const isEditing = editingUtilityId !== null;

  return (
    <div className={styles.bar}>
      <span className={styles.breadcrumbs}>
        {breadcrumbs.map((label, i) => (
          <span key={i}>
            {i > 0 && <span className={styles.separator}>&gt;</span>}
            <span className={i === breadcrumbs.length - 1 ? styles.activeCrumb : styles.crumb}>
              {label}
            </span>
          </span>
        ))}
      </span>
      {isEditing ? (
        <>
          <button className={styles.saveBtn} onClick={handleSave}>
            Save
          </button>
          <button className={styles.cancelBtn} onClick={handleCancel}>
            Cancel
          </button>
        </>
      ) : (
        <button className={styles.doneBtn} onClick={handleDone}>
          Done
        </button>
      )}
    </div>
  );
}
