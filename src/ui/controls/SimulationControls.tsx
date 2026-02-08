import { useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { TRIM_WINDOW_WTS } from '../../store/slices/authoring-slice.ts';
import styles from './SimulationControls.module.css';

/** Minimum samples per output buffer before Save is enabled */
const MIN_BUFFER_SAMPLES = TRIM_WINDOW_WTS * 16;

export function SimulationControls() {
  const isCreativeMode = useGameStore((s) => s.isCreativeMode);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const openTrimDialog = useGameStore((s) => s.openTrimDialog);
  const canSave = useGameStore((s) => {
    if (!s.isCreativeMode) return false;
    // validRecordedWTS only counts WTS where at least one output had signal
    if (s.validRecordedWTS < TRIM_WINDOW_WTS) return false;
    // ALL output slots must have enough buffer data
    let hasOutput = false;
    for (let i = 0; i < s.creativeSlots.length; i++) {
      if (s.creativeSlots[i].direction === 'output') {
        hasOutput = true;
        const buf = s.outputBuffers.get(i);
        if (!buf || buf.length < MIN_BUFFER_SAMPLES) return false;
      }
    }
    return hasOutput;
  });

  const handleSaveAsPuzzle = useCallback(() => {
    // Snapshot output buffers and open trim dialog
    openTrimDialog();
    openOverlay({ type: 'trim-dialog' });
  }, [openTrimDialog, openOverlay]);

  if (!isCreativeMode) return null;

  return (
    <div className={styles.panel}>
      <button
        className={styles.saveButton}
        onClick={handleSaveAsPuzzle}
        disabled={!canSave}
        title={canSave ? 'Save current configuration as a puzzle' : `Record at least ${TRIM_WINDOW_WTS} WTS of non-silent output before saving`}
      >
        Save as Puzzle
      </button>
    </div>
  );
}
