import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/index.ts';
import type { WaveformShape, WaveformDef } from '../../puzzle/types.ts';
import { creativeSlotId } from '../../puzzle/connection-point-nodes.ts';
import { slotSide, slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';
import { CUSTOM_WAVEFORMS } from '../../puzzle/custom-waveforms.ts';
import { extractOutputSamples, formatCustomWaveformEntry } from '../../puzzle/export-waveform.ts';
import styles from './WaveformSelectorOverlay.module.css';

type WizardStep = 'direction' | 'shape' | 'frequency' | 'amplitude';
type BaseShape = 'sine' | 'triangle' | 'square' | 'sawtooth';
type Frequency = 'full' | 'half' | 'third' | 'quarter' | 'fifth' | 'sixth';

const SHAPES: Array<{ base: BaseShape; label: string }> = [
  { base: 'sine', label: 'Sine' },
  { base: 'triangle', label: 'Triangle' },
  { base: 'square', label: 'Square' },
  { base: 'sawtooth', label: 'Sawtooth' },
];

const FREQUENCIES: Array<{ freq: Frequency; label: string; cycles: string }> = [
  { freq: 'full', label: 'Full', cycles: '1 cycle' },
  { freq: 'half', label: 'Half', cycles: '2 cycles' },
  { freq: 'third', label: 'Third', cycles: '3 cycles' },
  { freq: 'quarter', label: 'Quarter', cycles: '4 cycles' },
  { freq: 'fifth', label: 'Fifth', cycles: '5 cycles' },
  { freq: 'sixth', label: 'Sixth', cycles: '6 cycles' },
];

const AMPLITUDES: Array<{ value: number; label: string }> = [
  { value: 100, label: '100%' },
  { value: 75, label: '75%' },
  { value: 50, label: '50%' },
  { value: 25, label: '25%' },
];

const PERIOD_MAP: Record<Frequency, number> = { full: 256, half: 128, third: 256 / 3, quarter: 64, fifth: 256 / 5, sixth: 256 / 6 };

/** Mini SVG preview of a waveform shape */
function WaveformIcon({ shape, amplitude = 1 }: { shape: BaseShape | 'output' | 'off' | 'custom'; amplitude?: number }) {
  const width = 28;
  const height = 16;
  const mid = height / 2;
  const amp = 6 * amplitude;

  if (shape === 'off') {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M${width / 2 - 5},${mid - 5} L${width / 2 + 5},${mid + 5} M${width / 2 + 5},${mid - 5} L${width / 2 - 5},${mid + 5}`}
          fill="none" stroke="#666680" strokeWidth="2" strokeLinecap="round"
        />
      </svg>
    );
  }

  if (shape === 'output') {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M4,${mid} H${width - 8} L${width - 12},${mid - 4} M${width - 8},${mid} L${width - 12},${mid + 4}`}
          fill="none" stroke="#9090b0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === 'custom') {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={`M2,${mid + 4} L8,${mid - 4} L14,${mid + 2} L20,${mid - 6} L26,${mid}`}
          fill="none" stroke="#F5AF28" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    );
  }

  const base = shape;
  const cycles = 1;
  const usable = width - 4;
  const x0 = 2;

  let path = '';
  if (base === 'sine') {
    const parts: string[] = [`M${x0},${mid}`];
    const segW = usable / (cycles * 2);
    for (let i = 0; i < cycles * 2; i++) {
      const sx = x0 + i * segW;
      const ex = sx + segW;
      const dir = i % 2 === 0 ? -1 : 1;
      const cp = mid + dir * amp * 1.5;
      parts.push(`Q${(sx + ex) / 2},${cp} ${ex},${mid}`);
    }
    path = parts.join(' ');
  } else if (base === 'square') {
    const segW = usable / cycles;
    const parts: string[] = [`M${x0},${mid - amp}`];
    for (let i = 0; i < cycles; i++) {
      const sx = x0 + i * segW;
      parts.push(`H${sx + segW / 2} V${mid + amp} H${sx + segW} V${mid - amp}`);
    }
    path = parts.join(' ');
  } else if (base === 'triangle') {
    const segW = usable / cycles;
    const parts: string[] = [`M${x0},${mid + amp}`];
    for (let i = 0; i < cycles; i++) {
      const sx = x0 + i * segW;
      parts.push(`L${sx + segW / 2},${mid - amp} L${sx + segW},${mid + amp}`);
    }
    path = parts.join(' ');
  } else if (base === 'sawtooth') {
    const segW = usable / cycles;
    const parts: string[] = [`M${x0},${mid + amp}`];
    for (let i = 0; i < cycles; i++) {
      const sx = x0 + i * segW;
      parts.push(`L${sx + segW},${mid - amp}`);
      if (i < cycles - 1) parts.push(`L${sx + segW},${mid + amp}`);
    }
    path = parts.join(' ');
  } else {
    path = `M${x0},${mid} H${width - 2}`;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke="#F5AF28" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Frequency icon: same base shape but different visual density */
function FrequencyIcon({ base, freq }: { base: BaseShape; freq: Frequency }) {
  const width = 28;
  const height = 16;
  const mid = height / 2;
  const amp = 6;
  const cycleMap: Record<Frequency, number> = { full: 0.5, half: 1, third: 1.5, quarter: 2, fifth: 2.5, sixth: 3 };
  const cycles = cycleMap[freq];
  const usable = width - 4;
  const x0 = 2;

  let path = '';
  if (base === 'sine') {
    const parts: string[] = [`M${x0},${mid}`];
    const segW = usable / (cycles * 2);
    for (let i = 0; i < cycles * 2; i++) {
      const sx = x0 + i * segW;
      const ex = sx + segW;
      const dir = i % 2 === 0 ? -1 : 1;
      const cp = mid + dir * amp * 1.5;
      parts.push(`Q${(sx + ex) / 2},${cp} ${ex},${mid}`);
    }
    path = parts.join(' ');
  } else if (base === 'square') {
    const segW = usable / cycles;
    const parts: string[] = [`M${x0},${mid - amp}`];
    for (let i = 0; i < cycles; i++) {
      const sx = x0 + i * segW;
      parts.push(`H${sx + segW / 2} V${mid + amp} H${sx + segW} V${mid - amp}`);
    }
    path = parts.join(' ');
  } else if (base === 'triangle') {
    const segW = usable / cycles;
    const parts: string[] = [`M${x0},${mid + amp}`];
    for (let i = 0; i < cycles; i++) {
      const sx = x0 + i * segW;
      parts.push(`L${sx + segW / 2},${mid - amp} L${sx + segW},${mid + amp}`);
    }
    path = parts.join(' ');
  } else if (base === 'sawtooth') {
    const segW = usable / cycles;
    const parts: string[] = [`M${x0},${mid + amp}`];
    for (let i = 0; i < cycles; i++) {
      const sx = x0 + i * segW;
      parts.push(`L${sx + segW},${mid - amp}`);
      if (i < cycles - 1) parts.push(`L${sx + segW},${mid + amp}`);
    }
    path = parts.join(' ');
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke="#F5AF28" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Amplitude icon: same base shape at different amplitudes */
function AmplitudeIcon({ base, freq, amplitudePercent }: { base: BaseShape; freq: Frequency; amplitudePercent: number }) {
  return <FrequencyIcon base={base} freq={freq} />;
  // The FrequencyIcon already gives a good visual; amplitude differences are subtle at icon size.
  // We show the percentage label instead to communicate the difference.
  void amplitudePercent;
}

function StepIndicator({ currentStep }: { currentStep: 'shape' | 'frequency' | 'amplitude' }) {
  const steps = ['shape', 'frequency', 'amplitude'] as const;
  const currentIdx = steps.indexOf(currentStep);

  return (
    <div className={styles.stepIndicator}>
      {steps.map((step, i) => (
        <div
          key={step}
          className={`${styles.stepDot} ${i === currentIdx ? styles.active : ''} ${i < currentIdx ? styles.completed : ''}`}
        />
      ))}
    </div>
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
  const setCreativeSlotWaveform = useGameStore((s) => s.setCreativeSlotWaveform);
  const activeBoard = useGameStore((s) => s.activeBoard);
  const updateWires = useGameStore((s) => s.updateWires);
  const updateCreativeSlotNode = useGameStore((s) => s.updateCreativeSlotNode);
  const addCreativeSlotNode = useGameStore((s) => s.addCreativeSlotNode);
  const setMeterMode = useGameStore((s) => s.setMeterMode);
  const isCreativeMode = useGameStore((s) => s.isCreativeMode);

  const [step, setStep] = useState<WizardStep>('direction');
  const [selectedShape, setSelectedShape] = useState<BaseShape>('sine');
  const [selectedFrequency, setSelectedFrequency] = useState<Frequency>('full');
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // In puzzle mode, close immediately
  useEffect(() => {
    if (!isCreativeMode) {
      closeOverlay();
    }
  }, [isCreativeMode, closeOverlay]);

  const slot = creativeSlots[slotIndex];
  const currentDirection = slot?.direction ?? 'output';
  const side = slotSide(slotIndex);
  const perSideIdx = slotPerSideIndex(slotIndex);

  // Helper: delete wires connected to this slot's CP node
  const deleteSlotWires = useCallback(() => {
    if (!activeBoard) return;
    const chipId = creativeSlotId(slotIndex);
    const filteredWires = activeBoard.paths.filter(
      (w) => w.source.chipId !== chipId && w.target.chipId !== chipId,
    );
    if (filteredWires.length !== activeBoard.paths.length) {
      updateWires(filteredWires);
    }
  }, [activeBoard, slotIndex, updateWires]);

  // Helper: ensure slot is in 'input' direction (handles transitions from off/output)
  const ensureInputDirection = useCallback(() => {
    if (currentDirection === 'off') {
      addCreativeSlotNode(slotIndex, 'input');
      setCreativeSlotDirection(slotIndex, 'input');
      setMeterMode(slotIndex, 'input');
    } else if (currentDirection === 'output') {
      deleteSlotWires();
      updateCreativeSlotNode(slotIndex, 'input');
      setCreativeSlotDirection(slotIndex, 'input');
      setMeterMode(slotIndex, 'input');
    }
  }, [currentDirection, slotIndex, addCreativeSlotNode, setCreativeSlotDirection, setMeterMode, deleteSlotWires, updateCreativeSlotNode]);

  const handleSelectOff = useCallback(() => {
    if (currentDirection === 'off') {
      closeOverlay();
      return;
    }
    deleteSlotWires();
    const changed = setCreativeSlotDirection(slotIndex, 'off');
    if (changed) {
      updateCreativeSlotNode(slotIndex, 'off');
      setMeterMode(slotIndex, 'off');
    }
    closeOverlay();
  }, [slotIndex, currentDirection, deleteSlotWires, setCreativeSlotDirection, updateCreativeSlotNode, setMeterMode, closeOverlay]);

  const handleSelectOutput = useCallback(() => {
    if (currentDirection === 'output') {
      closeOverlay();
      return;
    }
    if (currentDirection !== 'off') {
      deleteSlotWires();
    }
    if (currentDirection === 'off') {
      addCreativeSlotNode(slotIndex, 'output');
    } else {
      updateCreativeSlotNode(slotIndex, 'output');
    }
    setMeterMode(slotIndex, 'output');
    setCreativeSlotDirection(slotIndex, 'output');
    closeOverlay();
  }, [slotIndex, currentDirection, deleteSlotWires, setCreativeSlotDirection, updateCreativeSlotNode, addCreativeSlotNode, setMeterMode, closeOverlay]);

  const handleSelectInput = useCallback(() => {
    setStep('shape');
  }, []);

  const handleSelectShape = useCallback((base: BaseShape) => {
    setSelectedShape(base);
    setStep('frequency');
  }, []);

  const handleSelectCustomWaveform = useCallback((samples: number[]) => {
    ensureInputDirection();
    const waveform: WaveformDef = {
      shape: 'samples',
      amplitude: 100,
      period: samples.length,
      phase: 0,
      offset: 0,
      samples,
    };
    setCreativeSlotWaveform(slotIndex, waveform);
    closeOverlay();
  }, [slotIndex, ensureInputDirection, setCreativeSlotWaveform, closeOverlay]);

  const handleSelectFrequency = useCallback((freq: Frequency) => {
    setSelectedFrequency(freq);
    setStep('amplitude');
  }, []);

  const handleSelectAmplitude = useCallback((amplitudePercent: number) => {
    ensureInputDirection();
    const shape: WaveformShape = `${selectedShape}-${selectedFrequency}` as WaveformShape;
    const waveform: WaveformDef = {
      shape,
      amplitude: amplitudePercent,
      period: PERIOD_MAP[selectedFrequency],
      phase: 0,
      offset: 0,
    };
    setCreativeSlotWaveform(slotIndex, waveform);
    closeOverlay();
  }, [slotIndex, selectedShape, selectedFrequency, ensureInputDirection, setCreativeSlotWaveform, closeOverlay]);

  const handleExport = useCallback(async () => {
    const cycleResults = useGameStore.getState().cycleResults;
    if (!cycleResults) return;
    const portIndex = slotIndex; // output index matches slot index in creative mode
    const samples = extractOutputSamples(cycleResults, portIndex);
    const slotLabel = `${side === 'left' ? 'Left' : 'Right'} ${perSideIdx + 1}`;
    const source = formatCustomWaveformEntry('Output ' + slotLabel, samples);
    await navigator.clipboard.writeText(source);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
  }, [slotIndex, side, perSideIdx]);

  const handleBack = useCallback(() => {
    if (step === 'shape') setStep('direction');
    else if (step === 'frequency') setStep('shape');
    else if (step === 'amplitude') setStep('frequency');
  }, [step]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (step === 'direction') {
        closeOverlay();
      } else {
        handleBack();
      }
    }
  }, [step, closeOverlay, handleBack]);

  // Focus on mount and step change
  useEffect(() => {
    listRef.current?.focus();
  }, [step]);

  const slotLabel = `${side === 'left' ? 'Left' : 'Right'} ${perSideIdx + 1}`;

  const stepTitle: Record<WizardStep, string> = {
    direction: 'Configure Connection Point',
    shape: 'Choose Shape',
    frequency: 'Choose Frequency',
    amplitude: 'Choose Amplitude',
  };

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
          <div className={styles.headerRow}>
            {step !== 'direction' && (
              <button className={styles.backButton} onClick={handleBack} aria-label="Back">
                &#8592;
              </button>
            )}
            <div>
              <h3 className={styles.title}>{stepTitle[step]}</h3>
              <div className={styles.subtitle}>{slotLabel}</div>
            </div>
          </div>
          {step !== 'direction' && <StepIndicator currentStep={step} />}
        </div>

        <div className={styles.list} ref={listRef} tabIndex={-1}>
          {step === 'direction' && (
            <>
              {/* Off (hidden) */}
              <button
                className={`${styles.item} ${styles.offItem} ${currentDirection === 'off' ? styles.active : ''}`}
                onClick={handleSelectOff}
              >
                <div className={styles.waveformIcon}><WaveformIcon shape="off" /></div>
                <span className={styles.waveformLabel}>Off (hidden)</span>
              </button>

              <div className={styles.divider} />

              {/* Output */}
              <button
                className={`${styles.item} ${currentDirection === 'output' ? styles.active : ''}`}
                onClick={handleSelectOutput}
              >
                <div className={styles.waveformIcon}><WaveformIcon shape="output" /></div>
                <span className={styles.waveformLabel}>Output (receives signal)</span>
              </button>
              {currentDirection === 'output' && (
                <button
                  className={styles.exportButton}
                  onClick={handleExport}
                >
                  {copiedFeedback ? (
                    <span className={styles.copiedFeedback}>Copied!</span>
                  ) : (
                    'Export Waveform'
                  )}
                </button>
              )}

              <div className={styles.divider} />

              {/* Input (go to shape step) */}
              <button
                className={`${styles.item} ${currentDirection === 'input' ? styles.active : ''}`}
                onClick={handleSelectInput}
              >
                <div className={styles.waveformIcon}><WaveformIcon shape="sine" /></div>
                <span className={styles.waveformLabel}>Input (emits signal) &#8594;</span>
              </button>
            </>
          )}

          {step === 'shape' && (
            <>
              {SHAPES.map((s) => (
                <button
                  key={s.base}
                  className={styles.item}
                  onClick={() => handleSelectShape(s.base)}
                >
                  <div className={styles.waveformIcon}><WaveformIcon shape={s.base} /></div>
                  <span className={styles.waveformLabel}>{s.label}</span>
                </button>
              ))}

              {/* Custom waveforms section */}
              <div className={styles.divider} />
              <div className={styles.sectionHeader}>Custom Waveforms</div>
              {CUSTOM_WAVEFORMS.length === 0 ? (
                <div className={styles.emptyMessage}>
                  No custom waveforms defined. Export an output waveform and paste it into custom-waveforms.ts.
                </div>
              ) : (
                CUSTOM_WAVEFORMS.map((cw) => (
                  <button
                    key={cw.id}
                    className={styles.item}
                    onClick={() => handleSelectCustomWaveform(cw.samples)}
                  >
                    <div className={styles.waveformIcon}><WaveformIcon shape="custom" /></div>
                    <span className={styles.waveformLabel}>{cw.name}</span>
                  </button>
                ))
              )}
            </>
          )}

          {step === 'frequency' && (
            <>
              {FREQUENCIES.map((f) => (
                <button
                  key={f.freq}
                  className={styles.item}
                  onClick={() => handleSelectFrequency(f.freq)}
                >
                  <div className={styles.waveformIcon}>
                    <FrequencyIcon base={selectedShape} freq={f.freq} />
                  </div>
                  <span className={styles.waveformLabel}>{f.label} ({f.cycles})</span>
                </button>
              ))}
            </>
          )}

          {step === 'amplitude' && (
            <>
              {AMPLITUDES.map((a) => (
                <button
                  key={a.value}
                  className={styles.item}
                  onClick={() => handleSelectAmplitude(a.value)}
                >
                  <div className={styles.waveformIcon}>
                    <AmplitudeIcon base={selectedShape} freq={selectedFrequency} amplitudePercent={a.value} />
                  </div>
                  <span className={styles.waveformLabel}>{a.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
