import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { buildContextMenuItems } from './context-menu-items.ts';
import type { ContextMenuItem } from './context-menu-items.ts';
import { generateId } from '../../shared/generate-id.ts';
import { createUtilityGameboard } from '../../puzzle/utility-gameboard.ts';
import { captureViewportSnapshot, captureCropSnapshot } from '../../gameboard/canvas/snapshot.ts';
import { getNodeGridSize } from '../../shared/grid/index.ts';
import styles from './ContextMenu.module.css';

/** Capture viewport and start zoom-in transition for a node. */
function captureAndStartZoomIn(state: ReturnType<typeof useGameStore.getState>, chipId: string): void {
  if (state.zoomTransitionState.type !== 'idle') return;
  const node = state.activeBoard?.chips.get(chipId);
  if (!node) return;

  const snapshot = captureViewportSnapshot();
  if (snapshot) {
    const { cols, rows } = getNodeGridSize(node);
    const targetRect = { col: node.position.col, row: node.position.row, cols, rows };
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
  target: { type: 'node'; chipId: string } | { type: 'wire'; wireId: string } | { type: 'empty' };
  menuRef: React.RefObject<HTMLDivElement | null>;
  focusIndexRef: React.MutableRefObject<number>;
}

function ContextMenuInner({ position, target, menuRef, focusIndexRef }: InnerProps) {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const readOnly = useGameStore((s) => s.activeBoardReadOnly);

  // Build menu items
  let nodeType = '';
  if (target.type === 'node') {
    const node = useGameStore.getState().activeBoard?.chips.get(target.chipId);
    nodeType = node?.type ?? '';
  }

  const menuTarget = target.type === 'node'
    ? { type: 'node' as const, chipId: target.chipId, nodeType }
    : target.type === 'wire'
      ? { type: 'wire' as const, wireId: target.wireId }
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
  const menuW = 180;
  const menuH = items.length * 36 + 8;
  if (left + menuW > containerW) left = containerW - menuW - 4;
  if (top + menuH > containerH) top = containerH - menuH - 4;
  if (left < 0) left = 4;
  if (top < 0) top = 4;

  const handleAction = useCallback((item: ContextMenuItem) => {
    const state = useGameStore.getState();
    closeOverlay();

    switch (item.action) {
      case 'delete-node':
        if (target.type === 'node') {
          state.removeNode(target.chipId);
        }
        break;
      case 'delete-wire':
        if (target.type === 'wire') {
          state.removeWire(target.wireId);
        }
        break;
      case 'inspect':
        if (target.type === 'node') {
          captureAndStartZoomIn(state, target.chipId);
          state.zoomIntoNode(target.chipId);
        }
        break;
      case 'edit':
        if (target.type === 'node') {
          const node = state.activeBoard?.chips.get(target.chipId);
          if (!node) break;

          if (node.type === 'custom-blank') {
            const utilityId = generateId();
            const board = createUtilityGameboard(utilityId);
            captureAndStartZoomIn(state, target.chipId);
            state.startEditingUtility(utilityId, board, target.chipId);
          } else if (node.type.startsWith('utility:')) {
            const utilityId = node.type.slice('utility:'.length);
            const entry = state.utilityNodes.get(utilityId);
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

  if (items.length === 0) {
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
