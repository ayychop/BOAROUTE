import { Text, type TextProps, type TextStyle } from 'react-native';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const VARIANTS = {
  hero: { fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 36, letterSpacing: 0.5 },
  display: { fontFamily: fonts.display, fontSize: 23, lineHeight: 29, letterSpacing: 0.4 },
  title: { fontFamily: fonts.display, fontSize: 17, lineHeight: 23, letterSpacing: 0.3 },
  heading: { fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  strong: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fonts.displayMedium, fontSize: 10.5, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' },
  caption: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 18 },
  metric: { fontFamily: fonts.displayHeavy, fontSize: 26, lineHeight: 32 },
} satisfies Record<string, TextStyle>;

export type TxtVariant = keyof typeof VARIANTS;
export type TxtTone = 'default' | 'dim' | 'faint' | 'primary' | 'gold' | 'danger' | 'success' | 'warning' | 'onPrimary' | 'onGold';

export interface TxtProps extends TextProps {
  variant?: TxtVariant;
  tone?: TxtTone;
  align?: TextStyle['textAlign'];
  glow?: boolean;
}

export function Txt({ variant = 'body', tone = 'default', align, glow, style, maxFontSizeMultiplier = 1.3, ...rest }: TxtProps) {
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
    glow && palette.phase !== 'dawn'
      ? { textShadowColor: tone === 'gold' ? palette.goldGlow : palette.glow, textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } }
      : null;

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[{ ...v, fontSize: v.fontSize * scale, lineHeight: v.lineHeight * scale, color, textAlign: align }, glowStyle, style]}
      {...rest}
    />
  );
}
