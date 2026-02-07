import { useCallback, useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/index.ts';
import { slotToMeterInfo } from '../../store/slices/creative-slice.ts';
import type { CustomPuzzle } from '../../store/slices/custom-puzzle-slice.ts';
import styles from './SavePuzzleDialog.module.css';

/** Samples per WTS (16 subdivisions) */
const SAMPLES_PER_WTS = 16;

export function SavePuzzleDialog() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'save-puzzle-dialog') return null;
  return <SavePuzzleDialogInner />;
}

function SavePuzzleDialogInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const cancelAuthoring = useGameStore((s) => s.cancelAuthoring);
  const trimBufferSnapshot = useGameStore((s) => s.trimBufferSnapshot);
  const trimConfig = useGameStore((s) => s.trimConfig);
  const creativeSlots = useGameStore((s) => s.creativeSlots);
  const activeBoard = useGameStore((s) => s.activeBoard);
  const addCustomPuzzle = useGameStore((s) => s.addCustomPuzzle);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus title input on mount
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  // Find input and output slots
  const inputSlots = creativeSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.direction === 'input');

  const outputSlots = creativeSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.direction === 'output');

  const { startWTS, endWTS } = trimConfig;
  const durationWTS = endWTS - startWTS;

  const handleCancel = useCallback(() => {
    cancelAuthoring();
    closeOverlay();
  }, [cancelAuthoring, closeOverlay]);

  const handleSave = useCallback(() => {
    // Validate
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    if (!activeBoard || !trimBufferSnapshot) {
      setError('Invalid state - please try again');
      return;
    }

    // Extract trimmed samples for each output slot
    const targetSamples = new Map<number, number[]>();
    const startSample = startWTS * SAMPLES_PER_WTS;
    const endSample = endWTS * SAMPLES_PER_WTS;

    for (const { index: slotIndex } of outputSlots) {
      const fullBuffer = trimBufferSnapshot.get(slotIndex);
      if (fullBuffer) {
        const trimmed = fullBuffer.slice(startSample, endSample);
        targetSamples.set(slotIndex, trimmed);
      }
    }

    // Build slot configuration
    const slots = creativeSlots.map((slot) => ({
      direction: slot.direction,
      waveform: slot.direction === 'input' ? slot.waveform : undefined,
    }));

    // Serialize current nodes (excluding connection point nodes)
    const initialNodes = Array.from(activeBoard.nodes.values())
      .filter((node) => !node.id.startsWith('creative-slot-'))
      .map((node) => ({
        id: node.id,
        type: node.type,
        position: { col: node.position.col, row: node.position.row },
        params: { ...node.params },
      }));

    // Serialize wires (only those connected to non-CP nodes)
    const initialWires = activeBoard.wires
      .filter((wire) =>
        !wire.source.nodeId.startsWith('creative-slot-') &&
        !wire.target.nodeId.startsWith('creative-slot-')
      )
      .map((wire) => ({
        source: { nodeId: wire.source.nodeId, portIndex: wire.source.portIndex },
        target: { nodeId: wire.target.nodeId, portIndex: wire.target.portIndex },
      }));

    // Create puzzle
    const puzzle: CustomPuzzle = {
      id: `custom-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      createdAt: Date.now(),
      slots,
      targetSamples,
      initialNodes,
      initialWires,
    };

    addCustomPuzzle(puzzle);
    cancelAuthoring();
    closeOverlay();
  }, [
    title,
    description,
    activeBoard,
    trimBufferSnapshot,
    startWTS,
    endWTS,
    creativeSlots,
    outputSlots,
    addCustomPuzzle,
    cancelAuthoring,
    closeOverlay,
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleCancel, handleSave]);

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <h2 className={styles.title}>Save Puzzle</h2>
        </div>

        <div className={styles.content}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="puzzle-title">Title</label>
            <input
              ref={titleInputRef}
              id="puzzle-title"
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              placeholder="My Puzzle"
              maxLength={50}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="puzzle-description">Description (optional)</label>
            <textarea
              id="puzzle-description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this puzzle does..."
              rows={3}
              maxLength={200}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.summary}>
            <h3 className={styles.summaryTitle}>Puzzle Configuration</h3>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Inputs:</span>
                <span className={styles.summaryValue}>
                  {inputSlots.length > 0
                    ? inputSlots.map(({ index }) => {
                        const { side, index: meterIndex } = slotToMeterInfo(index);
                        return `${side === 'left' ? 'L' : 'R'}${meterIndex + 1}`;
                      }).join(', ')
                    : 'None'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Outputs:</span>
                <span className={styles.summaryValue}>
                  {outputSlots.length > 0
                    ? outputSlots.map(({ index }) => {
                        const { side, index: meterIndex } = slotToMeterInfo(index);
                        return `${side === 'left' ? 'L' : 'R'}${meterIndex + 1}`;
                      }).join(', ')
                    : 'None'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Loop duration:</span>
                <span className={styles.summaryValue}>{durationWTS} WTS ({durationWTS}s)</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={handleCancel}>Cancel</button>
          <button className={styles.saveButton} onClick={handleSave}>Save Puzzle</button>
        </div>
      </div>
    </div>
  );
}
