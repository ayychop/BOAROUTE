import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const VARIANTS = {
  hero: { fontFamily: fonts.displayHeavy, fontSize: 36, lineHeight: 40, letterSpacing: 0.2 },
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 35, letterSpacing: 0.2 },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, letterSpacing: 0.2 },
  heading: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23 },
  strong: { fontFamily: fonts.bodySemi, fontSize: 15.5, lineHeight: 22 },
  label: { fontFamily: fonts.label, fontSize: 10.5, lineHeight: 14, letterSpacing: 2, textTransform: 'uppercase' },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  metric: { fontFamily: fonts.numeric, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type TxtVariant = keyof typeof VARIANTS;
export type TxtTone = 'default' | 'dim' | 'faint' | 'primary' | 'gold' | 'danger' | 'success' | 'warning' | 'onPrimary' | 'onGold';

export interface TxtProps extends TextProps {
  variant?: TxtVariant;
  tone?: TxtTone;
  align?: TextStyle['textAlign'];
  glow?: boolean;
}

/**
 * Android measures text before applying textTransform, so uppercase labels are
 * laid out at their narrower lowercase width and spill into their neighbours.
 * Uppercasing the string itself keeps measurement and drawing in agreement.
 */
function upper(node: ReactNode): ReactNode {
  if (typeof node === 'string') return node.toUpperCase();
  if (Array.isArray(node)) return node.map(upper);
  return node;
}

export function Txt({ variant = 'body', tone = 'default', align, glow, style, maxFontSizeMultiplier = 1.3, children, ...rest }: TxtProps) {
  const { palette } = useTheme();
  const { scale } = useLayout();
  const v = VARIANTS[variant];
  const color = {
    default: palette.text,
    dim: palette.textDim,
    faint: palette.textFaint,
    primary: palette.primary,
    gold: palette.gold,
    danger: palette.danger,
    success: palette.success,
    warning: palette.warning,
    onPrimary: palette.primaryText,
    onGold: palette.goldText,
  }[tone];
  const glowStyle: TextStyle | null =
    glow
      ? { textShadowColor: tone === 'gold' || tone === 'primary' ? palette.goldGlow : 'rgba(255,240,210,0.18)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } }
      : null;

  const flat = StyleSheet.flatten(style);
  const uppercase = (flat?.textTransform ?? ('textTransform' in v ? v.textTransform : undefined)) === 'uppercase';

  // flexShrink lets text give way inside rows instead of pushing past the card edge.
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[{ flexShrink: 1, ...v, fontSize: v.fontSize * scale, lineHeight: v.lineHeight * scale, color, textAlign: align }, glowStyle, style, uppercase && { textTransform: 'none' }]}
      {...rest}
    >
      {uppercase ? upper(children) : children}
    </Text>
  );
}
