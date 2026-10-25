import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, springs } from '@/theme/typography';
import { Txt } from './Txt';

type Variant = 'primary' | 'gold' | 'ghost' | 'danger' | 'subtle';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityHint?: string;
}

export function NeonButton({ label, onPress, variant = 'primary', icon, loading, disabled, size = 'md', style, full, accessibilityHint }: Props) {
  const { palette } = useTheme();
  const { compact } = useLayout();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const inactive = disabled || loading;

  const height = (size === 'lg' ? 56 : size === 'sm' ? 40 : 50) - (compact ? 4 : 0);
  const filled = variant === 'primary' || variant === 'gold' || variant === 'danger';
  const base = variant === 'gold' ? palette.gold : variant === 'danger' ? palette.danger : palette.primary;
  const textTone = variant === 'gold' ? 'onGold' : variant === 'primary' ? 'onPrimary' : variant === 'danger' ? 'onPrimary' : variant === 'subtle' ? 'default' : 'primary';
  const iconColor = variant === 'gold' ? palette.goldText : variant === 'primary' ? palette.primaryText : variant === 'danger' ? palette.primaryText : variant === 'subtle' ? palette.gold : palette.primary;
  // Metallic gold: highlight, body, shadow, like brushed metal under a spotlight.
  const metal: readonly [string, string, string] =
    variant === 'danger' ? ['#F2A394', palette.danger, '#A9483A'] : variant === 'gold' ? palette.goldMetal : [palette.gold, palette.primary, palette.primaryDeep];

  const container: ViewStyle = {
    height,
    minWidth: height,
    borderRadius: radius.pill,
    paddingHorizontal: size === 'sm' ? 14 : 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    opacity: inactive ? 0.55 : 1,
    alignSelf: full ? 'stretch' : 'auto',
    borderWidth: filled ? 0 : StyleSheet.hairlineWidth * 2,
    borderColor: variant === 'subtle' ? palette.border : palette.borderStrong,
    backgroundColor: variant === 'subtle' ? palette.surface : 'transparent',
  };
  const glow: ViewStyle = filled && !inactive ? { shadowColor: base, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : {};

  return (
    <Animated.View style={[anim, glow, { borderRadius: radius.pill, alignSelf: full ? 'stretch' : 'auto' }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        disabled={inactive}
        onPressIn={() => s.set(withSpring(0.96, springs.press))}
        onPressOut={() => s.set(withSpring(1, springs.release))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        style={container}
        hitSlop={6}
      >
        {filled && (
          <LinearGradient colors={metal} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        {filled && <View style={{ position: 'absolute', top: 0, left: 18, right: 18, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' }} />}
        {loading ? (
          <ActivityIndicator color={iconColor} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={iconColor} />}
            <Txt variant="strong" tone={textTone} numberOfLines={1} style={{ fontSize: size === 'sm' ? 13.5 : 15, letterSpacing: 0.8 }}>
              {label}
            </Txt>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Round icon-only button. */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'default',
  size = 40,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  tone?: 'default' | 'primary' | 'gold' | 'danger';
  size?: number;
}) {
  const { palette } = useTheme();
  const color = tone === 'primary' ? palette.primary : tone === 'gold' ? palette.gold : tone === 'danger' ? palette.danger : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.92 : 1 }],
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={size * 0.48} color={color} />
    </Pressable>
  );
}
