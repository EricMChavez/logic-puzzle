import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/index.ts';
import { slotToMeterInfo } from '../../store/slices/creative-slice.ts';
import styles from './TrimDialog.module.css';

/** Samples per WTS (16 subdivisions) */
const SAMPLES_PER_WTS = 16;

export function TrimDialog() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'trim-dialog') return null;
  return <TrimDialogInner />;
}

function TrimDialogInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const cancelAuthoring = useGameStore((s) => s.cancelAuthoring);
  const proceedToSave = useGameStore((s) => s.proceedToSave);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const trimBufferSnapshot = useGameStore((s) => s.trimBufferSnapshot);
  const trimConfig = useGameStore((s) => s.trimConfig);
  const setTrimBounds = useGameStore((s) => s.setTrimBounds);
  const creativeSlots = useGameStore((s) => s.creativeSlots);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);
  const canvasHeight = 200;

  // Find output slots with data
  const outputSlots = creativeSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.direction === 'output');

  // Get the first output buffer to determine total duration
  const firstOutputSlotIndex = outputSlots[0]?.index ?? 3;
  const firstBuffer = trimBufferSnapshot?.get(firstOutputSlotIndex) ?? [];
  const totalSamples = firstBuffer.length;
  const totalWTS = Math.floor(totalSamples / SAMPLES_PER_WTS);

  const { startWTS, endWTS } = trimConfig;
  const durationWTS = endWTS - startWTS;

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trimBufferSnapshot) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;
    for (let wts = 0; wts <= totalWTS; wts++) {
      const x = (wts / totalWTS) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw center line
    ctx.strokeStyle = '#3a3a5e';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Draw waveforms for each output slot
    const colors = ['#F5AF28', '#1ED2C3', '#E03838'];
    let colorIndex = 0;

    for (const { index: slotIndex } of outputSlots) {
      const buffer = trimBufferSnapshot.get(slotIndex);
      if (!buffer || buffer.length === 0) continue;

      ctx.strokeStyle = colors[colorIndex % colors.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < buffer.length; i++) {
        const x = (i / buffer.length) * width;
        const normalizedValue = buffer[i] / 100; // -1 to 1
        const y = midY - normalizedValue * (height / 2 - 10);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      colorIndex++;
    }

    // Draw selection region
    const startX = (startWTS / totalWTS) * width;
    const endX = (endWTS / totalWTS) * width;

    // Dim areas outside selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Draw selection handles
    ctx.fillStyle = '#F5AF28';
    ctx.fillRect(startX - 3, 0, 6, height);
    ctx.fillRect(endX - 3, 0, 6, height);

    // Draw selection border
    ctx.strokeStyle = '#F5AF28';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, 0, endX - startX, height);
  }, [trimBufferSnapshot, startWTS, endWTS, totalWTS, outputSlots, canvasWidth, canvasHeight]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const wts = (x / rect.width) * totalWTS;

    const startX = (startWTS / totalWTS) * rect.width;
    const endX = (endWTS / totalWTS) * rect.width;

    // Check if clicking on handles (within 10px)
    if (Math.abs(x - startX) < 10) {
      setIsDragging('start');
    } else if (Math.abs(x - endX) < 10) {
      setIsDragging('end');
    }
  }, [startWTS, endWTS, totalWTS]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const wts = Math.max(0, Math.min(totalWTS, Math.round((x / rect.width) * totalWTS)));

    if (isDragging === 'start') {
      if (wts < endWTS - 1) {
        setTrimBounds(wts, endWTS);
      }
    } else if (isDragging === 'end') {
      if (wts > startWTS + 1) {
        setTrimBounds(startWTS, wts);
      }
    }
  }, [isDragging, startWTS, endWTS, totalWTS, setTrimBounds]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  const handleCancel = useCallback(() => {
    cancelAuthoring();
    closeOverlay();
  }, [cancelAuthoring, closeOverlay]);

  const handleContinue = useCallback(() => {
    proceedToSave();
    openOverlay({ type: 'save-puzzle-dialog' });
  }, [proceedToSave, openOverlay]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleCancel]);

  if (outputSlots.length === 0) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.panel} onKeyDown={handleKeyDown} tabIndex={-1}>
          <div className={styles.header}>
            <h2 className={styles.title}>No Output Data</h2>
          </div>
          <div className={styles.content}>
            <p className={styles.emptyMessage}>
              No output slots configured. Set at least one connection point to "Output" mode before saving as a puzzle.
            </p>
          </div>
          <div className={styles.footer}>
            <button className={styles.cancelButton} onClick={handleCancel}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} onKeyDown={handleKeyDown} tabIndex={-1}>
        <div className={styles.header}>
          <h2 className={styles.title}>Trim Output Recording</h2>
          <p className={styles.subtitle}>Drag the handles to select the loop region for your puzzle</p>
        </div>

        <div className={styles.content}>
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className={styles.waveformCanvas}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />

          <div className={styles.info}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Total recorded:</span>
              <span className={styles.infoValue}>{totalWTS} WTS ({(totalWTS).toFixed(1)}s)</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Selection:</span>
              <span className={styles.infoValue}>{durationWTS} WTS ({startWTS} - {endWTS})</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Active outputs:</span>
              <span className={styles.infoValue}>
                {outputSlots.map(({ index }) => {
                  const { side, index: meterIndex } = slotToMeterInfo(index);
                  return `${side === 'left' ? 'L' : 'R'}${meterIndex + 1}`;
                }).join(', ')}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={handleCancel}>Cancel</button>
          <button className={styles.continueButton} onClick={handleContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}
