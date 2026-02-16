import { useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import retro from './retro-shared.module.css';

export function RetroAbout() {
  const navigateToPage = useGameStore((s) => s.navigateToPage);

  const handleBack = useCallback(() => {
    navigateToPage('main-menu');
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
        <span className={retro.brandModel}>About</span>
      </div>

      <div className={retro.screenHousing}>
        <div className={retro.screen}>
          <div className={retro.screenText}>
            <div>{'> ABOUT WAVELENGTH'}</div>
            <div>&nbsp;</div>
            <div>A recursive tool-building puzzle game</div>
            <div>about signal processing.</div>
            <div>&nbsp;</div>
            <div>Wire together nodes to transform input</div>
            <div>waveforms into target outputs.</div>
            <div>&nbsp;</div>
            <div>Every solved puzzle becomes a reusable</div>
            <div>node for future puzzles, creating a</div>
            <div>fractal, infinitely-nestable tool-building</div>
            <div>loop.</div>
            <div>&nbsp;</div>
            <div>7 fundamental nodes. Infinite possibilities.</div>
            <div>&nbsp;</div>
            <div>READY. <span className={retro.cursorBlink} /></div>
          </div>
        </div>
      </div>

      <div className={retro.sectionLabel}>Navigation</div>
      <div className={retro.groovePanel}>
        <div className={retro.buttonRow}>
          <button className={`${retro.keycap} ${retro.keycapLight}`} onClick={handleBack}>
            <div className={`${retro.keycapBase} ${retro.sizeLg}`}>
              <div className={retro.keycapTop}>
                <span className={retro.keyLabel}>Back</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className={retro.embossed}>A recursive tool-building puzzle</div>
    </div>
  );
}
