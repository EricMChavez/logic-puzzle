import { useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { initializeCreativeMode } from '../../App.tsx';
import { startSimulation } from '../../simulation/simulation-controller.ts';
import styles from './StartScreen.module.css';

export function StartScreen() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'start-screen') return null;
  return <StartScreenInner />;
}

function StartScreenInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const openOverlay = useGameStore((s) => s.openOverlay);

  const handleCreativeMode = useCallback(() => {
    // Re-initialize creative mode fresh and start simulation
    initializeCreativeMode();
    closeOverlay();
  }, [closeOverlay]);

  const handleLevelSelect = useCallback(() => {
    // Switch to level select overlay
    openOverlay({ type: 'level-select' });
  }, [openOverlay]);

  return (
    <div className={styles.backdrop}>
      <div className={styles.container}>
        <h1 className={styles.title}>Signal Puzzle</h1>
        <p className={styles.subtitle}>Wire together nodes to transform signals</p>

        <div className={styles.buttonGroup}>
          <button
            className={`${styles.button} ${styles.primary}`}
            onClick={handleLevelSelect}
          >
            <span className={styles.buttonIcon}>&#x25B6;</span>
            Level Select
          </button>

          <button
            className={`${styles.button} ${styles.secondary}`}
            onClick={handleCreativeMode}
          >
            <span className={styles.buttonIcon}>&#x2699;</span>
            Creative Mode
          </button>
        </div>

        <div className={styles.hint}>
          <p>Complete puzzles to unlock new nodes for Creative Mode</p>
        </div>
      </div>
    </div>
  );
}
