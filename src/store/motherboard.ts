import type { GameboardState, ChipState } from '../shared/types/index.ts';
import type { MotherboardLayout, MotherboardSection, MotherboardEdgeCP, PaginationState } from './motherboard-types.ts';
import { PUZZLE_LEVELS } from '../puzzle/levels/index.ts';
import { MOTHERBOARD_PLAYABLE_START, MOTHERBOARD_PLAYABLE_END } from '../shared/grid/constants.ts';
import { UTILITY_GRID_COLS, UTILITY_GRID_ROWS, PUZZLE_MENU_GRID_COLS, PUZZLE_MENU_GRID_ROWS, recomputeOccupancy } from '../shared/grid/occupancy.ts';
import { buildSlotConfig } from '../puzzle/types.ts';
import type { SlotConfig } from '../puzzle/types.ts';
import { generateWaveformValue } from '../puzzle/waveform-generators.ts';
import type { CustomPuzzle } from './slices/custom-puzzle-slice.ts';

// ---------------------------------------------------------------------------
// Grid sizing constants
// ---------------------------------------------------------------------------

/** Standard menu chip size (creative mode, tutorial, custom). */
const MENU_COLS = UTILITY_GRID_COLS; // 6
const MENU_ROWS = UTILITY_GRID_ROWS; // 3

/** Puzzle menu chip size (re-exported from grid/occupancy). */
const PUZZLE_MENU_COLS = PUZZLE_MENU_GRID_COLS;
const PUZZLE_MENU_ROWS = PUZZLE_MENU_GRID_ROWS;

/** Gap between chips inside sections. */
const V_GAP = 2;

/** Padding inside section containers (cells from edge to first chip). */
const SECTION_PAD = 2;

/** Cycle count for pre-computing waveform samples. */
const CYCLE_COUNT = 256;

// ---------------------------------------------------------------------------
// Section layout geometry
// ---------------------------------------------------------------------------

/** Playable area dimensions. */
const PLAYABLE_WIDTH = MOTHERBOARD_PLAYABLE_END - MOTHERBOARD_PLAYABLE_START; // 61

/**
 * Compute section grid bounds.
 * Primary: left portion (creative + tutorial).
 * Puzzles: right portion (paginated puzzle list).
 * Custom: below primary (only if custom puzzles exist).
 */
function computeSections(hasCustom: boolean): MotherboardSection[] {
  // Both sections are 10 cols wide (SECTION_PAD 2 + chip 6 + pad 2), centered with gap
  const leftCols = 10;
  const rightCols = 10;
  const gap = 4;
  const totalWidth = leftCols + gap + rightCols;

  const leftStart = MOTHERBOARD_PLAYABLE_START + Math.floor((PLAYABLE_WIDTH - totalWidth) / 2);
  const rightStart = leftStart + leftCols + gap;

  const primaryRows = hasCustom ? 16 : 32;
  const sections: MotherboardSection[] = [
    {
      id: 'primary',
      gridBounds: { col: leftStart, row: 2, cols: leftCols, rows: primaryRows },
    },
    {
      id: 'puzzles',
      gridBounds: { col: rightStart, row: 2, cols: rightCols, rows: 32 },
    },
  ];

  if (hasCustom) {
    sections.push({
      id: 'custom',
      gridBounds: { col: leftStart, row: 2 + primaryRows + 2, cols: leftCols, rows: 32 - primaryRows - 2 },
    });
  }

  return sections;
}

/** Compute how many puzzle chips fit on one page within the puzzle section. */
function computeItemsPerPage(sectionRows: number): number {
  const usable = sectionRows - SECTION_PAD * 2 - 2; // 2 rows reserved for pagination controls
  const stride = PUZZLE_MENU_ROWS + V_GAP;
  return Math.max(1, Math.floor(usable / stride));
}

// ---------------------------------------------------------------------------
// Edge CP helpers
// ---------------------------------------------------------------------------

function precomputeWaveform(puzzle: typeof PUZZLE_LEVELS[0], slotIndex: number, direction: 'input' | 'output'): number[] {
  const slotConfig: SlotConfig = puzzle.slotConfig ?? buildSlotConfig(puzzle.activeInputs, puzzle.activeOutputs);
  const testCase = puzzle.testCases[0];
  if (!testCase) return new Array(CYCLE_COUNT).fill(0);

  // Map slot index to per-direction index
  let dirIndex = 0;
  let count = 0;
  for (let i = 0; i < 6; i++) {
    if (slotConfig[i].active && slotConfig[i].direction === direction) {
      if (i === slotIndex) {
        dirIndex = count;
        break;
      }
      count++;
    }
  }

  const waveforms = direction === 'input' ? testCase.inputs : testCase.expectedOutputs;
  const def = waveforms[dirIndex];
  if (!def) return new Array(CYCLE_COUNT).fill(0);

  const samples = new Array(CYCLE_COUNT);
  for (let c = 0; c < CYCLE_COUNT; c++) {
    samples[c] = generateWaveformValue(c, def);
  }
  return samples;
}

function buildEdgeCPs(
  chipId: string,
  puzzle: typeof PUZZLE_LEVELS[0],
  chipCol: number,
  chipRow: number,
  sectionBounds: { col: number; row: number; cols: number; rows: number },
  isCompleted: boolean,
  isUnlocked: boolean,
): MotherboardEdgeCP[] {
  const slotConfig: SlotConfig = puzzle.slotConfig ?? buildSlotConfig(puzzle.activeInputs, puzzle.activeOutputs);
  const edgeCPs: MotherboardEdgeCP[] = [];

  for (let i = 0; i < 6; i++) {
    if (!slotConfig[i].active) continue;

    const portDir = slotConfig[i].direction; // 'input' or 'output'
    const portSide = i < 3 ? 'left' : 'right'; // slot 0-2 left, 3-5 right
    const perSideIdx = i < 3 ? i : i - 3;

    // Edge CP direction is inverse of chip port
    const edgeDir = portDir === 'input' ? 'output' : 'input';
    // Edge CP side matches the port side (on the section boundary)
    const edgeSide = portSide;

    // Grid position: section edge, same row as port position on chip
    const portRow = chipRow + Math.floor(perSideIdx * PUZZLE_MENU_ROWS / 3);
    const edgeCol = edgeSide === 'left'
      ? sectionBounds.col
      : sectionBounds.col + sectionBounds.cols;

    // Port position on the chip (left edge or right edge of chip body)
    const portCol = edgeSide === 'left'
      ? chipCol
      : chipCol + PUZZLE_MENU_COLS;

    // Connected = has active signal flowing
    // Locked: all cold. Unlocked: inputs hot, outputs cold. Completed: all hot.
    const isInputSide = portDir === 'input';
    const connected = isCompleted || (isUnlocked && isInputSide);

    edgeCPs.push({
      chipId,
      slotIndex: i,
      side: edgeSide,
      gridPosition: { col: edgeCol, row: portRow },
      portGridPosition: { col: portCol, row: portRow },
      direction: edgeDir,
      samples: precomputeWaveform(puzzle, i, portDir),
      visible: true,
      connected,
    });
  }

  return edgeCPs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MotherboardResult {
  board: GameboardState;
  layout: MotherboardLayout;
}

/**
 * Build the motherboard gameboard and its layout metadata.
 *
 * Layout:
 * - Primary section (left): Creative Mode + Tutorial chip
 * - Puzzle section (right): All puzzle levels, paginated
 * - Custom section (below primary, conditional): Custom puzzles
 */
export function createMotherboard(
  completedLevels: Set<string>,
  isLevelUnlocked: (index: number) => boolean,
  customPuzzles?: ReadonlyMap<string, CustomPuzzle>,
  currentPage: number = 0,
): MotherboardResult {
  const chips = new Map<string, ChipState>();
  const allEdgeCPs: MotherboardEdgeCP[] = [];

  const hasCustom = !!(customPuzzles && customPuzzles.size > 0);
  const sections = computeSections(hasCustom);

  const primaryBounds = sections.find(s => s.id === 'primary')!.gridBounds;
  const puzzleBounds = sections.find(s => s.id === 'puzzles')!.gridBounds;

  // ---------------------------------------------------------------------------
  // Primary section: Creative Mode + Tutorial
  // ---------------------------------------------------------------------------
  const primaryCenterCol = primaryBounds.col + Math.floor(primaryBounds.cols / 2) - Math.floor(MENU_COLS / 2);

  // Creative Mode chip (centered near top of primary section)
  const creativeRow = primaryBounds.row + SECTION_PAD;
  const creativeChip: ChipState = {
    id: 'menu-creative',
    type: 'menu:creative',
    position: { col: primaryCenterCol, row: creativeRow },
    params: { label: 'Creative Mode' },
    socketCount: 0,
    plugCount: 0,
  };
  chips.set(creativeChip.id, creativeChip);

  // Tutorial chip (below creative)
  const tutorialRow = creativeRow + MENU_ROWS + V_GAP;
  const tutorialChip: ChipState = {
    id: 'menu-tutorial',
    type: 'menu:tutorial',
    position: { col: primaryCenterCol, row: tutorialRow },
    params: { label: 'Tutorial' },
    socketCount: 0,
    plugCount: 0,
  };
  chips.set(tutorialChip.id, tutorialChip);

  // ---------------------------------------------------------------------------
  // Puzzle section: paginated list of all puzzles (tutorials + puzzles combined)
  // ---------------------------------------------------------------------------
  const allPuzzles = PUZZLE_LEVELS;
  const itemsPerPage = computeItemsPerPage(puzzleBounds.rows);
  const totalPages = Math.max(1, Math.ceil(allPuzzles.length / itemsPerPage));
  const safePage = Math.max(0, Math.min(currentPage, totalPages - 1));

  const pageStart = safePage * itemsPerPage;
  const pageEnd = Math.min(pageStart + itemsPerPage, allPuzzles.length);

  // Center chips horizontally within puzzle section
  const puzzleChipCol = puzzleBounds.col + Math.floor((puzzleBounds.cols - PUZZLE_MENU_COLS) / 2);
  const puzzleContentRow = puzzleBounds.row + SECTION_PAD;

  for (let i = pageStart; i < pageEnd; i++) {
    const puzzle = allPuzzles[i];
    const posInPage = i - pageStart;
    const row = puzzleContentRow + posInPage * (PUZZLE_MENU_ROWS + V_GAP);

    const isCompleted = completedLevels.has(puzzle.id);
    const levelIndex = i;
    const isUnlocked = isLevelUnlocked(levelIndex);
    const isTutorial = puzzle.id.startsWith('tutorial-');

    const slotConfig: SlotConfig = puzzle.slotConfig ?? buildSlotConfig(puzzle.activeInputs, puzzle.activeOutputs);

    // Encode slotConfig as individual params (params only holds primitives)
    // slot0..slot5: 0=inactive, 1=active input, 2=active output
    const slotParams: Record<string, number> = {};
    for (let s = 0; s < 6; s++) {
      slotParams[`slot${s}`] = !slotConfig[s].active ? 0
        : slotConfig[s].direction === 'input' ? 1 : 2;
    }

    const puzzleChip: ChipState = {
      id: `menu-level-${puzzle.id}`,
      type: `menu:level-${puzzle.id}`,
      position: { col: puzzleChipCol, row },
      params: {
        label: puzzle.title,
        locked: isTutorial ? false : !isUnlocked,
        completed: isCompleted,
        levelIndex,
        ...slotParams,
        isPuzzleChip: true,
      },
      socketCount: 0,
      plugCount: 0,
    };
    chips.set(puzzleChip.id, puzzleChip);

    // Build edge CPs for this chip
    const effectiveUnlocked = isTutorial || isUnlocked;
    const chipEdgeCPs = buildEdgeCPs(
      puzzleChip.id, puzzle, puzzleChipCol, row,
      puzzleBounds, isCompleted, effectiveUnlocked,
    );
    allEdgeCPs.push(...chipEdgeCPs);
  }

  // ---------------------------------------------------------------------------
  // Custom section (conditional)
  // ---------------------------------------------------------------------------
  if (hasCustom) {
    const customBounds = sections.find(s => s.id === 'custom')!.gridBounds;
    const customCenterCol = customBounds.col + Math.floor(customBounds.cols / 2) - Math.floor(MENU_COLS / 2);
    let customRow = customBounds.row + SECTION_PAD;

    const customEntries = Array.from(customPuzzles!.entries());
    for (const [puzzleId, entry] of customEntries) {
      const customChip: ChipState = {
        id: `menu-custom-${puzzleId}`,
        type: `menu:custom-${puzzleId}`,
        position: { col: customCenterCol, row: customRow },
        params: {
          label: entry.title,
          locked: false,
        },
        socketCount: 0,
        plugCount: 0,
      };
      chips.set(customChip.id, customChip);
      customRow += MENU_ROWS + V_GAP;

      // Don't overflow section
      if (customRow + MENU_ROWS > customBounds.row + customBounds.rows - SECTION_PAD) break;
    }
  }

  const pagination: PaginationState = {
    currentPage: safePage,
    totalPages,
    itemsPerPage,
  };

  const board: GameboardState = {
    id: 'motherboard',
    chips,
    paths: [],
  };

  const layout: MotherboardLayout = {
    sections,
    edgeCPs: allEdgeCPs,
    pagination,
  };

  return { board, layout };
}

/**
 * Rebuild the motherboard's occupancy grid from its chips.
 */
export function createMotherboardOccupancy(board: GameboardState): boolean[][] {
  return recomputeOccupancy(board.chips);
}
