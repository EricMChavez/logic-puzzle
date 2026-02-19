import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { buildContextMenuItems } from './context-menu-items.ts';
import type { ContextMenuItem } from './context-menu-items.ts';
import { getChipDefinition } from '../../engine/nodes/registry.ts';
import { generateId } from '../../shared/generate-id.ts';
import { createUtilityGameboard } from '../../puzzle/utility-gameboard.ts';
import { exportCustomPuzzleAsSource } from '../../puzzle/export-puzzle.ts';
import { captureViewportSnapshot, captureCropSnapshot } from '../../gameboard/canvas/snapshot.ts';
import { getNodeGridSize } from '../../shared/grid/index.ts';
import styles from './ContextMenu.module.css';

/** Capture viewport and start zoom-in transition for a chip. */
function captureAndStartZoomIn(state: ReturnType<typeof useGameStore.getState>, chipId: string): void {
  if (state.zoomTransitionState.type !== 'idle') return;
  const chip = state.activeBoard?.chips.get(chipId);
  if (!chip) return;

  const snapshot = captureViewportSnapshot();
  if (snapshot) {
    const { cols, rows } = getNodeGridSize(chip);
    const targetRect = { col: chip.position.col, row: chip.position.row, cols, rows };
    const crop = captureCropSnapshot(chipId, targetRect) ?? undefined;
    state.startZoomCapture(snapshot, targetRect, 'in', crop);
  }
}

export function ContextMenu() {
  const overlay = useGameStore((s) => s.activeOverlay);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusIndexRef = useRef(0);

  if (overlay.type !== 'context-menu') return null;

  const { position, target } = overlay;

  return (
    <ContextMenuInner
      position={position}
      target={target}
      menuRef={menuRef}
      focusIndexRef={focusIndexRef}
    />
  );
}

interface InnerProps {
  position: { x: number; y: number };
  target: { type: 'chip'; chipId: string } | { type: 'path'; pathId: string } | { type: 'empty' };
  menuRef: React.RefObject<HTMLDivElement | null>;
  focusIndexRef: React.MutableRefObject<number>;
}

function getChipLabel(type: string): string {
  const def = getChipDefinition(type);
  if (def) return def.type.charAt(0).toUpperCase() + def.type.slice(1);
  if (type.startsWith('puzzle:')) return 'Puzzle Chip';
  if (type.startsWith('utility:')) return 'Utility Chip';
  if (type === 'custom-blank') return 'Blank Chip';
  return type;
}

function getPortName(chipType: string, portIndex: number, side: 'socket' | 'plug'): string {
  const def = getChipDefinition(chipType);
  if (def) {
    const ports = side === 'socket' ? def.sockets : def.plugs;
    return ports[portIndex]?.name ?? `${side === 'socket' ? 'In' : 'Out'} ${portIndex + 1}`;
  }
  return `${side === 'socket' ? 'In' : 'Out'} ${portIndex + 1}`;
}

function SignalValue({ value }: { value: number | null }) {
  if (value === null) {
    return <span className={styles.readoutValue} style={{ color: '#5a5e52' }}>—</span>;
  }
  const color = value > 0 ? '#F5AF28' : value < 0 ? '#1ED2C3' : '#8a8e82';
  return <span className={styles.readoutValue} style={{ color }}>{Math.round(value)}</span>;
}

function ChipReadout({ chipId }: { chipId: string }) {
  const playpoint = useGameStore((s) => s.playpoint);
  const cycleResults = useGameStore((s) => s.cycleResults);
  const activeBoard = useGameStore((s) => s.activeBoard);

  if (!activeBoard) return null;
  const chip = activeBoard.chips.get(chipId);
  if (!chip) return null;

  const def = getChipDefinition(chip.type);
  const socketCount = def ? def.sockets.length : chip.socketCount;
  const plugCount = def ? def.plugs.length : chip.plugCount;

  const inputValues: (number | null)[] = [];
  for (let i = 0; i < socketCount; i++) {
    const path = activeBoard.paths.find((p) => p.target.chipId === chipId && p.target.portIndex === i);
    if (path && cycleResults) {
      const vals = cycleResults.pathValues.get(path.id);
      inputValues.push(vals ? vals[playpoint] : null);
    } else {
      inputValues.push(null);
    }
  }

  const outputValues: (number | null)[] = [];
  const chipOuts = cycleResults?.chipOutputs.get(chipId);
  for (let i = 0; i < plugCount; i++) {
    outputValues.push(chipOuts ? (chipOuts[playpoint]?.[i] ?? null) : null);
  }

  return (
    <div className={styles.readout}>
      <div className={styles.readoutHeader}>{getChipLabel(chip.type)}</div>
      {socketCount > 0 && (
        <>
          <div className={styles.readoutGroup}>Inputs</div>
          {Array.from({ length: socketCount }, (_, i) => (
            <div key={`in-${i}`} className={styles.readoutRow}>
              <span className={styles.readoutPortName}>{getPortName(chip.type, i, 'socket')}</span>
              <SignalValue value={inputValues[i]} />
            </div>
          ))}
        </>
      )}
      {plugCount > 0 && (
        <>
          <div className={styles.readoutGroup}>Outputs</div>
          {Array.from({ length: plugCount }, (_, i) => (
            <div key={`out-${i}`} className={styles.readoutRow}>
              <span className={styles.readoutPortName}>{getPortName(chip.type, i, 'plug')}</span>
              <SignalValue value={outputValues[i]} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PathReadout({ pathId }: { pathId: string }) {
  const playpoint = useGameStore((s) => s.playpoint);
  const cycleResults = useGameStore((s) => s.cycleResults);
  const activeBoard = useGameStore((s) => s.activeBoard);

  if (!activeBoard) return null;
  const path = activeBoard.paths.find((p) => p.id === pathId);
  if (!path) return null;

  const sourceChip = activeBoard.chips.get(path.source.chipId);
  const targetChip = activeBoard.chips.get(path.target.chipId);

  const sourceName = sourceChip ? getChipLabel(sourceChip.type) : '?';
  const targetName = targetChip ? getChipLabel(targetChip.type) : '?';
  const sourcePort = sourceChip ? getPortName(sourceChip.type, path.source.portIndex, 'plug') : '?';
  const targetPort = targetChip ? getPortName(targetChip.type, path.target.portIndex, 'socket') : '?';

  const vals = cycleResults?.pathValues.get(pathId);
  const value = vals ? vals[playpoint] : null;

  return (
    <div className={styles.readout}>
      <div className={styles.readoutHeader}>Path</div>
      <div className={styles.readoutRoute}>{sourceName}.{sourcePort} → {targetName}.{targetPort}</div>
      <div className={styles.readoutRow}>
        <span className={styles.readoutPortName}>Signal</span>
        <SignalValue value={value} />
      </div>
    </div>
  );
}

function ContextMenuInner({ position, target, menuRef, focusIndexRef }: InnerProps) {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const readOnly = useGameStore((s) => s.activeBoardReadOnly);

  // Build menu items
  let chipType = '';
  let isCustomPuzzle = false;
  let readoutH = 0;
  if (target.type === 'chip') {
    const state = useGameStore.getState();
    const chip = state.activeBoard?.chips.get(target.chipId);
    chipType = chip?.type ?? '';
    if (chip) {
      const def = getChipDefinition(chipType);
      const sCount = def ? def.sockets.length : chip.socketCount;
      const pCount = def ? def.plugs.length : chip.plugCount;
      readoutH = 32 + (sCount > 0 ? 16 + sCount * 20 : 0) + (pCount > 0 ? 16 + pCount * 20 : 0) + 5;
    }
    if (chipType.startsWith('puzzle:')) {
      const puzzleId = chipType.slice('puzzle:'.length);
      isCustomPuzzle = state.customPuzzles.has(puzzleId);
    } else if (chipType.startsWith('menu:custom-')) {
      const puzzleId = chipType.slice('menu:custom-'.length);
      isCustomPuzzle = state.customPuzzles.has(puzzleId);
    }
  } else if (target.type === 'path') {
    readoutH = 70;
  }

  const menuTarget = target.type === 'chip'
    ? { type: 'chip' as const, chipId: target.chipId, chipType, isCustomPuzzle }
    : target.type === 'path'
      ? { type: 'path' as const, pathId: target.pathId }
      : null;

  const items = menuTarget ? buildContextMenuItems(menuTarget, readOnly) : [];

  // Focus the menu on mount
  useEffect(() => {
    focusIndexRef.current = 0;
    menuRef.current?.focus();
  }, []);

  // Position: flip if near container edge
  // With will-change:transform on the game container, position:fixed is relative to the container
  const container = document.querySelector<HTMLElement>('[data-game-container]');
  const containerRect = container?.getBoundingClientRect();
  const containerW = containerRect?.width ?? window.innerWidth;
  const containerH = containerRect?.height ?? window.innerHeight;
  const containerLeft = containerRect?.left ?? 0;
  const containerTop = containerRect?.top ?? 0;
  let left = position.x - containerLeft;
  let top = position.y - containerTop;
  const menuW = 220;
  const menuH = items.length * 36 + 8 + readoutH + (readoutH > 0 && items.length > 0 ? 5 : 0);
  if (left + menuW > containerW) left = containerW - menuW - 4;
  if (top + menuH > containerH) top = containerH - menuH - 4;
  if (left < 0) left = 4;
  if (top < 0) top = 4;

  const handleAction = useCallback((item: ContextMenuItem) => {
    const state = useGameStore.getState();
    closeOverlay();

    switch (item.action) {
      case 'delete-chip':
        if (target.type === 'chip') {
          state.removeChip(target.chipId);
        }
        break;
      case 'delete-path':
        if (target.type === 'path') {
          state.removePath(target.pathId);
        }
        break;
      case 'inspect':
        if (target.type === 'chip') {
          captureAndStartZoomIn(state, target.chipId);
          state.zoomIntoNode(target.chipId);
        }
        break;
      case 'export':
        if (target.type === 'chip') {
          const exportChip = state.activeBoard?.chips.get(target.chipId);
          if (exportChip) {
            let puzzleId: string | null = null;
            if (exportChip.type.startsWith('puzzle:')) {
              puzzleId = exportChip.type.slice('puzzle:'.length);
            } else if (exportChip.type.startsWith('menu:custom-')) {
              puzzleId = exportChip.type.slice('menu:custom-'.length);
            }
            if (puzzleId) {
              const puzzle = state.customPuzzles.get(puzzleId);
              if (puzzle) {
                const source = exportCustomPuzzleAsSource(puzzle);
                navigator.clipboard.writeText(source);
              }
            }
          }
        }
        break;
      case 'edit':
        if (target.type === 'chip') {
          const chip = state.activeBoard?.chips.get(target.chipId);
          if (!chip) break;

          if (chip.type === 'custom-blank') {
            const utilityId = generateId();
            const board = createUtilityGameboard(utilityId);
            captureAndStartZoomIn(state, target.chipId);
            state.startEditingUtility(utilityId, board, target.chipId);
          } else if (chip.type.startsWith('utility:')) {
            const utilityId = chip.type.slice('utility:'.length);
            const entry = state.craftedUtilities.get(utilityId);
            if (entry) {
              captureAndStartZoomIn(state, target.chipId);
              state.startEditingUtility(utilityId, entry.board, target.chipId);
            }
          }
        }
        break;
    }
  }, [target, closeOverlay]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndexRef.current = Math.min(focusIndexRef.current + 1, items.length - 1);
      const btns = menuRef.current?.querySelectorAll('button');
      btns?.[focusIndexRef.current]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndexRef.current = Math.max(focusIndexRef.current - 1, 0);
      const btns = menuRef.current?.querySelectorAll('button');
      btns?.[focusIndexRef.current]?.focus();
    }
  }, [items.length]);

  const hasReadout = target.type === 'chip' || target.type === 'path';
  if (items.length === 0 && !hasReadout) {
    closeOverlay();
    return null;
  }

  return (
    <>
      <div className={styles.backdrop} onClick={closeOverlay} />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left, top }}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        role="menu"
      >
        {target.type === 'chip' && <ChipReadout chipId={target.chipId} />}
        {target.type === 'path' && <PathReadout pathId={target.pathId} />}
        {hasReadout && items.length > 0 && <div className={styles.divider} />}
        {items.map((item, i) => (
          <button
            key={item.id}
            className={`${styles.item} ${item.danger ? styles.danger : ''}`}
            onClick={() => handleAction(item)}
            role="menuitem"
            tabIndex={i === 0 ? 0 : -1}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
