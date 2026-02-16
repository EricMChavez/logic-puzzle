import { useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import retro from './retro-shared.module.css';

export function RetroMainMenu() {
  const dismissScreen = useGameStore((s) => s.dismissScreen);
  const navigateToPage = useGameStore((s) => s.navigateToPage);

  const handlePlay = useCallback(() => {
    dismissScreen();
  }, [dismissScreen]);

  const handleAbout = useCallback(() => {
    navigateToPage('about');
  }, [navigateToPage]);

  const handleSettings = useCallback(() => {
    navigateToPage('settings');
  }, [navigateToPage]);

  return (
    <div className={retro.machine}>
      <div className={`${retro.screw} ${retro.screwTL}`} />
      <div className={`${retro.screw} ${retro.screwTR}`} />
      <div className={`${retro.screw} ${retro.screwBL}`} />
      <div className={`${retro.screw} ${retro.screwBR}`} />

      <div className={retro.vents}>
        <div className={retro.vent} />
        <div className={retro.vent} />
        <div className={retro.vent} />
        <div className={retro.vent} />
        <div className={retro.vent} />
        <div className={retro.vent} />
        <div className={retro.vent} />
      </div>

      <div className={retro.brand}>
        <div className={retro.brandLogo} />
        <span className={retro.brandName}>WaveLength</span>
        <span className={retro.brandModel}>v1.0</span>
      </div>

      <div className={retro.screenHousing}>
        <div className={retro.screen}>
          <div className={retro.screenText}>
            <div>WAVELENGTH SIGNAL PROCESSOR v1.0</div>
            <div>Wire together nodes to transform signals.</div>
            <div>Every solved puzzle becomes a reusable node.</div>
            <div>&nbsp;</div>
            <div>READY. <span className={retro.cursorBlink} /></div>
          </div>
        </div>
      </div>

      <div className={retro.sectionLabel}>Command</div>
      <div className={retro.groovePanel}>
        <div className={retro.buttonRow}>
          <button className={`${retro.keycap} ${retro.keycapAccent}`} onClick={handlePlay}>
            <div className={`${retro.keycapBase} ${retro.sizeXl}`}>
              <div className={retro.keycapTop}>
                <span className={retro.keyLabel}>Play</span>
              </div>
            </div>
          </button>

          <button className={`${retro.keycap} ${retro.keycapLight}`} onClick={handleAbout}>
            <div className={`${retro.keycapBase} ${retro.sizeLg}`}>
              <div className={retro.keycapTop}>
                <span className={retro.keyLabel}>About</span>
              </div>
            </div>
          </button>

          <button className={`${retro.keycap} ${retro.keycapDark}`} onClick={handleSettings}>
            <div className={`${retro.keycapBase} ${retro.sizeLg}`}>
              <div className={retro.keycapTop}>
                <span className={retro.keyLabel}>Settings</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className={retro.statusBar}>
        <div className={retro.statusItem}>
          <span className={`${retro.led} ${retro.ledGreen}`} /> System
        </div>
        <div className={retro.statusItem}>
          <span className={`${retro.led} ${retro.ledAmber}`} /> Signal
        </div>
        <div className={retro.statusItem}>
          <span className={`${retro.led} ${retro.ledOff}`} /> Error
        </div>
      </div>

      <div className={retro.embossed}>A recursive tool-building puzzle</div>
    </div>
  );
}
