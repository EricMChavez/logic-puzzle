import { useCallback, useState } from 'react';
import { useGameStore } from '../../store/index.ts';
import { getCurrentTheme, setTheme } from '../../shared/tokens/theme-manager.ts';
import { isMuted, setMuted } from '../../shared/audio/index.ts';
import retro from './retro-shared.module.css';

export function RetroSettings() {
  const navigateToPage = useGameStore((s) => s.navigateToPage);
  const [theme, setThemeState] = useState(getCurrentTheme);
  const [muted, setMutedState] = useState(isMuted);

  const handleBack = useCallback(() => {
    navigateToPage('main-menu');
  }, [navigateToPage]);

  const handleThemeToggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }, [theme]);

  const handleMuteToggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }, [muted]);

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
        <span className={retro.brandModel}>Settings</span>
      </div>

      <div className={retro.screenHousing}>
        <div className={retro.screen}>
          <div className={retro.screenText}>
            <div>{'> SYSTEM PREFERENCES'}</div>
            <div>&nbsp;</div>
            <div>Theme: {theme === 'dark' ? 'SIGNAL BENCH (DARK)' : 'STUDIO MONITOR (LIGHT)'}</div>
            <div>Audio: {muted ? 'MUTED' : 'ENABLED'}</div>
            <div>&nbsp;</div>
            <div>READY. <span className={retro.cursorBlink} /></div>
          </div>
        </div>
      </div>

      <div className={retro.sectionLabel}>Preferences</div>
      <div className={retro.groovePanel}>
        <div className={retro.settingRow}>
          <span className={retro.settingLabel}>Theme</span>
          <button
            className={`${retro.keycap} ${theme === 'light' ? retro.keycapAccent : retro.keycapDark}`}
            onClick={handleThemeToggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <div className={`${retro.keycapBase} ${retro.sizeMd}`}>
              <div className={retro.keycapTop}>
                <span className={retro.keyLabel}>{theme === 'dark' ? 'Dark' : 'Light'}</span>
              </div>
            </div>
          </button>
        </div>

        <div className={retro.divider} />

        <div className={retro.settingRow}>
          <span className={retro.settingLabel}>Audio</span>
          <button
            className={`${retro.keycap} ${muted ? retro.keycapDark : retro.keycapAccent}`}
            onClick={handleMuteToggle}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          >
            <div className={`${retro.keycapBase} ${retro.sizeMd}`}>
              <div className={retro.keycapTop}>
                <span className={retro.keyLabel}>{muted ? 'Off' : 'On'}</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className={retro.statusBar}>
        <div className={retro.statusItem}>
          <span className={`${retro.led} ${retro.ledGreen}`} /> Theme
        </div>
        <div className={retro.statusItem}>
          <span className={`${retro.led} ${muted ? retro.ledOff : retro.ledAmber}`} /> Audio
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
