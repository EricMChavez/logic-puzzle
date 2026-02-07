import { useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { startSimulation, stopSimulation } from '../../simulation/simulation-controller.ts';
import styles from './SimulationControls.module.css';

export function SimulationControls() {
  const running = useGameStore((s) => s.simulationRunning);
  const activeBoard = useGameStore((s) => s.activeBoard);
  const isCreativeMode = useGameStore((s) => s.isCreativeMode);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const openTrimDialog = useGameStore((s) => s.openTrimDialog);

  const handleSaveAsPuzzle = useCallback(() => {
    // Snapshot output buffers and open trim dialog
    openTrimDialog();
    openOverlay({ type: 'trim-dialog' });
  }, [openTrimDialog, openOverlay]);

  if (!activeBoard) return null;

  function toggle() {
    if (running) {
      stopSimulation();
      useGameStore.getState().setSimulationRunning(false);
    } else {
      startSimulation();
      useGameStore.getState().setSimulationRunning(true);
    }
  }

  return (
    <div className={styles.panel}>
      <button
        className={`${styles.button} ${running ? styles.buttonActive : ''}`}
        onClick={toggle}
      >
        {running ? 'Stop' : 'Play'}
      </button>
      {isCreativeMode && (
        <button
          className={styles.saveButton}
          onClick={handleSaveAsPuzzle}
          title="Save current configuration as a puzzle"
        >
          Save as Puzzle
        </button>
      )}
    </div>
  );
}
