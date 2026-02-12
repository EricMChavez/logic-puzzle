import type { PuzzleDefinition } from '../types.ts';

export const TEST123: PuzzleDefinition = {
  id: 'test123',
  title: 'Test123',
  description: 'This is a test',
  activeInputs: 2,
  activeOutputs: 1,
  allowedNodes: null,
  testCases: [
    {
      name: 'Test123',
      inputs: [
        {
          shape: 'sine-quarter',
          amplitude: 100,
          period: 64,
          phase: 0,
          offset: 0,
        },
        {
          shape: 'square-third',
          amplitude: 25,
          period: 85.33,
          phase: 0,
          offset: 0,
        }
      ],
      expectedOutputs: [
        {
          shape: 'samples',
          amplitude: 100,
          period: 256,
          phase: 0,
          offset: 0,
          samples: [0, 9.8, 19.51, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 19.51, 9.8, 0, -9.8, -19.51, -29.03, -38.27, -47.14, -55.56, -63.44, -70.71, -77.3, -83.15, -88.19, -92.39, -95.69, -98.08, -99.52, -100, -99.52, -98.08, -95.69, -92.39, -88.19, -83.15, -77.3, -70.71, -63.44, -55.56, -47.14, -38.27, -29.03, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, 25, 25, 25, 25, 25, 25, 25, 25, 19.51, 9.8, 0, -9.8, -19.51, -29.03, -38.27, -47.14, -55.56, -63.44, -70.71, -77.3, -83.15, -88.19, -92.39, -95.69, -98.08, -99.52, -100, -99.52, -98.08, -95.69, -92.39, -88.19, -83.15, -77.3, -70.71, -63.44, -55.56, -47.14, -38.27, -29.03, -19.51, -9.8, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -29.03, -38.27, -47.14, -55.56, -63.44, -70.71, -77.3, -83.15, -88.19, -92.39, -95.69, -98.08, -99.52, -100, -99.52, -98.08, -95.69, -92.39, -88.19, -83.15, -77.3, -70.71, -63.44, -55.56, -47.14, -38.27, -29.03, -19.51, -9.8, 0, 9.8, 19.51, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -25, -29.03, -38.27, -47.14, -55.56, -63.44, -70.71, -77.3, -83.15, -88.19, -92.39, -95.69, -98.08, -99.52, -100, -99.52, -98.08, -95.69, -92.39, -88.19, -83.15, -77.3, -70.71, -63.44, -55.56, -47.14, -38.27, -29.03, -25, -25],
        }
      ],
    },
  ],
  connectionPoints: {
    left: [
      { active: false, direction: 'input' },
      { active: true, direction: 'input', cpIndex: 0 },
      { active: true, direction: 'input', cpIndex: 1 },
    ],
    right: [
      { active: false, direction: 'input' },
      { active: true, direction: 'output', cpIndex: 0 },
      { active: false, direction: 'input' },
    ],
  },
  initialNodes: [
    { id: '05fc34f0-520d-4dc1-b1d9-65006f764dea', type: 'min', position: { col: 31, row: 12 }, params: {}, inputCount: 2, outputCount: 1 },
  ],
};


// =============================================================================
// TUTORIAL LEVELS
// Created via Creative Mode > Export
// =============================================================================

// Paste exported tutorial level definitions below.
// Each level should be a named export of type PuzzleDefinition.
//
// Example format:
//
// export const TUTORIAL_EXAMPLE: PuzzleDefinition = {
//   id: 'tutorial-example',
//   title: 'Example',
//   description: 'Description of what the player needs to do.',
//   activeInputs: 1,
//   activeOutputs: 1,
//   allowedNodes: null,  // or { offset: -1, scale: -1 } to restrict
//   testCases: [
//     {
//       name: 'Test Case 1',
//       inputs: [
//         { shape: 'sine', amplitude: 100, period: 64, phase: 0, offset: 0 },
//       ],
//       expectedOutputs: [
//         {
//           shape: 'samples',
//           amplitude: 100,
//           period: 256,
//           phase: 0,
//           offset: 0,
//           samples: [/* ... paste sample array here ... */],
//         },
//       ],
//     },
//   ],
//   // Optional: custom connection point layout
//   // connectionPoints: {
//   //   left: [
//   //     { active: false, direction: 'input' },
//   //     { active: true, direction: 'input', cpIndex: 0 },
//   //     { active: false, direction: 'input' },
//   //   ],
//   //   right: [
//   //     { active: false, direction: 'input' },
//   //     { active: true, direction: 'output', cpIndex: 0 },
//   //     { active: false, direction: 'input' },
//   //   ],
//   // },
// };
