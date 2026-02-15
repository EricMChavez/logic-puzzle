import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/index.ts';
import styles from './PortConstantInput.module.css';

export function PortConstantInput() {
  const editingPort = useGameStore((s) => s.editingPort);
  const portConstants = useGameStore((s) => s.portConstants);
  const setPortConstant = useGameStore((s) => s.setPortConstant);
  const stopEditingPort = useGameStore((s) => s.stopEditingPort);

  const inputRef = useRef<HTMLInputElement>(null);

  const currentKey = editingPort ? `${editingPort.chipId}:${editingPort.portIndex}` : '';
  const currentValue = editingPort ? (portConstants.get(currentKey) ?? 0) : 0;
  const [localValue, setLocalValue] = useState(String(currentValue));

  // Sync local value when editing port changes
  useEffect(() => {
    if (editingPort) {
      const key = `${editingPort.chipId}:${editingPort.portIndex}`;
      setLocalValue(String(portConstants.get(key) ?? 0));
      // Focus the input after render
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editingPort, portConstants]);

  if (!editingPort) return null;

  function commit() {
    if (!editingPort) return;
    const num = Number(localValue);
    if (!Number.isNaN(num)) {
      const clamped = Math.max(-100, Math.min(100, Math.round(num)));
      setPortConstant(editingPort.chipId, editingPort.portIndex, clamped);
    }
    stopEditingPort();
  }

  return (
    <div
      className={styles.overlay}
      style={{
        left: editingPort.position.x + 10,
        top: editingPort.position.y - 20,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span className={styles.label}>Constant value (-100 to 100)</span>
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          type="number"
          className={styles.numberInput}
          min={-100}
          max={100}
          step={1}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') stopEditingPort();
          }}
        />
        <button className={styles.okBtn} onClick={commit}>
          OK
        </button>
      </div>
    </div>
  );
}
