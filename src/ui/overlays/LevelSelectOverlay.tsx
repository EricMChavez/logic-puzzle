import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/index.ts';
import { PUZZLE_LEVELS } from '../../puzzle/levels/index.ts';
import { createPuzzleGameboard } from '../../puzzle/puzzle-gameboard.ts';
import { buildConnectionPointConfig } from '../../puzzle/types.ts';
import { startSimulation, stopSimulation } from '../../simulation/simulation-controller.ts';
import styles from './LevelSelectOverlay.module.css';

export function LevelSelectOverlay() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'level-select') return null;
  return <LevelSelectInner />;
}

function LevelSelectInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const completedLevels = useGameStore((s) => s.completedLevels);
  const customPuzzles = useGameStore((s) => s.customPuzzles);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const handleBack = useCallback(() => {
    openOverlay({ type: 'start-screen' });
  }, [openOverlay]);

  const handleSelectLevel = useCallback((index: number) => {
    const store = useGameStore.getState();
    if (!store.isLevelUnlocked(index)) return;

    const puzzle = PUZZLE_LEVELS[index];
    if (!puzzle) return;

    // Stop any running simulation
    stopSimulation();

    // Exit creative mode if active
    if (store.isCreativeMode) {
      store.exitCreativeMode();
    }

    store.setCurrentLevel(index);
    store.loadPuzzle(puzzle);
    store.setActiveBoard(createPuzzleGameboard(puzzle));
    const cpConfig = buildConnectionPointConfig(puzzle.activeInputs, puzzle.activeOutputs);
    store.initializeMeters(cpConfig, 'dimmed');

    // Start simulation and close overlay
    store.setSimulationRunning(true);
    startSimulation();
    closeOverlay();
  }, [closeOverlay]);

  const handleSelectCustomPuzzle = useCallback((puzzleId: string) => {
    const store = useGameStore.getState();
    const puzzle = store.customPuzzles.get(puzzleId);
    if (!puzzle) return;

    // Stop any running simulation
    stopSimulation();

    // Exit creative mode if active
    if (store.isCreativeMode) {
      store.exitCreativeMode();
    }

    // Load custom puzzle
    store.loadCustomPuzzle(puzzleId);

    // Start simulation and close overlay
    store.setSimulationRunning(true);
    startSimulation();
    closeOverlay();
  }, [closeOverlay]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleBack();
    }
  }, [handleBack]);

  const isLevelUnlocked = useGameStore((s) => s.isLevelUnlocked);

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.panel}
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Level Select"
      >
        <div className={styles.header}>
          <button className={styles.backButton} onClick={handleBack}>
            &#x2190; Back
          </button>
          <h2 className={styles.title}>Select Level</h2>
        </div>

        <div className={styles.content}>
          {/* Built-in Puzzles Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Puzzles</h3>
            <div className={styles.levelGrid}>
              {PUZZLE_LEVELS.map((puzzle, index) => {
                const isCompleted = completedLevels.has(puzzle.id);
                const isUnlocked = isLevelUnlocked(index);

                return (
                  <button
                    key={puzzle.id}
                    className={`${styles.levelCard} ${isCompleted ? styles.completed : ''} ${!isUnlocked ? styles.locked : ''}`}
                    onClick={() => handleSelectLevel(index)}
                    disabled={!isUnlocked}
                    title={!isUnlocked ? 'Complete previous level to unlock' : puzzle.description}
                  >
                    <div className={styles.levelNumber}>
                      {isCompleted ? '\u2713' : !isUnlocked ? '\u{1F512}' : index + 1}
                    </div>
                    <div className={styles.levelInfo}>
                      <div className={styles.levelTitle}>{puzzle.title}</div>
                      <div className={styles.levelDesc}>{puzzle.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Custom Puzzles Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Custom Puzzles</h3>
            {customPuzzles.size === 0 ? (
              <div className={styles.emptyState}>
                <p>No custom puzzles yet</p>
                <p className={styles.emptyHint}>Create puzzles in Creative Mode using "Save as Puzzle"</p>
              </div>
            ) : (
              <div className={styles.levelGrid}>
                {Array.from(customPuzzles.values()).map((puzzle) => (
                  <button
                    key={puzzle.id}
                    className={styles.levelCard}
                    onClick={() => handleSelectCustomPuzzle(puzzle.id)}
                    title={puzzle.description}
                  >
                    <div className={styles.levelNumber}>
                      &#x2605;
                    </div>
                    <div className={styles.levelInfo}>
                      <div className={styles.levelTitle}>{puzzle.title}</div>
                      <div className={styles.levelDesc}>{puzzle.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
