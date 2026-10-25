import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { odometerDigits } from '@/lib/odometer';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/typography';
import { Txt } from './Txt';

/** Six-digit cockpit odometer. Digits that change roll in from below. */
export function Odometer({ value, size = 'md' }: { value: number | string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const { palette } = useTheme();
  const digits = odometerDigits(value);
  const cellW = size === 'lg' ? 38 : size === 'sm' ? 22 : 30;
  const cellH = Math.round(cellW * 1.36);
  const fontSize = Math.round(cellW * 0.82);
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={value === null || value === undefined ? 'Mileage not set' : `${digits.join('').replace(/^0+(?=\d)/, '')} miles`}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}
    >
      <View style={{ flexDirection: 'row', gap: size === 'sm' ? 3 : 4 }}>
        {digits.map((d, i) => (
          <View
            key={i}
            style={{
              width: cellW,
              height: cellH,
              borderRadius: size === 'sm' ? 5 : radius.sm - 2,
              backgroundColor: 'rgba(0,0,0,0.45)',
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: palette.border,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <View style={{ position: 'absolute', left: 0, right: 0, top: cellH / 2, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <Animated.Text
              key={`${i}-${d}`}
              entering={FadeInDown.duration(380)}
              maxFontSizeMultiplier={1}
              style={{ fontFamily: fonts.numeric, fontSize, color: i >= 4 ? palette.gold : palette.text, includeFontPadding: false }}
            >
              {d}
            </Animated.Text>
          </View>
        ))}
      </View>
      <Txt variant="label" tone="gold" style={{ marginBottom: 4 }}>
        mi
      </Txt>
    </View>
  );
}
