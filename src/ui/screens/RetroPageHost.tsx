import { useEffect, useCallback, useRef, useState } from 'react';
import { useGameStore } from '../../store/index.ts';
import { GizmoFace } from './GizmoFace.tsx';
import { computeCellSize } from '../../shared/grid/viewport.ts';
import { MIN_CELL_SIZE } from '../../shared/grid/constants.ts';
import styles from './RetroPageHost.module.css';

export function RetroPageHost() {
  const activeScreen = useGameStore((s) => s.activeScreen);
  const transition = useGameStore((s) => s.screenTransition);
  const completeScreenTransition = useGameStore((s) => s.completeScreenTransition);
  const dismissScreen = useGameStore((s) => s.dismissScreen);

  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tooSmall, setTooSmall] = useState(() => {
    return computeCellSize(window.innerWidth, window.innerHeight) < MIN_CELL_SIZE;
  });

  useEffect(() => {
    function handleResize() {
      setTooSmall(computeCellSize(window.innerWidth, window.innerHeight) < MIN_CELL_SIZE);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Capture-phase Escape handler — fires before gameboard's handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const screen = useGameStore.getState().activeScreen;
      const trans = useGameStore.getState().screenTransition;
      if (!screen) return;
      // Only allow dismiss when CRT is fully on (idle)
      if (trans.type !== 'idle') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismissScreen();
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [dismissScreen]);

  // Handle animation end — guard against bubbled events from child animations
  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    completeScreenTransition();
  }, [completeScreenTransition]);

  // Fallback timeout for animation completion
  useEffect(() => {
    if (transition.type === 'idle') return;

    const timeout = transition.type === 'powering-off' ? 350 : 550;

    fallbackTimerRef.current = setTimeout(() => {
      completeScreenTransition();
    }, timeout);

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, [transition, completeScreenTransition]);

  // Nothing to render: no screen active and no transition
  if (!activeScreen && transition.type === 'idle') return null;

  // Sliding down (dismiss — CRT already off, slide the whole gizmo)
  if (transition.type === 'sliding-down') {
    return (
      <div className={styles.host} ref={hostRef}>
        <div
          className={`${styles.pageContainer} ${styles.slideDown}`}
          onAnimationEnd={handleAnimationEnd}
        >
          <GizmoFace />
        </div>
      </div>
    );
  }

  // Sliding up (reveal — CRT dark, slides into view, then powers on)
  if (transition.type === 'sliding-up') {
    return (
      <div className={styles.host} ref={hostRef}>
        <div
          className={`${styles.pageContainer} ${styles.slideUp}`}
          onAnimationEnd={handleAnimationEnd}
        >
          <GizmoFace />
        </div>
      </div>
    );
  }

  // Idle / powering-off — static position, CRT animation handled inside GizmoFace
  if (activeScreen) {
    if (tooSmall) {
      return (
        <div className={styles.host} ref={hostRef}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--token-surface-page-background)',
              color: '#e0e0f0',
              fontFamily: 'system-ui, sans-serif',
              fontSize: '18px',
              textAlign: 'center',
              padding: '2rem',
              zIndex: 10,
            }}
          >
            Viewport too small. Please resize your window to at least 1024×576.
          </div>
        </div>
      );
    }
    return (
      <div className={styles.host} ref={hostRef}>
        <div className={`${styles.pageContainer} ${styles.idle}`}>
          <GizmoFace />
        </div>
      </div>
    );
  }

  return null;
}
