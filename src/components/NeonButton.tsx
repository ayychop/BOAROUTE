import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
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

  const height = (size === 'lg' ? 56 : size === 'sm' ? 38 : 48) - (compact ? 4 : 0);
  const filled = variant === 'primary' || variant === 'gold' || variant === 'danger';
  const base = variant === 'gold' ? palette.gold : variant === 'danger' ? palette.danger : palette.primary;
  const textTone = variant === 'gold' ? 'onGold' : variant === 'primary' ? 'onPrimary' : variant === 'danger' ? 'onPrimary' : variant === 'subtle' ? 'default' : 'primary';
  const iconColor = variant === 'gold' ? palette.goldText : variant === 'primary' ? palette.primaryText : variant === 'danger' ? '#fff' : variant === 'subtle' ? palette.text : palette.primary;

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
    borderWidth: filled ? 0 : 1.5,
    borderColor: variant === 'subtle' ? palette.border : palette.borderStrong,
    backgroundColor: variant === 'subtle' ? palette.surface : 'transparent',
  };
  const glow: ViewStyle =
    filled && palette.phase !== 'dawn' && !inactive
      ? { shadowColor: base, shadowOpacity: 0.65, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8 }
      : {};

  return (
    <Animated.View style={[anim, glow, { borderRadius: radius.pill, alignSelf: full ? 'stretch' : 'auto' }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        disabled={inactive}
        onPressIn={() => s.set(withSpring(0.95, { damping: 18, stiffness: 420 }))}
        onPressOut={() => s.set(withSpring(1, { damping: 12, stiffness: 300 }))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        style={container}
        hitSlop={6}
      >
        {filled && (
          <LinearGradient
            colors={[base, variant === 'gold' ? '#FFE08A' : variant === 'danger' ? '#FF8FA3' : '#7AE7FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {filled && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />}
        {loading ? (
          <ActivityIndicator color={iconColor} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={iconColor} />}
            <Txt variant="strong" tone={textTone} numberOfLines={1} style={{ fontSize: size === 'sm' ? 14 : 16, letterSpacing: 0.6 }}>
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
