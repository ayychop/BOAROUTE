import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { springs } from '@/theme/typography';
import { Txt } from './Txt';

/**
 * gold     solid metallic gold, black text (the main action)
 * outline  transparent with a fine gold rim, gold text
 * danger   dark glass with a red rim and glow (End, Delete)
 * subtle   quiet glass with a hairline rim, for tertiary actions
 * primary / ghost are kept for older call sites and map to gold / outline.
 */
export type PremiumVariant = 'gold' | 'outline' | 'danger' | 'subtle' | 'primary' | 'ghost';

export interface PremiumButtonProps {
  label: string;
  onPress: () => void;
  variant?: PremiumVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityHint?: string;
  /** Keep the dark cockpit look whatever the ambiance (buttons over the map). */
  onDark?: boolean;
}

/** One radius for every button in the app. */
export const BUTTON_RADIUS = 14;

const DANGER_RED = '#E4806F';

export function PremiumButton({ label, onPress, variant = 'gold', icon, loading, disabled, size = 'md', style, full, accessibilityHint, onDark = false }: PremiumButtonProps) {
  const { palette } = useTheme();
  const { compact } = useLayout();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const inactive = disabled || loading;

  const kind = variant === 'primary' ? 'gold' : variant === 'ghost' ? 'outline' : variant;
  const gold = onDark ? '#E8CF94' : palette.gold;
  const height = (size === 'lg' ? 56 : size === 'sm' ? 40 : 50) - (compact ? 4 : 0);

  const fg = kind === 'gold' ? palette.goldText : kind === 'danger' ? DANGER_RED : kind === 'outline' ? gold : onDark ? '#F5F0E6' : palette.text;
  const rim = kind === 'danger' ? DANGER_RED : kind === 'outline' ? gold : onDark ? 'rgba(232,207,148,0.28)' : palette.borderStrong;
  // Dark glass on the dark ambiances and the map; a clean red rim on the light one.
  const fill = kind === 'danger' ? (onDark || palette.statusBar === 'light' ? 'rgba(20,10,9,0.78)' : 'transparent') :kind === 'subtle' ? (onDark ? 'rgba(18,17,16,0.78)' : palette.surface) : 'transparent';

  const container: ViewStyle = {
    height,
    minWidth: height,
    borderRadius: BUTTON_RADIUS,
    paddingHorizontal: size === 'sm' ? 14 : 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    opacity: inactive ? 0.5 : 1,
    alignSelf: full ? 'stretch' : 'auto',
    borderWidth: kind === 'gold' ? 0 : kind === 'subtle' ? StyleSheet.hairlineWidth * 2 : 1,
    borderColor: rim,
    backgroundColor: fill,
  };
  const glowColor = kind === 'gold' ? gold : kind === 'danger' ? DANGER_RED : null;
  const glow: ViewStyle = glowColor && !inactive ? { shadowColor: glowColor, shadowOpacity: kind === 'danger' ? 0.5 : 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: kind === 'danger' ? 8 : 6 } : {};

  return (
    <Animated.View style={[anim, glow, { borderRadius: BUTTON_RADIUS, alignSelf: full ? 'stretch' : 'auto' }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        disabled={inactive}
        onPressIn={() => s.set(withSpring(0.96, springs.press))}
        onPressOut={() => s.set(withSpring(1, springs.release))}
        onPress={() => {
          Haptics.impactAsync(kind === 'danger' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        style={container}
        hitSlop={6}
      >
        {kind === 'gold' && <LinearGradient colors={onDark ? ['#FFF1C9', '#E8CF94', '#B8954F'] : palette.goldMetal} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />}
        {kind === 'gold' && <View style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 1, backgroundColor: 'rgba(255,255,255,0.5)' }} />}
        {kind === 'danger' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: DANGER_RED, opacity: 0.1 }]} />}
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={fg} />}
            <Txt variant="strong" numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ color: fg, fontSize: size === 'sm' ? 13.5 : 15, letterSpacing: 0.6 }}>
              {label}
            </Txt>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Round icon-only button: glass with a fine gold rim and a spring press. */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'default',
  size = 40,
  onDark = false,
  solid = false,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  tone?: 'default' | 'primary' | 'gold' | 'danger';
  size?: number;
  /** Cockpit look over the map, whatever the ambiance. */
  onDark?: boolean;
  /** Solid metallic gold with a black icon (the one key action in a group). */
  solid?: boolean;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const gold = onDark ? '#E8CF94' : palette.gold;
  const color = solid ? '#17120A' : tone === 'primary' ? palette.primary : tone === 'gold' ? gold : tone === 'danger' ? DANGER_RED : onDark ? '#F5F0E6' : palette.text;
  return (
    <Animated.View
      style={[
        anim,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.4 : 1 },
        onDark || solid ? { shadowColor: solid ? gold : '#000000', shadowOpacity: solid ? 0.45 : 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 } : null,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => s.set(withSpring(0.92, springs.press))}
        onPressOut={() => s.set(withSpring(1, springs.release))}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        hitSlop={8}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: solid ? 'transparent' : onDark ? 'rgba(18,17,16,0.86)' : palette.surface,
          borderWidth: solid ? 0 : 1,
          borderColor: onDark ? 'rgba(232,207,148,0.4)' : palette.border,
        }}
      >
        {solid && <LinearGradient colors={['#FFF1C9', '#E8CF94', '#B8954F']} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />}
        <Ionicons name={icon} size={size * 0.46} color={color} />
      </Pressable>
    </Animated.View>
  );
}
