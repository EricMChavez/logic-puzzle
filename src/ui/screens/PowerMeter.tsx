import { useGameStore } from '../../store/index.ts';
import { PUZZLE_LEVELS } from '../../puzzle/levels/index.ts';
import retro from './retro-shared.module.css';

interface PowerMeterProps {
  vertical?: boolean;
}

export function PowerMeter({ vertical }: PowerMeterProps) {
  const completedLevels = useGameStore((s) => s.completedLevels);

  const total = PUZZLE_LEVELS.length;
  const completed = completedLevels.size;
  const progress = total > 0 ? completed / total : 0;
  const pct = Math.round(progress * 100);

  if (vertical) {
    return (
      <div className={retro.groovePanel} style={{
        marginBottom: 0,
        padding: '10px 8px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        boxSizing: 'border-box',
      }}>
        {/* Rotated "SIGNAL LEVEL" label */}
        <div style={{
          writingMode: 'vertical-lr',
          rotate: '180deg',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 3,
          textTransform: 'uppercase' as const,
          color: '#6b624d',
          fontFamily: "'IBM Plex Mono', monospace",
          whiteSpace: 'nowrap',
        }}>Signal Level</div>

        {/* Vertical bar */}
        <div style={{
          flex: 1,
          width: 18,
          borderRadius: 4,
          background: '#3a3426',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          position: 'relative' as const,
        }}>
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${pct}%`,
            borderRadius: 4,
            background: 'linear-gradient(0deg, #ea7a48 0%, #de6a38 50%, #d46030 100%)',
            boxShadow: pct > 0 ? '0 0 8px rgba(234,122,72,0.4)' : 'none',
            transition: 'height 0.6s ease-out',
          }} />
        </div>

        {/* Count */}
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#6b624d',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>{completed}/{total}</span>
      </div>
    );
  }

  return (
    <div className={retro.groovePanel} style={{ marginBottom: 0, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 3,
          textTransform: 'uppercase' as const,
          color: '#6b624d',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>Signal Level</span>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#6b624d',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>{completed}/{total}</span>
      </div>
      <div style={{
        height: 18,
        borderRadius: 4,
        background: '#3a3426',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        position: 'relative' as const,
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 4,
          background: 'linear-gradient(90deg, #ea7a48 0%, #de6a38 50%, #d46030 100%)',
          boxShadow: pct > 0 ? '0 0 8px rgba(234,122,72,0.4)' : 'none',
          transition: 'width 0.6s ease-out',
        }} />
      </div>
    </div>
  );
}
