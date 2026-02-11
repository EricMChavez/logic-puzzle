import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/index.ts';
import { getNodePixelRect } from '../../gameboard/canvas/render-nodes.ts';
import { computePopoverPosition } from './popover-position.ts';
import { getCellSize } from '../../shared/grid/index.ts';
import styles from './ParameterPopover.module.css';

const MIX_MODES = ['Add', 'Subtract', 'Average', 'Min', 'Max'] as const;

export function ParameterPopover() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'parameter-popover') return null;
  return <ParameterPopoverInner nodeId={overlay.nodeId} />;
}

function ParameterPopoverInner({ nodeId }: { nodeId: string }) {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const updateNodeParams = useGameStore((s) => s.updateNodeParams);
  const node = useGameStore((s) => s.activeBoard?.nodes.get(nodeId));
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

  // Get canvas offset in viewport
  const canvas = document.querySelector('canvas');
  const canvasRect = canvas?.getBoundingClientRect();
  const canvasOffset = canvasRect
    ? { x: canvasRect.left, y: canvasRect.top }
    : { x: 0, y: 0 };

  const popoverSize = { width: 220, height: 100 };
  const viewport = { width: window.innerWidth, height: window.innerHeight };

  const pos = computePopoverPosition(
    { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    popoverSize,
    viewport,
    canvasOffset,
  );

  return (
    <>
      <div className={styles.backdrop} onClick={closeOverlay} />
      <div
        ref={popoverRef}
        className={styles.popover}
        style={{ left: pos.left, top: pos.top }}
        tabIndex={-1}
        role="dialog"
        aria-label="Node Parameters"
      >
        <div className={styles.title}>Parameters</div>
        {node.type === 'mix' && (
          <MixControls node={node} updateNodeParams={updateNodeParams} />
        )}
        {node.type === 'threshold' && (
          <ThresholdControls node={node} updateNodeParams={updateNodeParams} />
        )}
        {node.type === 'mixer' && (
          <MixerControls node={node} updateNodeParams={updateNodeParams} />
        )}
        {node.type === 'amp' && (
          <AmpControls node={node} updateNodeParams={updateNodeParams} />
        )}
        {node.type === 'diverter' && (
          <DiverterControls node={node} updateNodeParams={updateNodeParams} />
        )}
      </div>
    </>
  );
}

interface ControlProps {
  node: { id: string; params: Record<string, number | string | boolean> };
  updateNodeParams: (nodeId: string, params: Record<string, number | string | boolean>) => void;
}

function MixControls({ node, updateNodeParams }: ControlProps) {
  const current = String(node.params['mode'] ?? 'Add');
  return (
    <div className={styles.field}>
      <label className={styles.label}>Mix Mode</label>
      <select
        className={styles.select}
        value={current}
        onChange={(e) => updateNodeParams(node.id, { mode: e.target.value })}
      >
        {MIX_MODES.map((mode) => (
          <option key={mode} value={mode}>{mode}</option>
        ))}
      </select>
    </div>
  );
}

function ThresholdControls({ node, updateNodeParams }: ControlProps) {
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
          onChange={(e) => updateNodeParams(node.id, { threshold: Number(e.target.value) })}
        />
        <span className={styles.rangeValue}>{current}</span>
      </div>
    </div>
  );
}

const KNOB_VALUES = [-100, -75, -50, -25, 0, 25, 50, 75, 100] as const;

const MIXER_VALUES = KNOB_VALUES;

function MixerControls({ node, updateNodeParams }: ControlProps) {
  const setPortConstant = useGameStore((s) => s.setPortConstant);
  const current = Number(node.params['mix'] ?? 0);
  return (
    <div className={styles.field}>
      <label className={styles.label}>Mix ({current})</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {MIXER_VALUES.map((v) => (
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
              updateNodeParams(node.id, { mix: v });
              setPortConstant(node.id, 2, v);
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function DiverterControls({ node, updateNodeParams }: ControlProps) {
  const setPortConstant = useGameStore((s) => s.setPortConstant);
  const current = Number(node.params['fade'] ?? 0);
  return (
    <div className={styles.field}>
      <label className={styles.label}>Fade ({current})</label>
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
              updateNodeParams(node.id, { fade: v });
              setPortConstant(node.id, 1, v);
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function AmpControls({ node, updateNodeParams }: ControlProps) {
  const setPortConstant = useGameStore((s) => s.setPortConstant);
  const current = Number(node.params['gain'] ?? 0);
  return (
    <div className={styles.field}>
      <label className={styles.label}>Gain ({current})</label>
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
              updateNodeParams(node.id, { gain: v });
              setPortConstant(node.id, 1, v);
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
