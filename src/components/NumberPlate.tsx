import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { plateFontSize } from '@/lib/preferences';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

const PLATE_YELLOW = '#F6C445';
const PLATE_INK = '#121212';
const BAND_BLUE = '#1F4AA8';
const SHEEN_PAUSE = 2000;
const SHEEN_SWEEP = 900;

/**
 * A soft diagonal glint that sweeps across the yellow every couple of seconds,
 * like light catching the acrylic. Held still when Reduce Motion is on.
 */
function Sheen({ height }: { height: number }) {
  const reduced = useReducedMotion();
  const areaWidth = useSharedValue(0);
  const t = useSharedValue(0);
  const sheenWidth = height * 1.1;

  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withDelay(SHEEN_PAUSE, withTiming(1, { duration: SHEEN_SWEEP, easing: Easing.inOut(Easing.quad) })), -1, false));
    return () => cancelAnimation(t);
  }, [reduced, t]);

  const style = useAnimatedStyle(() => {
    const from = -sheenWidth * 1.5;
    const to = areaWidth.get() + sheenWidth * 0.5;
    return { transform: [{ translateX: from + (to - from) * t.get() }, { rotate: '20deg' }] };
  });

  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => areaWidth.set(e.nativeEvent.layout.width)}>
      <Animated.View style={[{ position: 'absolute', top: -height, bottom: -height, width: sheenWidth, opacity: 0.3 }, style]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', '#FFFFFF', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/**
 * A UK rear number plate showing the driver's name (SARAH, JO, DAVID), with
 * the blue UK band. Scales from a badge on a card to the hero on Your vehicle.
 * `sheen` adds the sweeping glass reflection used on the Home car card.
 *
 * It never squashes: given `maxWidth`, the whole plate scales down at the real
 * 4.4:1 proportion instead of the yellow narrowing while the height stays.
 */
export function NumberPlate({ text, height: wanted = 30, maxWidth, sheen = false }: { text: string; height?: number; maxWidth?: number; sheen?: boolean }) {
  const label = text.toUpperCase().slice(0, 8) || 'BOA';
  const height = maxWidth ? Math.max(16, Math.min(wanted, maxWidth / 4.4)) : wanted;
  // Real UK plate proportions, so a short name and KMKM25ML sit on the same size plate.
  const width = height * 4.4;
  const band = height * 0.48;
  const border = Math.max(1, height * 0.05);
  const padding = height * 0.1;
  // Letters fill the yellow almost to the border, like a pressed plate rather than a sticker.
  const fontSize = plateFontSize(label, width - band - border * 2 - padding * 2, height, 0.8);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Number plate reading ${label}`}
      style={{
        width,
        height,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderRadius: height * 0.14,
        backgroundColor: PLATE_YELLOW,
        borderWidth: border,
        borderColor: PLATE_INK,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      <View style={{ width: band, backgroundColor: BAND_BLUE, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: height * 0.08 }}>
        <Txt style={{ color: '#FFFFFF', fontFamily: fonts.bodyBold, fontSize: height * 0.24, lineHeight: height * 0.28 }} maxFontSizeMultiplier={1}>
          UK
        </Txt>
      </View>
      <View style={{ flex: 1, paddingHorizontal: padding, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Txt
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          maxFontSizeMultiplier={1}
          style={{ color: PLATE_INK, fontFamily: fonts.bodyBold, fontSize, lineHeight: fontSize * 1.05, letterSpacing: fontSize * 0.03, textAlign: 'center', includeFontPadding: false, textAlignVertical: 'center' }}
        >
          {label}
        </Txt>
        {sheen && <Sheen height={height} />}
      </View>
    </View>
  );
}
