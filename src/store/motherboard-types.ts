import type { GridPoint } from '../shared/grid/types.ts';

/** Identifiers for the three motherboard sections. */
export type MotherboardSectionId = 'primary' | 'puzzles' | 'custom';

/** A visual section container on the motherboard. */
export interface MotherboardSection {
  id: MotherboardSectionId;
  /** Grid bounds of the section container (position + size). */
  gridBounds: { col: number; row: number; cols: number; rows: number };
}

/** An edge connection point rendered at a section boundary. */
export interface MotherboardEdgeCP {
  /** Menu chip this belongs to. */
  chipId: string;
  /** Puzzle slot index (0-5). */
  slotIndex: number;
  /** Side of section boundary. */
  side: 'left' | 'right';
  /** Position on the grid. */
  gridPosition: GridPoint;
  /** Inverse of chip port: chip socket -> edge output, chip plug -> edge input. */
  direction: 'input' | 'output';
  /** Grid position of the corresponding puzzle chip port (path endpoint). */
  portGridPosition: GridPoint;
  /** Pre-computed 256-sample waveform array for animation. */
  samples: number[];
  /** Whether this edge CP is visible. */
  visible: boolean;
  /** Whether the edge CP has active signal (draws path + plugs). False = socket hint only. */
  connected: boolean;
}

/** Pagination state for the puzzle section. */
export interface PaginationState {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
}

/** Complete motherboard layout alongside the gameboard. */
export interface MotherboardLayout {
  sections: MotherboardSection[];
  edgeCPs: MotherboardEdgeCP[];
  pagination: PaginationState;
}
