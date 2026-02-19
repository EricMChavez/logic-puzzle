import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { isMuted, setMuted } from '../../shared/audio/index.ts';
import { getKnobMode, setKnobMode } from '../../shared/settings/knob-mode.ts';
import retro from './retro-shared.module.css';

interface SettingOption {
  label: string;
  getValue: () => string;
  toggle: () => void;
}

export function SettingsTerminal() {
  const activeScreen = useGameStore((s) => s.activeScreen);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [, forceUpdate] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const settings: SettingOption[] = [
    {
      label: 'AUDIO',
      getValue: () => isMuted() ? 'MUTED' : 'ENABLED',
      toggle: () => {
        setMuted(!isMuted());
        forceUpdate((n) => n + 1);
      },
    },
    {
      label: 'KNOB DRAG',
      getValue: () => getKnobMode() === 'vertical' ? 'VERTICAL' : 'RADIAL',
      toggle: () => {
        setKnobMode(getKnobMode() === 'vertical' ? 'radial' : 'vertical');
        forceUpdate((n) => n + 1);
      },
    },
  ];

  const totalItems = settings.length + 1; // +1 for reset

  const handleReset = useCallback(() => {
    if (!confirmingReset) {
      setConfirmingReset(true);
    } else {
      localStorage.clear();
      window.location.reload();
    }
  }, [confirmingReset]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (activeScreen !== 'settings') return;

    if (e.key === 'Escape' && confirmingReset) {
      e.preventDefault();
      e.stopPropagation();
      setConfirmingReset(false);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setConfirmingReset(false);
      setFocusedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setConfirmingReset(false);
      setFocusedIndex((i) => Math.min(totalItems - 1, i + 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex < settings.length) {
        settings[focusedIndex]?.toggle();
      } else {
        handleReset();
      }
    }
  }, [activeScreen, focusedIndex, settings, totalItems, confirmingReset, handleReset]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  const resetFocused = focusedIndex === settings.length;

  return (
    <div className={retro.screenText}>
      {settings.map((setting, i) => {
        const focused = i === focusedIndex;
        const prefix = focused ? '> ' : '  ';
        return (
          <div
            key={setting.label}
            onClick={() => {
              setFocusedIndex(i);
              setConfirmingReset(false);
              setting.toggle();
            }}
            style={{
              cursor: 'pointer',
              color: focused ? '#33e8a0' : '#1a8860',
              textShadow: focused ? '0 0 4px rgba(51, 232, 160, 0.7)' : 'none',
            }}
          >
            {prefix}{setting.label.padEnd(9)}: {setting.getValue()}
          </div>
        );
      })}
      <div>&nbsp;</div>
      <div
        onClick={() => {
          setFocusedIndex(settings.length);
          handleReset();
        }}
        style={{
          cursor: 'pointer',
          color: resetFocused
            ? (confirmingReset ? '#e03838' : '#33e8a0')
            : '#1a8860',
          textShadow: resetFocused
            ? (confirmingReset ? '0 0 6px rgba(224, 56, 56, 0.7)' : '0 0 4px rgba(51, 232, 160, 0.7)')
            : 'none',
        }}
      >
        {resetFocused ? '> ' : '  '}
        {confirmingReset ? 'CONFIRM RESET? [ENTER] yes  [ESC] cancel' : 'RESET ALL DATA'}
      </div>
      <div>&nbsp;</div>
      <div style={{ color: '#1a8860', fontSize: '14px' }}>
        {'  [ARROW KEYS] navigate  [ENTER] select'}
      </div>
    </div>
  );
}
