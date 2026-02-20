import retro from './retro-shared.module.css';

const ABOUT_BODY = [
  'An idea years in the making. As an audio engineer, I always',
  'wanted a puzzle game built around the tools I use every day:',
  'waveforms, signal processing, and node-based thinking.',
  '',
  'I built WaveLength in under two weeks using agentic',
  'development with Claude Code.',
  '',
  "What you're playing is a love letter to the audio world,",
  "disguised as a puzzle game. If you've patched a modular",
  'synth, this will feel familiar. If not, welcome to waveforms.',
  '',
  'I hope you enjoy playing it as much as I enjoyed building it.',
];

export function AboutLinks() {
  return (
    <div className={retro.screenText}>
      {ABOUT_BODY.map((line, i) => (
        <div key={i}>{line || '\u00A0'}</div>
      ))}
      <div>&nbsp;</div>
      <div>{'\u2014 Eric Chavez'}</div>
      <div>&nbsp;</div>
      <div>
        {'  '}
        <a
          className={retro.crtLink}
          href="https://github.com/EricMChavez/WaveLength"
          target="_blank"
          rel="noopener noreferrer"
        >
          [GitHub]
        </a>
        {'  '}
        <a
          className={retro.crtLink}
          href="https://www.linkedin.com/in/emchavez320"
          target="_blank"
          rel="noopener noreferrer"
        >
          [LinkedIn]
        </a>
      </div>
    </div>
  );
}
