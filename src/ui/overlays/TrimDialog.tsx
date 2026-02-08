import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/index.ts';
import { slotToMeterInfo } from '../../store/slices/creative-slice.ts';
import { TRIM_WINDOW_WTS } from '../../store/slices/authoring-slice.ts';
import styles from './TrimDialog.module.css';

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
  const totalWTS = useGameStore((s) => s.trimTotalWTS);
  const slideTrimWindow = useGameStore((s) => s.slideTrimWindow);
  const creativeSlots = useGameStore((s) => s.creativeSlots);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWTSRef = useRef(0);
  const canvasWidth = 600;
  const canvasHeight = 200;

  // Find output slots with data
  const outputSlots = creativeSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.direction === 'output');

  // Determine graph direction: right-side outputs → reversed (newest on left)
  const reversed = outputSlots.length > 0 && slotToMeterInfo(outputSlots[0].index).side === 'right';

  const { startWTS, endWTS } = trimConfig;
  const notEnoughData = totalWTS < TRIM_WINDOW_WTS;

  /** Map a WTS position to an x coordinate, respecting reversal */
  const wtsToX = useCallback((wts: number, width: number): number => {
    if (totalWTS === 0) return 0;
    const fraction = wts / totalWTS;
    return reversed ? width - fraction * width : fraction * width;
  }, [totalWTS, reversed]);

  /** Map an x coordinate to a WTS position, respecting reversal */
  const xToWts = useCallback((x: number, width: number): number => {
    if (totalWTS === 0) return 0;
    const fraction = x / width;
    return reversed ? (1 - fraction) * totalWTS : fraction * totalWTS;
  }, [totalWTS, reversed]);

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
      const x = wtsToX(wts, width);
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
        const x = reversed
          ? width - (i / buffer.length) * width
          : (i / buffer.length) * width;
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

    if (notEnoughData) return; // Don't draw selection if not enough data

    // Draw selection region
    const selStartX = wtsToX(startWTS, width);
    const selEndX = wtsToX(endWTS, width);
    const leftX = Math.min(selStartX, selEndX);
    const rightX = Math.max(selStartX, selEndX);

    // Dim areas outside selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, leftX, height);
    ctx.fillRect(rightX, 0, width - rightX, height);

    // Draw selection border and fill
    ctx.strokeStyle = '#F5AF28';
    ctx.lineWidth = 2;
    ctx.strokeRect(leftX, 0, rightX - leftX, height);
    ctx.fillStyle = 'rgba(245, 175, 40, 0.08)';
    ctx.fillRect(leftX, 0, rightX - leftX, height);
  }, [trimBufferSnapshot, startWTS, endWTS, totalWTS, outputSlots, canvasWidth, canvasHeight, reversed, wtsToX, notEnoughData]);

  // Store latest values in refs so document-level listeners always see current state
  const startWTSRef = useRef(startWTS);
  const endWTSRef = useRef(endWTS);
  const totalWTSRef = useRef(totalWTS);
  const reversedRef = useRef(reversed);
  startWTSRef.current = startWTS;
  endWTSRef.current = endWTS;
  totalWTSRef.current = totalWTS;
  reversedRef.current = reversed;

  // Document-level mousemove/mouseup for drag (fires even when cursor leaves canvas)
  useEffect(() => {
    function onDocMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const deltaX = x - dragStartXRef.current;
      const wtsPerPixel = totalWTSRef.current / rect.width;
      const deltaWTS = reversedRef.current ? -deltaX * wtsPerPixel : deltaX * wtsPerPixel;
      slideTrimWindow(dragStartWTSRef.current + deltaWTS);
      canvas.style.cursor = 'grabbing';
    }

    function onDocMouseUp() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'default';
    }

    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup', onDocMouseUp);
    return () => {
      document.removeEventListener('mousemove', onDocMouseMove);
      document.removeEventListener('mouseup', onDocMouseUp);
    };
  }, [slideTrimWindow]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (notEnoughData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickWTS = xToWts(x, rect.width);

    // Check if click is within selection band
    const withinSelection = clickWTS >= startWTS && clickWTS <= endWTS;

    if (withinSelection) {
      // Start dragging — document-level listeners handle move/up
      e.preventDefault();
      isDraggingRef.current = true;
      dragStartXRef.current = x;
      dragStartWTSRef.current = startWTS;
    } else {
      // Snap window center to click position
      const newStart = clickWTS - TRIM_WINDOW_WTS / 2;
      slideTrimWindow(newStart);
    }
  }, [startWTS, endWTS, xToWts, slideTrimWindow, notEnoughData]);

  // Canvas hover cursor (non-drag)
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) return; // Document listener handles drag cursor
    const canvas = canvasRef.current;
    if (!canvas || notEnoughData) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const hoverWTS = xToWts(x, rect.width);
    const withinSelection = hoverWTS >= startWTS && hoverWTS <= endWTS;
    canvas.style.cursor = withinSelection ? 'grab' : 'default';
  }, [startWTS, endWTS, xToWts, notEnoughData]);

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
      return;
    }
    if (notEnoughData) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      slideTrimWindow(startWTS - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      slideTrimWindow(startWTS + 1);
    }
  }, [handleCancel, slideTrimWindow, startWTS, notEnoughData]);

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
          <p className={styles.subtitle}>
            {notEnoughData
              ? `Not enough data recorded. Need at least ${TRIM_WINDOW_WTS} WTS (only ${totalWTS} available).`
              : 'Slide the window to select the 16 WTS loop region'}
          </p>
        </div>

        <div className={styles.content}>
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className={styles.waveformCanvas}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
          />

          <div className={styles.info}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Total recorded:</span>
              <span className={styles.infoValue}>{totalWTS} WTS ({(totalWTS).toFixed(1)}s)</span>
            </div>
            {!notEnoughData && (
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Window:</span>
                <span className={styles.infoValue}>WTS {startWTS}–{endWTS} ({TRIM_WINDOW_WTS} WTS)</span>
              </div>
            )}
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
          <button
            className={styles.continueButton}
            onClick={handleContinue}
            disabled={notEnoughData}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
