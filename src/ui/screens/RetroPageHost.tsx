import { useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '../../store/index.ts';
import { GizmoFace } from './GizmoFace.tsx';
import styles from './RetroPageHost.module.css';

export function RetroPageHost() {
  const activeScreen = useGameStore((s) => s.activeScreen);
  const transition = useGameStore((s) => s.screenTransition);
  const completeScreenTransition = useGameStore((s) => s.completeScreenTransition);
  const dismissScreen = useGameStore((s) => s.dismissScreen);

  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
