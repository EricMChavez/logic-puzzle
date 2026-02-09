import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/index.ts';
import type { WaveformShape } from '../../puzzle/types.ts';
import { slotToMeterInfo } from '../../store/slices/creative-slice.ts';
import { creativeSlotId } from '../../puzzle/connection-point-nodes.ts';
import { meterKey } from '../../gameboard/meters/meter-types.ts';
import styles from './WaveformSelectorOverlay.module.css';

/** Available waveform shapes with display labels */
const WAVEFORM_OPTIONS: Array<{ shape: WaveformShape; label: string }> = [
  { shape: 'sine', label: 'Sine' },
  { shape: 'square', label: 'Square' },
  { shape: 'triangle', label: 'Triangle' },
  { shape: 'sawtooth', label: 'Sawtooth' },
  { shape: 'dual-wave', label: 'Dual Wave' },
  { shape: 'long-wave', label: 'Long Wave' },
  { shape: 'positive-sine', label: 'Positive Sine' },
  { shape: 'overtone', label: 'Overtone' },
  { shape: 'rectified-sine', label: 'Rectified Sine' },
  { shape: 'rectified-triangle', label: 'Rectified Triangle' },
  { shape: 'clipped-sine', label: 'Clipped Sine' },
  { shape: 'fullwave-rectified-sine', label: 'Fullwave Sine' },
  { shape: 'fullwave-rectified-triangle', label: 'Fullwave Triangle' },
];

/** Mini SVG preview of a waveform shape */
function WaveformIcon({ shape }: { shape: WaveformShape | 'output' | 'off' }) {
  const width = 28;
  const height = 16;
  const mid = height / 2;
  const amp = 6;

  if (shape === 'off') {
    // Draw an X for hidden/off
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M${width / 2 - 5},${mid - 5} L${width / 2 + 5},${mid + 5} M${width / 2 + 5},${mid - 5} L${width / 2 - 5},${mid + 5}`}
          fill="none"
          stroke="#666680"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (shape === 'output') {
    // Draw an arrow pointing right for output
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M4,${mid} H${width - 8} L${width - 12},${mid - 4} M${width - 8},${mid} L${width - 12},${mid + 4}`}
          fill="none"
          stroke="#9090b0"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  let path = '';
  switch (shape) {
    case 'sine':
      path = `M2,${mid} Q${width / 4},${mid - amp} ${width / 2},${mid} Q${(3 * width) / 4},${mid + amp} ${width - 2},${mid}`;
      break;
    case 'square':
      path = `M2,${mid - amp} H${width / 2} V${mid + amp} H${width - 2}`;
      break;
    case 'triangle':
      path = `M2,${mid + amp} L${width / 2},${mid - amp} L${width - 2},${mid + amp}`;
      break;
    case 'sawtooth':
      path = `M2,${mid + amp} L${width / 2},${mid - amp} L${width / 2},${mid + amp} L${width - 2},${mid - amp}`;
      break;
    case 'dual-wave':
      // Triangle hump then flat negative
      path = `M2,${mid} L${width / 4},${mid - amp} L${width / 2},${mid} V${mid + amp} H${width - 2}`;
      break;
    case 'long-wave':
      // Gentle sine curve (quarter cycle visible)
      path = `M2,${mid} Q${width / 2},${mid - amp * 1.5} ${width - 2},${mid}`;
      break;
    case 'positive-sine':
      // Sine shifted up (all above center)
      path = `M2,${mid} Q${width / 4},${mid - amp * 2} ${width / 2},${mid} Q${(3 * width) / 4},${mid} ${width - 2},${mid}`;
      break;
    case 'overtone':
      // Fundamental + harmonic (wobbly sine)
      path = `M2,${mid} Q${width / 8},${mid - amp * 0.6} ${width / 4},${mid - amp} Q${(3 * width) / 8},${mid - amp * 0.4} ${width / 2},${mid} Q${(5 * width) / 8},${mid + amp * 0.4} ${(3 * width) / 4},${mid + amp} Q${(7 * width) / 8},${mid + amp * 0.6} ${width - 2},${mid}`;
      break;
    case 'rectified-sine':
      path = `M2,${mid} Q${width / 4},${mid - amp} ${width / 2},${mid} H${width - 2}`;
      break;
    case 'rectified-triangle':
      path = `M2,${mid} L${width / 4},${mid - amp} L${width / 2},${mid} H${width - 2}`;
      break;
    case 'clipped-sine':
      path = `M2,${mid} L5,${mid - amp} H${width / 2 - 3} L${width / 2},${mid} L${width / 2 + 3},${mid + amp} H${width - 5} L${width - 2},${mid}`;
      break;
    case 'fullwave-rectified-sine':
      path = `M2,${mid} Q${width / 4},${mid - amp} ${width / 2},${mid} Q${(3 * width) / 4},${mid - amp} ${width - 2},${mid}`;
      break;
    case 'fullwave-rectified-triangle':
      path = `M2,${mid} L${width / 4},${mid - amp} L${width / 2},${mid} L${(3 * width) / 4},${mid - amp} L${width - 2},${mid}`;
      break;
    default:
      path = `M2,${mid} H${width - 2}`;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={path}
        fill="none"
        stroke="#F5AF28"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WaveformSelectorOverlay() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'waveform-selector') return null;
  return <WaveformSelectorInner slotIndex={overlay.slotIndex} />;
}

function WaveformSelectorInner({ slotIndex }: { slotIndex: number }) {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const creativeSlots = useGameStore((s) => s.creativeSlots);
  const setCreativeSlotDirection = useGameStore((s) => s.setCreativeSlotDirection);
  const setCreativeSlotWaveformShape = useGameStore((s) => s.setCreativeSlotWaveformShape);
  const activeBoard = useGameStore((s) => s.activeBoard);
  const updateWires = useGameStore((s) => s.updateWires);
  const updateCreativeSlotNode = useGameStore((s) => s.updateCreativeSlotNode);
  const addCreativeSlotNode = useGameStore((s) => s.addCreativeSlotNode);
  const setMeterVisualState = useGameStore((s) => s.setMeterVisualState);
  const isCreativeMode = useGameStore((s) => s.isCreativeMode);

  // In puzzle mode, close immediately - waveform changes not allowed
  useEffect(() => {
    if (!isCreativeMode) {
      closeOverlay();
    }
  }, [isCreativeMode, closeOverlay]);

  const slot = creativeSlots[slotIndex];
  const currentDirection = slot?.direction ?? 'output';
  const currentShape = slot?.waveform?.shape ?? 'sine';
  const { side, index } = slotToMeterInfo(slotIndex);
  const listRef = useRef<HTMLDivElement>(null);

  const handleSelectOff = useCallback(() => {
    if (currentDirection === 'off') {
      closeOverlay();
      return;
    }

    // Delete connected wires first
    if (activeBoard) {
      const nodeId = creativeSlotId(slotIndex);
      const filteredWires = activeBoard.wires.filter(
        (w) => w.source.nodeId !== nodeId && w.target.nodeId !== nodeId
      );
      if (filteredWires.length !== activeBoard.wires.length) {
        updateWires(filteredWires);
      }
    }

    // Change direction to off (removes node)
    const changed = setCreativeSlotDirection(slotIndex, 'off');
    if (changed) {
      updateCreativeSlotNode(slotIndex, 'off');
      // Hide the meter
      setMeterVisualState(meterKey(side, index), 'hidden');
    }
    closeOverlay();
  }, [slotIndex, currentDirection, activeBoard, updateWires, setCreativeSlotDirection, updateCreativeSlotNode, setMeterVisualState, side, index, closeOverlay]);

  const handleSelectOutput = useCallback(() => {
    if (currentDirection === 'output') {
      closeOverlay();
      return;
    }

    // Delete connected wires first (if coming from input)
    if (activeBoard && currentDirection !== 'off') {
      const nodeId = creativeSlotId(slotIndex);
      const filteredWires = activeBoard.wires.filter(
        (w) => w.source.nodeId !== nodeId && w.target.nodeId !== nodeId
      );
      if (filteredWires.length !== activeBoard.wires.length) {
        updateWires(filteredWires);
      }
    }

    // If coming from 'off', need to add the node back and show meter
    if (currentDirection === 'off') {
      addCreativeSlotNode(slotIndex, 'output');
      setMeterVisualState(meterKey(side, index), 'active');
    } else {
      updateCreativeSlotNode(slotIndex, 'output');
    }

    setCreativeSlotDirection(slotIndex, 'output');
    closeOverlay();
  }, [slotIndex, currentDirection, activeBoard, updateWires, setCreativeSlotDirection, updateCreativeSlotNode, addCreativeSlotNode, setMeterVisualState, side, index, closeOverlay]);

  const handleSelectWaveform = useCallback((shape: WaveformShape) => {
    // If coming from 'off', need to add the node back and show meter
    if (currentDirection === 'off') {
      addCreativeSlotNode(slotIndex, 'input');
      setCreativeSlotDirection(slotIndex, 'input');
      setMeterVisualState(meterKey(side, index), 'active');
    } else if (currentDirection === 'output') {
      // Delete connected wires when switching from output to input
      if (activeBoard) {
        const nodeId = creativeSlotId(slotIndex);
        const filteredWires = activeBoard.wires.filter(
          (w) => w.source.nodeId !== nodeId && w.target.nodeId !== nodeId
        );
        if (filteredWires.length !== activeBoard.wires.length) {
          updateWires(filteredWires);
        }
      }
      updateCreativeSlotNode(slotIndex, 'input');
      setCreativeSlotDirection(slotIndex, 'input');
    }

    setCreativeSlotWaveformShape(slotIndex, shape);
    closeOverlay();
  }, [slotIndex, currentDirection, activeBoard, updateWires, setCreativeSlotDirection, setCreativeSlotWaveformShape, updateCreativeSlotNode, addCreativeSlotNode, setMeterVisualState, side, index, closeOverlay]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOverlay();
    }
  }, [closeOverlay]);

  // Focus the list on mount
  useEffect(() => {
    listRef.current?.focus();
  }, []);

  const slotLabel = `${side === 'left' ? 'Left' : 'Right'} ${index + 1}`;

  return (
    <div className={styles.backdrop} onClick={closeOverlay}>
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Waveform Selector"
      >
        <div className={styles.header}>
          <h3 className={styles.title}>Configure Connection Point</h3>
          <div className={styles.subtitle}>{slotLabel}</div>
        </div>
        <div className={styles.list} ref={listRef} tabIndex={-1}>
          {/* Off (hidden) option */}
          <button
            className={`${styles.item} ${styles.offItem} ${currentDirection === 'off' ? styles.active : ''}`}
            onClick={handleSelectOff}
          >
            <div className={styles.waveformIcon}>
              <WaveformIcon shape="off" />
            </div>
            <span className={styles.waveformLabel}>Off (hidden)</span>
          </button>

          <div className={styles.divider} />

          {/* Output option */}
          <button
            className={`${styles.item} ${currentDirection === 'output' ? styles.active : ''}`}
            onClick={handleSelectOutput}
          >
            <div className={styles.waveformIcon}>
              <WaveformIcon shape="output" />
            </div>
            <span className={styles.waveformLabel}>Output (receives signal)</span>
          </button>

          <div className={styles.divider} />

          {/* Input waveform options */}
          {WAVEFORM_OPTIONS.map((opt) => (
            <button
              key={opt.shape}
              className={`${styles.item} ${currentDirection === 'input' && currentShape === opt.shape ? styles.active : ''}`}
              onClick={() => handleSelectWaveform(opt.shape)}
            >
              <div className={styles.waveformIcon}>
                <WaveformIcon shape={opt.shape} />
              </div>
              <span className={styles.waveformLabel}>{opt.label} (emits signal)</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
