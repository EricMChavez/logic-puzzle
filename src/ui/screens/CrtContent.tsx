import { useMemo } from 'react';
import { useGameStore } from '../../store/index.ts';
import { useTypewriter } from './useTypewriter.ts';
import { SettingsTerminal } from './SettingsTerminal.tsx';
import { AboutLinks } from './AboutLinks.tsx';
import { PUZZLE_LEVELS } from '../../puzzle/levels/index.ts';
import asciiArtRaw from '../../assets/ascii-wavelength.txt?raw';
import retro from './retro-shared.module.css';

const ASCII_ART_LINES = asciiArtRaw
  .split('\n')
  .map((l) => l.trimEnd())
  .filter((l, i, a) => !(i === a.length - 1 && l === ''));

function getHomeLines(signalFull: boolean): string[] {
  return [
    'Beta v0.1',
    ...(signalFull ? [] : ['[CRITICAL] Low signal!']),
    '',
    '[WARNING] Use at your own risk. Side effects may include',
    'corrupted memories, delusions of insignificance, and dry mouth.',
    '',
    'Best played fullscreen.',
  ];
}

const ABOUT_HEADER_LINES = [
  '> ABOUT WAVELENGTH',
  '',
];

const SETTINGS_HEADER_LINES = [
  '> SYSTEM PREFERENCES',
  '',
];

export function CrtContent() {
  const activeScreen = useGameStore((s) => s.activeScreen);
  const generation = useGameStore((s) => s.tabSwitchGeneration);
  const completedCount = useGameStore((s) => s.completedLevels.size);

  const signalFull = completedCount >= PUZZLE_LEVELS.length;
  const instantLineCount = activeScreen === 'home' ? ASCII_ART_LINES.length : 0;

  const contentLines = useMemo(() => {
    switch (activeScreen) {
      case 'home': return [...ASCII_ART_LINES, ...getHomeLines(signalFull)];
      case 'about': return ABOUT_HEADER_LINES;
      case 'settings': return SETTINGS_HEADER_LINES;
      case 'thankyou': return [];
      default: return [...ASCII_ART_LINES, ...getHomeLines(signalFull)];
    }
  }, [activeScreen, signalFull]);

  const { lines, cursorVisible, isTyping } = useTypewriter(contentLines, generation, instantLineCount);

  const asciiLines = instantLineCount > 0 ? lines.slice(0, instantLineCount) : [];
  const textLines = instantLineCount > 0 ? lines.slice(instantLineCount) : lines;

  if (activeScreen === 'thankyou') {
    return (
      <div className={`${retro.screenText} ${retro.thankYouWrap}`}>
        Thank you for playing!
      </div>
    );
  }

  return (
    <div className={retro.screenText}>
      {asciiLines.length > 0 && (
        <div className={retro.asciiArtWrap}>
          <pre className={retro.asciiArt}>{asciiLines.join('\n')}</pre>
        </div>
      )}
      {textLines.map((line, i) => (
        <div key={i}>{line || '\u00A0'}</div>
      ))}
      {activeScreen === 'settings' && !isTyping && (
        <SettingsTerminal />
      )}
      {activeScreen === 'about' && !isTyping && (
        <AboutLinks />
      )}
      {activeScreen !== 'settings' && activeScreen !== 'about' && cursorVisible && !isTyping && (
        <span className={retro.cursorBlink} />
      )}
    </div>
  );
}
