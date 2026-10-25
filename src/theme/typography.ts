export const fonts = {
  /** Cormorant Garamond: the luxury display serif. */
  display: 'CormorantGaramond_600SemiBold',
  displayHeavy: 'CormorantGaramond_700Bold',
  displayItalic: 'CormorantGaramond_500Medium_Italic',
  /** Manrope: clean modern sans for labels, body and numbers. */
  label: 'Manrope_600SemiBold',
  body: 'Manrope_400Regular',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  numeric: 'Manrope_300Light',
  numericMedium: 'Manrope_500Medium',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

/** Shared spring presets so every press and entrance moves the same way. */
export const springs = {
  press: { damping: 22, stiffness: 380, mass: 0.6 },
  release: { damping: 16, stiffness: 260, mass: 0.6 },
  settle: { damping: 20, stiffness: 160 },
} as const;
