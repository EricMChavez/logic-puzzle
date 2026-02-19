import { useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { playSound } from '../../shared/audio/audio-manager.ts';
import { PUZZLE_LEVELS } from '../../puzzle/levels/index.ts';
import type { GizmoTab, ScreenTransition } from '../../store/slices/screen-slice.ts';
import { CrtContent } from './CrtContent.tsx';
import { PowerMeter } from './PowerMeter.tsx';
import retro from './retro-shared.module.css';
import styles from './GizmoFace.module.css';

interface TabButton {
  tab: GizmoTab;
  label: string;
}

const TABS: TabButton[] = [
  { tab: 'home', label: 'Home' },
  { tab: 'about', label: 'About' },
  { tab: 'settings', label: 'Settings' },
];

function getCrtClasses(transition: ScreenTransition): { crtClass: string; dotClass: string } {
  switch (transition.type) {
    case 'powering-off':
      return { crtClass: retro.crtPowerOff, dotClass: retro.crtDotOff };
    case 'sliding-down':
    case 'sliding-up':
      return { crtClass: retro.crtOff, dotClass: '' };
    default:
      return { crtClass: '', dotClass: '' };
  }
}

export function GizmoFace() {
  const activeScreen = useGameStore((s) => s.activeScreen);
  const transition = useGameStore((s) => s.screenTransition);
  const switchTab = useGameStore((s) => s.switchTab);
  const dismissScreen = useGameStore((s) => s.dismissScreen);
  const completeScreenTransition = useGameStore((s) => s.completeScreenTransition);
  const completedLevels = useGameStore((s) => s.completedLevels);

  const { crtClass, dotClass } = getCrtClasses(transition);

  const handlePlay = useCallback(() => {
    playSound('menu-play-button');
    if (completedLevels.size >= PUZZLE_LEVELS.length && activeScreen !== 'thankyou') {
      switchTab('thankyou');
    } else {
      dismissScreen();
    }
  }, [completedLevels, activeScreen, switchTab, dismissScreen]);

  const handleCrtAnimEnd = useCallback((e: React.AnimationEvent) => {
    // Only respond to animations on the wrapper itself, not bubbled events (e.g. cursor blink)
    if (e.target !== e.currentTarget) return;
    completeScreenTransition();
  }, [completeScreenTransition]);

  return (
    <div className={styles.gizmo}>
      {/* SVG clip-path: barrel/pillow shape for CRT screen */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="crt-screen" clipPathUnits="objectBoundingBox">
            <path d="M 0.03 0.04 Q 0.5 -0.02 0.97 0.04 C 0.978 0.04 0.985 0.057 0.985 0.07 Q 0.99 0.5 0.985 0.93 C 0.985 0.947 0.978 0.96 0.97 0.96 Q 0.5 1.02 0.03 0.96 C 0.022 0.96 0.015 0.947 0.015 0.93 Q 0.01 0.5 0.015 0.07 C 0.015 0.053 0.022 0.04 0.03 0.04 Z"/>
          </clipPath>
        </defs>
      </svg>

      {/* Corner screws */}
      <div className={styles.cornerScrews}>
        <div className={`${retro.screw} ${retro.screwTL}`} />
        <div className={`${retro.screw} ${retro.screwTR}`} />
        <div className={`${retro.screw} ${retro.screwBL}`} />
        <div className={`${retro.screw} ${retro.screwBR}`} />
      </div>

      {/* Monitor — rows 1-2, cols 1-2 */}
      <div className={styles.monitor}>
        <div className={retro.screenHousing}>
          <div className={`${retro.screen} ${styles.crtScreen}`}>
            <div
              className={`${retro.crtContentWrap} ${crtClass}`}
              onAnimationEnd={handleCrtAnimEnd}
            >
              <CrtContent />
            </div>
            <div className={`${retro.centerDot} ${dotClass}`} />
            <div className={retro.highlightStreak} />
            <div className={retro.noiseGrain} />
            <div className={retro.insetDepth} />
            <div className={retro.glassBulge} />
          </div>
        </div>
      </div>

      {/* Signal level — row 1, col 3 */}
      <div className={styles.signalLevel}>
        <PowerMeter vertical />
      </div>

      {/* Ventilation grilles — both sides */}
      <div className={`${styles.ventGrille} ${styles.ventGrilleLeft}`}>
        <div className={styles.ventSeam}>
          <div className={styles.ventPanel}>
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} className={styles.ventSlat} />
            ))}
          </div>
        </div>
      </div>
      <div className={`${styles.ventGrille} ${styles.ventGrilleRight}`}>
        <div className={styles.ventSeam}>
          <div className={styles.ventPanel}>
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} className={styles.ventSlat} />
            ))}
          </div>
        </div>
      </div>


      {/* Bottom row — tabs + play button */}
      <div className={styles.bottomRow}>
        {/* Floppy disk slot */}
        <div className={styles.floppySlot}>
          <div className={styles.floppyBezel}>
            <div className={styles.floppyOpening}>
              <div className={styles.floppyGuide} />
            </div>
            <div className={styles.floppyEjectBar} />
          </div>
          <div className={styles.floppyLed} />
        </div>
        <div className={styles.tabColumn}>
          <div className={styles.indicatorChannel}>
            {TABS.map(({ tab }) => (
              <div key={tab} className={styles.indicatorSlot}>
                <div className={`${styles.indicatorStrip} ${activeScreen === tab ? styles.indicatorStripActive : ''}`} />
              </div>
            ))}
          </div>
          <div className={styles.tabRow}>
            {TABS.map(({ tab, label }) => {
              const isActive = activeScreen === tab;
              return (
                <button
                  key={tab}
                  className={`${retro.keycap} ${retro.keycapLight} ${isActive ? retro.keycapDepressed : ''}`}
                  onClick={() => { playSound('menu-tab'); switchTab(tab); }}
                >
                  <div className={`${retro.keycapBase} ${retro.sizeWide}`}>
                    <div className={retro.keycapTop}>
                      <span className={retro.keyLabel}>{label}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <button className={styles.playButton} onClick={handlePlay}>
          <div className={styles.playArm}>
            <div className={styles.playArmTop} />
          </div>
          <div className={styles.playBody}>
            <div className={styles.playBodyTop}>Play</div>
          </div>
        </button>
      </div>
    </div>
  );
}
