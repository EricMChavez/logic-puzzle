import { useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '../../store/index.ts';
import type { ScreenPage } from '../../store/slices/screen-slice.ts';
import { RetroMainMenu } from './RetroMainMenu.tsx';
import { RetroAbout } from './RetroAbout.tsx';
import { RetroSettings } from './RetroSettings.tsx';
import styles from './RetroPageHost.module.css';

function PageContent({ page }: { page: ScreenPage }) {
  switch (page) {
    case 'main-menu': return <RetroMainMenu />;
    case 'about': return <RetroAbout />;
    case 'settings': return <RetroSettings />;
  }
}

export function RetroPageHost() {
  const activeScreen = useGameStore((s) => s.activeScreen);
  const transition = useGameStore((s) => s.screenTransition);
  const completeScreenTransition = useGameStore((s) => s.completeScreenTransition);
  const dismissScreen = useGameStore((s) => s.dismissScreen);
  const navigateToPage = useGameStore((s) => s.navigateToPage);

  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capture-phase Escape handler — fires before gameboard's handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const screen = useGameStore.getState().activeScreen;
      const trans = useGameStore.getState().screenTransition;
      if (!screen) return;
      if (trans.type !== 'idle') return; // ignore during transitions

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (screen === 'main-menu') {
          dismissScreen();
        } else {
          navigateToPage('main-menu');
        }
      }
    }

    // Capture phase so it fires before bubble-phase gameboard handler
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [dismissScreen, navigateToPage]);

  // Handle animation end
  const handleAnimationEnd = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    completeScreenTransition();
  }, [completeScreenTransition]);

  // Fallback timeout for animation completion
  useEffect(() => {
    if (transition.type === 'idle') return;

    const duration = transition.type === 'sliding-page' ? 450 : 550;
    fallbackTimerRef.current = setTimeout(() => {
      completeScreenTransition();
    }, duration);

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, [transition, completeScreenTransition]);

  // Nothing to render: no screen active and no transition
  if (!activeScreen && transition.type === 'idle') return null;

  // During a page-to-page slide, render both pages
  if (transition.type === 'sliding-page') {
    const outClass = transition.direction === 'left' ? styles.slideOutLeft : styles.slideOutRight;
    const inClass = transition.direction === 'left' ? styles.slideInFromRight : styles.slideInFromLeft;

    return (
      <div className={styles.host} ref={hostRef}>
        <div className={`${styles.pageContainer} ${outClass}`} aria-hidden>
          <PageContent page={transition.from} />
        </div>
        <div
          className={`${styles.pageContainer} ${inClass}`}
          onAnimationEnd={handleAnimationEnd}
        >
          <PageContent page={transition.to} />
        </div>
      </div>
    );
  }

  // Sliding down (dismiss) — page slides out downward
  if (transition.type === 'sliding-down') {
    return (
      <div className={styles.host} ref={hostRef}>
        <div
          className={`${styles.pageContainer} ${styles.slideDown}`}
          onAnimationEnd={handleAnimationEnd}
        >
          <PageContent page={transition.page} />
        </div>
      </div>
    );
  }

  // Sliding up (reveal) — page slides in from top
  if (transition.type === 'sliding-up') {
    return (
      <div className={styles.host} ref={hostRef}>
        <div
          className={`${styles.pageContainer} ${styles.slideUp}`}
          onAnimationEnd={handleAnimationEnd}
        >
          <PageContent page={transition.page} />
        </div>
      </div>
    );
  }

  // Idle with active screen — static page
  if (activeScreen) {
    return (
      <div className={styles.host} ref={hostRef}>
        <div className={`${styles.pageContainer} ${styles.idle}`}>
          <PageContent page={activeScreen} />
        </div>
      </div>
    );
  }

  return null;
}
