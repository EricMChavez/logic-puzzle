import { useGameStore } from '../../store/index.ts';
import { PUZZLE_LEVELS } from '../../puzzle/levels/index.ts';
import { createPuzzleGameboard } from '../../puzzle/puzzle-gameboard.ts';
import { buildSlotConfig } from '../../puzzle/types.ts';
import styles from './CompletionCeremony.module.css';

export function CompletionCeremony() {
  const ceremonyState = useGameStore((s) => s.ceremonyState);

  if (ceremonyState.type !== 'victory-screen') return null;

  const { puzzle, isResolve, bakeMetadata } = ceremonyState;

  function handleContinue() {
    const store = useGameStore.getState();

    store.dismissCeremony();

    // Use progression state to determine next level
    const nextIndex = store.currentLevelIndex;
    const nextPuzzle = PUZZLE_LEVELS[nextIndex];

    if (nextPuzzle && nextPuzzle.id !== puzzle.id) {
      store.setCurrentLevel(nextIndex);
      store.loadPuzzle(nextPuzzle);
      store.setActiveBoard(createPuzzleGameboard(nextPuzzle));

      // Initialize meters with the next puzzle's slot configuration
      const slotConfig = nextPuzzle.slotConfig
        ?? buildSlotConfig(nextPuzzle.activeInputs, nextPuzzle.activeOutputs);
      store.initializeMeters(slotConfig, 'hidden');

    } else {
      // Last level completed — go to sandbox
      store.unloadPuzzle();
      store.setActiveBoard({ id: 'sandbox', chips: new Map(), paths: [] });
    }
  }

  function handleKeepCurrent() {
    useGameStore.getState().dismissCeremony();
  }

  function handleSaveNew() {
    if (bakeMetadata && puzzle) {
      const store = useGameStore.getState();
      store.updatePuzzleNode(puzzle.id, bakeMetadata);
      store.dismissCeremony();
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.info}>
        <h2 className={styles.title}>{puzzle.title}</h2>
        <p className={styles.description}>{puzzle.description}</p>
        {!isResolve && (
          <p className={styles.paletteMessage}>Added to your Puzzle palette!</p>
        )}
      </div>

      <div className={styles.buttons}>
        {isResolve ? (
          <>
            <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={handleKeepCurrent}>
              Keep Current
            </button>
            <button className={styles.button} onClick={handleSaveNew}>
              Save New Solution
            </button>
          </>
        ) : (
          <button className={styles.button} onClick={handleContinue}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
