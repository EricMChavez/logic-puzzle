import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/index.ts';
import { getNodePixelRect } from '../../gameboard/canvas/render-nodes.ts';
import { computePopoverPosition } from './popover-position.ts';
import { getCellSize } from '../../shared/grid/index.ts';
import { getChipDefinition } from '../../engine/nodes/registry.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import type { ParamDefinition, ParamValue } from '../../engine/nodes/framework.ts';
import { playKnobTic } from '../../shared/audio/index.ts';
import styles from './ParameterPopover.module.css';

const KNOB_VALUES = [-100, -75, -50, -25, 0, 25, 50, 75, 100] as const;

export function ParameterPopover() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'parameter-popover') return null;
  return <ParameterPopoverInner chipId={overlay.chipId} />;
}

function ParameterPopoverInner({ chipId }: { chipId: string }) {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const updateChipParams = useGameStore((s) => s.updateChipParams);
  const setPortConstant = useGameStore((s) => s.setPortConstant);
  const node = useGameStore((s) => s.activeBoard?.chips.get(chipId));
  const popoverRef = useRef<HTMLDivElement>(null);

  // Focus on mount
  useEffect(() => {
    popoverRef.current?.focus();
  }, []);

  if (!node) {
    closeOverlay();
    return null;
  }

  // Compute position relative to node
  const cellSize = getCellSize();
  const rect = getNodePixelRect(node, cellSize);

  // Get canvas offset relative to the game container
  // With will-change:transform on the container, position:fixed is relative to it
  const canvas = document.querySelector('canvas');
  const canvasRect = canvas?.getBoundingClientRect();
  const container = document.querySelector<HTMLElement>('[data-game-container]');
  const containerRect = container?.getBoundingClientRect();
  const canvasOffset = canvasRect && containerRect
    ? { x: canvasRect.left - containerRect.left, y: canvasRect.top - containerRect.top }
    : canvasRect
      ? { x: canvasRect.left, y: canvasRect.top }
      : { x: 0, y: 0 };

  const popoverSize = { width: 220, height: 100 };
  const viewport = {
    width: containerRect?.width ?? window.innerWidth,
    height: containerRect?.height ?? window.innerHeight,
  };

  const pos = computePopoverPosition(
    { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    popoverSize,
    viewport,
    canvasOffset,
  );

  const def = getChipDefinition(node.type);
  const knobConfig = def ? getKnobConfig(def) : null;
  const paramDefs = def?.params ?? [];

  // Legacy v1 nodes without registered definitions
  const isLegacyMix = node.type === 'mix';
  const isLegacyThreshold = node.type === 'threshold';

  return (
    <>
      <div className={styles.backdrop} onClick={closeOverlay} />
      <div
        ref={popoverRef}
        className={styles.popover}
        style={{ left: pos.left, top: pos.top }}
        tabIndex={-1}
        role="dialog"
        aria-label="Chip Parameters"
      >
        <div className={styles.title}>Parameters</div>
        {isLegacyMix && (
          <LegacyMixControls node={node} updateChipParams={updateChipParams} />
        )}
        {isLegacyThreshold && (
          <LegacyThresholdControls node={node} updateChipParams={updateChipParams} />
        )}
        {paramDefs.map((paramDef) => {
          const isKnobParam = knobConfig?.paramKey === paramDef.key;
          if (isKnobParam) {
            return (
              <KnobParamControl
                key={paramDef.key}
                node={node}
                paramDef={paramDef}
                knobPortIndex={knobConfig!.portIndex}
                updateChipParams={updateChipParams}
                setPortConstant={setPortConstant}
              />
            );
          }
          return (
            <GenericParamControl
              key={paramDef.key}
              node={node}
              paramDef={paramDef}
              updateChipParams={updateChipParams}
            />
          );
        })}
      </div>
    </>
  );
}

// =============================================================================
// Generic controls
// =============================================================================

interface KnobParamControlProps {
  node: { id: string; params: Record<string, ParamValue | string[]> };
  paramDef: ParamDefinition;
  knobPortIndex: number;
  updateChipParams: (chipId: string, params: Record<string, ParamValue>) => void;
  setPortConstant: (chipId: string, portIndex: number, value: number) => void;
}

function KnobParamControl({ node, paramDef, knobPortIndex, updateChipParams, setPortConstant }: KnobParamControlProps) {
  const current = Number(node.params[paramDef.key] ?? 0);
  return (
    <div className={styles.field}>
      <label className={styles.label}>{paramDef.label} ({current})</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {KNOB_VALUES.map((v) => (
          <button
            key={v}
            className={styles.select}
            style={{
              padding: '2px 6px',
              minWidth: '36px',
              fontWeight: v === current ? 'bold' : 'normal',
              opacity: v === current ? 1 : 0.7,
            }}
            onClick={() => {
              updateChipParams(node.id, { [paramDef.key]: v });
              setPortConstant(node.id, knobPortIndex, v);
              playKnobTic();
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

interface GenericParamControlProps {
  node: { id: string; params: Record<string, ParamValue | string[]> };
  paramDef: ParamDefinition;
  updateChipParams: (chipId: string, params: Record<string, ParamValue>) => void;
}

function GenericParamControl({ node, paramDef, updateChipParams }: GenericParamControlProps) {
  if (paramDef.type === 'string' && paramDef.options) {
    const current = String(node.params[paramDef.key] ?? paramDef.default);
    return (
      <div className={styles.field}>
        <label className={styles.label}>{paramDef.label}</label>
        <select
          className={styles.select}
          value={current}
          onChange={(e) => updateChipParams(node.id, { [paramDef.key]: e.target.value })}
        >
          {paramDef.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (paramDef.type === 'number') {
    const current = Number(node.params[paramDef.key] ?? paramDef.default);
    return (
      <div className={styles.field}>
        <label className={styles.label}>{paramDef.label}</label>
        <div className={styles.rangeWrap}>
          <input
            type="range"
            className={styles.range}
            min={paramDef.min ?? -100}
            max={paramDef.max ?? 100}
            step={paramDef.step ?? 1}
            value={current}
            onChange={(e) => updateChipParams(node.id, { [paramDef.key]: Number(e.target.value) })}
          />
          <span className={styles.rangeValue}>{current}</span>
        </div>
      </div>
    );
  }

  if (paramDef.type === 'boolean') {
    const current = Boolean(node.params[paramDef.key] ?? paramDef.default);
    return (
      <div className={styles.field}>
        <label className={styles.label}>
          <input
            type="checkbox"
            checked={current}
            onChange={(e) => updateChipParams(node.id, { [paramDef.key]: e.target.checked })}
          />
          {' '}{paramDef.label}
        </label>
      </div>
    );
  }

  return null;
}

// =============================================================================
// Legacy v1 controls (no registered definition)
// =============================================================================

const MIX_MODES = ['Add', 'Subtract', 'Average', 'Min', 'Max'] as const;

interface LegacyControlProps {
  node: { id: string; params: Record<string, ParamValue | string[]> };
  updateChipParams: (chipId: string, params: Record<string, ParamValue>) => void;
}

function LegacyMixControls({ node, updateChipParams }: LegacyControlProps) {
  const current = String(node.params['mode'] ?? 'Add');
  return (
    <div className={styles.field}>
      <label className={styles.label}>Mix Mode</label>
      <select
        className={styles.select}
        value={current}
        onChange={(e) => updateChipParams(node.id, { mode: e.target.value })}
      >
        {MIX_MODES.map((mode) => (
          <option key={mode} value={mode}>{mode}</option>
        ))}
      </select>
    </div>
  );
}

function LegacyThresholdControls({ node, updateChipParams }: LegacyControlProps) {
  const current = Number(node.params['threshold'] ?? 0);
  return (
    <div className={styles.field}>
      <label className={styles.label}>Threshold</label>
      <div className={styles.rangeWrap}>
        <input
          type="range"
          className={styles.range}
          min={-100}
          max={100}
          value={current}
          onChange={(e) => updateChipParams(node.id, { threshold: Number(e.target.value) })}
        />
        <span className={styles.rangeValue}>{current}</span>
      </div>
    </div>
  );
}
