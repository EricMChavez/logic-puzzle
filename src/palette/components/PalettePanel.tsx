import { useGameStore } from '../../store/index.ts';
import { chipRegistry, getChipLabel } from '../../engine/nodes/registry.ts';
import { generateId } from '../../shared/generate-id.ts';
import { createUtilityGameboard } from '../../puzzle/utility-gameboard.ts';
import { captureViewportSnapshot } from '../../gameboard/canvas/snapshot.ts';
import { LevelSelect } from '../../ui/puzzle/LevelSelect.tsx';
import styles from './PalettePanel.module.css';

export function PalettePanel() {
  const interactionMode = useGameStore((s) => s.interactionMode);
  const startPlacingChip = useGameStore((s) => s.startPlacingChip);
  const cancelPlacing = useGameStore((s) => s.cancelPlacing);
  const craftedUtilities = useGameStore((s) => s.craftedUtilities);
  const readOnly = useGameStore((s) => s.activeBoardReadOnly);
  const activePuzzle = useGameStore((s) => s.activePuzzle);

  if (readOnly) return null;

  const allowedChips = activePuzzle?.allowedChips ?? null;

  function handleCreateCustom() {
    const state = useGameStore.getState();
    if (state.zoomTransitionState.type !== 'idle') return;
    const utilityId = generateId();
    const board = createUtilityGameboard(utilityId);

    const snapshot = captureViewportSnapshot();
    if (snapshot) {
      // Synthetic center rect (no specific node to zoom into)
      const targetRect = { col: 28, row: 16, cols: 5, rows: 3 };
      state.startZoomCapture(snapshot, targetRect, 'in');
    }
    state.startEditingUtility(utilityId, board);
  }

  function handleEditUtility(utilityId: string) {
    const state = useGameStore.getState();
    if (state.zoomTransitionState.type !== 'idle') return;
    const entry = state.craftedUtilities.get(utilityId);
    if (!entry) return;

    const snapshot = captureViewportSnapshot();
    if (snapshot) {
      const targetRect = { col: 28, row: 16, cols: 5, rows: 3 };
      state.startZoomCapture(snapshot, targetRect, 'in');
    }
    state.startEditingUtility(utilityId, entry.board);
  }

  function handleDeleteUtility(utilityId: string) {
    useGameStore.getState().deleteCraftedUtility(utilityId);
  }

  // Filter fundamental nodes by allowedChips constraint
  const visibleFundamentals = allowedChips
    ? chipRegistry.all.filter((def) => def.type in allowedChips)
    : chipRegistry.all;

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Levels</h3>
      <LevelSelect />

      <h3 className={styles.title}>Chips</h3>
      <div className={styles.list}>
        {visibleFundamentals.map((def) => {
          const isActive =
            interactionMode.type === 'placing-chip' &&
            interactionMode.chipType === def.type;

          return (
            <button
              key={def.type}
              className={`${styles.item} ${isActive ? styles.active : ''}`}
              onClick={() => {
                if (isActive) {
                  cancelPlacing();
                } else {
                  startPlacingChip(def.type);
                }
              }}
            >
              {getChipLabel(def.type)}
            </button>
          );
        })}
      </div>

      {/* Custom node creation and user nodes - only shown when 'custom' is allowed */}
      {(!allowedChips || 'custom' in allowedChips) && (
        <>
          <button className={`${styles.item} ${styles.createCustomBtn}`} onClick={handleCreateCustom}>
            + Create Custom Chip
          </button>

          {craftedUtilities.size > 0 && (
            <>
              <h3 className={styles.title}>Custom</h3>
              <div className={styles.list}>
                {Array.from(craftedUtilities.values())
            .map((entry) => {
              const nodeType = `utility:${entry.utilityId}`;
              const isActive =
                interactionMode.type === 'placing-chip' &&
                interactionMode.chipType === nodeType;

              return (
                <div key={nodeType} className={styles.utilityItem}>
                  <button
                    className={`${styles.item} ${isActive ? styles.active : ''}`}
                    onClick={() => {
                      if (isActive) {
                        cancelPlacing();
                      } else {
                        startPlacingChip(nodeType);
                      }
                    }}
                  >
                    {entry.title}
                  </button>
                  <div className={styles.utilityActions}>
                    <button
                      className={styles.smallBtn}
                      onClick={() => handleEditUtility(entry.utilityId)}
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      className={styles.smallBtn}
                      onClick={() => handleDeleteUtility(entry.utilityId)}
                      title="Delete"
                    >
                      Del
                    </button>
                  </div>
                </div>
              );
            })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
