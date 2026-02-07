import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { buildContextMenuItems } from './context-menu-items.ts';
import type { ContextMenuItem } from './context-menu-items.ts';
import { stopSimulation } from '../../simulation/simulation-controller.ts';
import styles from './ContextMenu.module.css';

/** Capture the canvas to an OffscreenCanvas and start the lid-open animation. */
function captureAndStartLidOpen(state: ReturnType<typeof useGameStore.getState>): void {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  const snapshot = new OffscreenCanvas(canvas.width, canvas.height);
  const ctx = snapshot.getContext('2d');
  if (ctx) {
    ctx.drawImage(canvas, 0, 0);
    state.startLidOpen(snapshot);
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
  target: { type: 'node'; nodeId: string } | { type: 'wire'; wireId: string } | { type: 'empty' };
  menuRef: React.RefObject<HTMLDivElement | null>;
  focusIndexRef: React.MutableRefObject<number>;
}

function ContextMenuInner({ position, target, menuRef, focusIndexRef }: InnerProps) {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const readOnly = useGameStore((s) => s.activeBoardReadOnly);

  // Build menu items
  let nodeType = '';
  if (target.type === 'node') {
    const node = useGameStore.getState().activeBoard?.nodes.get(target.nodeId);
    nodeType = node?.type ?? '';
  }

  const menuTarget = target.type === 'node'
    ? { type: 'node' as const, nodeId: target.nodeId, nodeType }
    : target.type === 'wire'
      ? { type: 'wire' as const, wireId: target.wireId }
      : null;

  const items = menuTarget ? buildContextMenuItems(menuTarget, readOnly) : [];

  // Focus the menu on mount
  useEffect(() => {
    focusIndexRef.current = 0;
    menuRef.current?.focus();
  }, []);

  // Position: flip if near viewport edge
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let left = position.x;
  let top = position.y;
  const menuW = 180;
  const menuH = items.length * 36 + 8;
  if (left + menuW > viewportW) left = viewportW - menuW - 4;
  if (top + menuH > viewportH) top = viewportH - menuH - 4;
  if (left < 0) left = 4;
  if (top < 0) top = 4;

  const handleAction = useCallback((item: ContextMenuItem) => {
    const state = useGameStore.getState();
    closeOverlay();

    switch (item.action) {
      case 'delete-node':
        if (target.type === 'node') {
          state.removeNode(target.nodeId);
        }
        break;
      case 'delete-wire':
        if (target.type === 'wire') {
          state.removeWire(target.wireId);
        }
        break;
      case 'set-params':
        if (target.type === 'node') {
          state.selectNode(target.nodeId);
          state.openOverlay({ type: 'parameter-popover', nodeId: target.nodeId });
        }
        break;
      case 'inspect':
        if (target.type === 'node') {
          captureAndStartLidOpen(state);
          state.zoomIntoNode(target.nodeId);
        }
        break;
      case 'edit':
        if (target.type === 'node') {
          const node = state.activeBoard?.nodes.get(target.nodeId);
          if (node && node.type.startsWith('utility:')) {
            const utilityId = node.type.slice('utility:'.length);
            const entry = state.utilityNodes.get(utilityId);
            if (entry) {
              if (state.simulationRunning) {
                stopSimulation();
                state.setSimulationRunning(false);
              }
              captureAndStartLidOpen(state);
              state.startEditingUtility(utilityId, entry.board);
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
