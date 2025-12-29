/**
 * Mimir theme color constants
 * Nordic/cold blue palette for use across the entire CLI
 */

export const MimirColors = {
  // Polar Night (dark backgrounds)
  polarNight1: '#2E3440',
  polarNight2: '#3B4252',
  polarNight3: '#434C5E',
  polarNight4: '#4C566A',

  // Snow Storm (light foregrounds)
  snowStorm1: '#D8DEE9',
  snowStorm2: '#E5E9F0',
  snowStorm3: '#ECEFF4',

  // Frost (blues/cyans)
  frost1: '#8FBCBB', // Cyan
  frost2: '#88C0D0', // Bright Cyan
  frost3: '#81A1C1', // Blue
  frost4: '#5E81AC', // Dark Blue

  // Aurora (accent colors)
  auroraRed: '#BF616A',
  auroraOrange: '#D08770',
  auroraYellow: '#EBCB8B',
  auroraGreen: '#A3BE8C',
  auroraPurple: '#B48EAD',
} as const;

export type MimirColor = (typeof MimirColors)[keyof typeof MimirColors];
