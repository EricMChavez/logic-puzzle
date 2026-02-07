import { useGameStore } from '../../store/index.ts';
import styles from './PuzzleInfoBar.module.css';

export function PuzzleInfoBar() {
  const activePuzzle = useGameStore((s) => s.activePuzzle);
  const activeTestCaseIndex = useGameStore((s) => s.activeTestCaseIndex);
  const puzzleStatus = useGameStore((s) => s.puzzleStatus);
  const testCasesPassed = useGameStore((s) => s.testCasesPassed);

  if (!activePuzzle) return null;

  const testCase = activePuzzle.testCases[activeTestCaseIndex];
  const totalCases = activePuzzle.testCases.length;

  return (
    <div className={styles.bar}>
      <span className={styles.title}>{activePuzzle.title}</span>
      <span className={styles.description}>{activePuzzle.description}</span>
      {testCase && (
        <span className={styles.testCase}>
          Test {activeTestCaseIndex + 1}/{totalCases}: {testCase.name}
        </span>
      )}
      {puzzleStatus === 'victory' ? (
        <span className={styles.victory}>Puzzle Complete!</span>
      ) : (
        <>
          {totalCases > 1 && (
            <span className={styles.testsPassed}>
              Tests: {testCasesPassed.length}/{totalCases} passed
            </span>
          )}
        </>
      )}
    </div>
  );
}
