// SAMPLE PIECES for building the settings panel before there are any real ones. DEVELOPMENT AND TESTS ONLY.
//
// This module is reached from one place, a dynamic import in lib/pieces.ts behind `import.meta.env.DEV`, so a production build does not
// contain it. Nothing here describes anything a person built: the names, the numbers and the colours are made up to exercise the four
// kinds of control, and every piece says `specimen: true`. In M5 the panel reads a block's own parameter schema instead and this file goes.
//
// The marker below is what the production-bundle checks look for. It must stay a string nothing else in the app contains.
import type { Piece } from './pieces';

export const PIECES_STUB_MARKER = 'studpilot-pieces-stub-v1';

export const STUB_PIECES: Piece[] = [
  {
    id: `${PIECES_STUB_MARKER}:shop-screen`,
    name: 'Sample shop screen',
    kind: 'ui',
    specimen: true,
    params: [
      { kind: 'number', id: 'columns', label: 'Item columns', value: 3, min: 1, max: 6, step: 1 },
      { kind: 'number', id: 'corner', label: 'Corner roundness', value: 8, min: 0, max: 24, step: 1, unit: 'px' },
      { kind: 'colour', id: 'panel', label: 'Panel colour', value: '#1a1d22' },
      { kind: 'colour', id: 'highlight', label: 'Highlight colour', value: '#d9a441' },
      { kind: 'toggle', id: 'prices', label: 'Show prices', value: true },
      { kind: 'text', id: 'title', label: 'Title', value: 'Shop', maxLength: 24 },
    ],
  },
  {
    id: `${PIECES_STUB_MARKER}:coin-system`,
    name: 'Sample coin system',
    kind: 'system',
    specimen: true,
    params: [
      { kind: 'number', id: 'per-pickup', label: 'Coins per pickup', value: 5, min: 1, max: 100, step: 1 },
      { kind: 'number', id: 'respawn', label: 'Time to come back', value: 30, min: 1, max: 300, step: 0.5, unit: 'seconds' },
      { kind: 'toggle', id: 'save', label: 'Keep coins between visits', value: true },
      { kind: 'text', id: 'currency', label: 'Currency name', value: 'Coins', maxLength: 16 },
    ],
  },
  {
    id: `${PIECES_STUB_MARKER}:lava-zone`,
    name: 'Sample lava zone',
    kind: 'zone',
    specimen: true,
    params: [
      { kind: 'number', id: 'damage', label: 'Damage each second', value: 25, min: 1, max: 100, step: 1 },
      { kind: 'colour', id: 'glow', label: 'Glow colour', value: '#ff5a1f' },
      { kind: 'toggle', id: 'checkpoint', label: 'Return to the last checkpoint', value: true },
      { kind: 'text', id: 'sign', label: 'Warning sign', value: 'Hot floor', maxLength: 24 },
    ],
  },
];
