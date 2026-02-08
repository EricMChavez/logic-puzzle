import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { buildPaletteItems, filterPaletteItems } from './palette-items.ts';
import type { PaletteItem } from './palette-items.ts';
import styles from './PaletteModal.module.css';

export function PaletteModal() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'palette-modal') return null;
  return <PaletteModalInner />;
}

function PaletteModalInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const startPlacingNode = useGameStore((s) => s.startPlacingNode);
  const puzzleNodes = useGameStore((s) => s.puzzleNodes);
  const utilityNodes = useGameStore((s) => s.utilityNodes);
  const completedLevels = useGameStore((s) => s.completedLevels);
  const activePuzzle = useGameStore((s) => s.activePuzzle);
  const isCreativeMode = useGameStore((s) => s.isCreativeMode);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allowedNodes = activePuzzle?.allowedNodes ?? null;
  const allItems = buildPaletteItems(allowedNodes, puzzleNodes, utilityNodes, completedLevels, isCreativeMode);
  const filtered = filterPaletteItems(allItems, query);

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clamp activeIndex when filtered list changes
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const handleSelect = useCallback((item: PaletteItem) => {
    closeOverlay();
    startPlacingNode(item.nodeType);
  }, [closeOverlay, startPlacingNode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0 && activeIndex < filtered.length) {
        handleSelect(filtered[activeIndex]);
      }
    }
  }, [filtered, activeIndex, handleSelect]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const btns = listRef.current.querySelectorAll('button[data-palette-item]');
    btns[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Group items by section
  const sections: Array<{ title: string; items: PaletteItem[] }> = [];
  let fundamentals: PaletteItem[] = [];
  let puzzles: PaletteItem[] = [];
  let utilities: PaletteItem[] = [];

  for (const item of filtered) {
    if (item.section === 'fundamental') fundamentals.push(item);
    else if (item.section === 'puzzle') puzzles.push(item);
    else utilities.push(item);
  }
  if (fundamentals.length > 0) sections.push({ title: 'Fundamental', items: fundamentals });
  if (puzzles.length > 0) sections.push({ title: 'Puzzle (Earned)', items: puzzles });
  if (utilities.length > 0) sections.push({ title: 'Utility (Custom)', items: utilities });

  // Compute flat index offset for each section item
  let flatIndex = 0;

  return (
    <div className={styles.backdrop} onClick={closeOverlay}>
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Node Palette"
      >
        <div className={styles.searchWrap}>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search nodes..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          />
        </div>
        <div className={styles.list} ref={listRef}>
          {sections.map((section) => (
            <div key={section.title}>
              <div className={styles.sectionTitle}>{section.title}</div>
              {section.items.map((item) => {
                const idx = flatIndex++;
                return (
                  <button
                    key={item.id}
                    className={`${styles.item} ${idx === activeIndex ? styles.active : ''}`}
                    onClick={() => handleSelect(item)}
                    data-palette-item
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className={styles.emptyMsg}>No nodes match your search</div>
          )}
        </div>
      </div>
    </div>
  );
}
