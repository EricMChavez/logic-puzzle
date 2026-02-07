import { useGameStore } from '../../store/index.ts';
import { PUZZLE_LEVELS } from '../../puzzle/levels/index.ts';
import { createPuzzleGameboard } from '../../puzzle/puzzle-gameboard.ts';
import { buildConnectionPointConfig } from '../../puzzle/types.ts';
import styles from './LevelSelect.module.css';

export function LevelSelect() {
  const completedLevels = useGameStore((s) => s.completedLevels);
  const activePuzzle = useGameStore((s) => s.activePuzzle);

  function handleSelectLevel(index: number) {
    const store = useGameStore.getState();
    if (!store.isLevelUnlocked(index)) return;

    const puzzle = PUZZLE_LEVELS[index];
    if (!puzzle) return;

    store.setCurrentLevel(index);
    store.loadPuzzle(puzzle);
    store.setActiveBoard(createPuzzleGameboard(puzzle));
    const cpConfig = buildConnectionPointConfig(puzzle.activeInputs, puzzle.activeOutputs);
    store.initializeMeters(cpConfig, 'dimmed');
  }

  return (
    <div className={styles.container}>
      {PUZZLE_LEVELS.map((puzzle, index) => {
        const isCompleted = completedLevels.has(puzzle.id);
        const isCurrent = activePuzzle?.id === puzzle.id;
        const isUnlocked = useGameStore.getState().isLevelUnlocked(index);

        const classNames = [
          styles.levelBtn,
          isCurrent ? styles.current : '',
          isCompleted ? styles.completed : '',
          !isUnlocked ? styles.locked : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={puzzle.id}
            className={classNames}
            onClick={() => handleSelectLevel(index)}
            disabled={!isUnlocked}
            title={!isUnlocked ? 'Complete previous level to unlock' : puzzle.description}
          >
            <span className={styles.statusIcon}>
              {isCompleted ? '\u2713' : !isUnlocked ? '\u{1F512}' : '\u25CB'}
            </span>
            {index + 1}. {puzzle.title}
          </button>
        );
      })}
    </div>
  );
}
