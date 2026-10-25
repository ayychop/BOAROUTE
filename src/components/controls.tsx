import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { forwardRef, useState } from 'react';
import { Pressable, Switch, TextInput, View, type TextInputInstance, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/typography';
import { Txt } from './Txt';

const tap = () => Haptics.selectionAsync().catch(() => {});

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const Field = forwardRef<TextInputInstance, FieldProps>(function Field({ label, hint, error, icon, style, multiline, ...rest }, ref) {
  const { palette } = useTheme();
  const { scale } = useLayout();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Txt variant="label" tone={error ? 'danger' : focused ? 'primary' : 'dim'} style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 10,
          backgroundColor: palette.inputBg,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: error ? palette.danger : focused ? palette.borderStrong : palette.border,
          paddingHorizontal: 14,
          minHeight: multiline ? 110 : 50,
          paddingVertical: multiline ? 12 : 0,
        }}
      >
        {icon && <Ionicons name={icon} size={18} color={focused ? palette.primary : palette.textFaint} style={multiline ? { marginTop: 2 } : undefined} />}
        <TextInput
          ref={ref}
          placeholderTextColor={palette.textFaint}
          selectionColor={palette.primary}
          cursorColor={palette.primary}
          maxFontSizeMultiplier={1.3}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[{ flex: 1, color: palette.text, fontFamily: fonts.bodySemi, fontSize: 17 * scale, paddingVertical: multiline ? 0 : 12, minHeight: multiline ? 86 : undefined }, style]}
          {...rest}
        />
      </View>
      {error ? (
        <Txt variant="caption" tone="danger" style={{ marginTop: 4 }}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" tone="faint" style={{ marginTop: 4 }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

export function Chip({
  label,
  active,
  onPress,
  icon,
  tone = 'primary',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'primary' | 'gold';
}) {
  const { palette } = useTheme();
  const accent = tone === 'gold' ? palette.gold : palette.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        height: 36,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: active ? accent : palette.border,
        backgroundColor: active ? (tone === 'gold' ? palette.goldGlow : palette.glow) : palette.surface,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon && <Ionicons name={icon} size={15} color={active ? palette.text : palette.textDim} />}
      <Txt variant="strong" tone={active ? 'default' : 'dim'} style={{ fontSize: 14 }} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Segmented control with a sliding gold thumb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  big,
  style,
}: {
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (v: T) => void;
  big?: boolean;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = w / options.length;
  const thumb = useAnimatedStyle(() => ({
    width: segW - 6,
    transform: [{ translateX: withSpring(idx * segW + 3, { damping: 18, stiffness: 220 }) }],
  }));
  const height = big ? 62 : 44;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      style={[{ height, borderRadius: radius.pill, backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', overflow: 'hidden' }, style]}
    >
      {w > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 3,
              bottom: 3,
              borderRadius: radius.pill,
              backgroundColor: palette.primary,
              shadowColor: palette.primary,
              shadowOpacity: 0.35,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
              elevation: 6,
            },
            thumb,
          ]}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 4 }}
          >
            {o.icon && <Ionicons name={o.icon} size={big ? 22 : 16} color={active ? palette.primaryText : palette.textDim} />}
            <Txt variant={big ? 'title' : 'strong'} tone={active ? 'onPrimary' : 'dim'} numberOfLines={1} style={big ? undefined : { fontSize: 14 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, max = 12, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  const { palette } = useTheme();
  const btn = (icon: 'remove' | 'add', next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${icon === 'add' ? 'Increase' : 'Decrease'} ${label}`}
      disabled={disabled}
      onPress={() => {
        tap();
        onChange(next);
      }}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: disabled ? palette.border : palette.borderStrong,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={palette.primary} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityLabel={`${label}: ${value}`}>
      {btn('remove', Math.max(min, value - 1), value <= min)}
      <Txt variant="metric" style={{ minWidth: 36 }} align="center">
        {value}
      </Txt>
      {btn('add', Math.min(max, value + 1), value >= max)}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="strong">{label}</Txt>
        {hint ? (
          <Txt variant="caption" tone="faint">
            {hint}
          </Txt>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={(v) => {
          tap();
          onChange(v);
        }}
        trackColor={{ false: palette.border, true: palette.primary }}
        thumbColor={value ? palette.gold : palette.textFaint}
      />
    </View>
  );
}

/** Animated horizontal progress bar. */
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { palette } = useTheme();
  const fill = useAnimatedStyle(() => ({ width: withTiming(`${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, { duration: 700 }) }));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.border, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: color ?? palette.primary }, fill]} />
    </View>
  );
}
