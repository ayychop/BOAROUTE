import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { Txt } from './Txt';

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/** Inline dropdown: tap to expand the options in place (no modal, works on tiny screens). */
export function Dropdown<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <View style={{ marginBottom: 14 }}>
      <Txt variant="label" tone={open ? 'primary' : 'dim'} style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      <View style={{ borderRadius: radius.md, borderWidth: 1.5, borderColor: open ? palette.borderStrong : palette.border, backgroundColor: palette.inputBg, overflow: 'hidden' }}>
        <Pressable
          accessibilityRole="combobox"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${label}: ${current.label}`}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setOpen((v) => !v);
          }}
          style={{ minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          {current.icon && <Ionicons name={current.icon} size={18} color={palette.primary} />}
          <Txt variant="strong" style={{ flex: 1 }}>
            {current.label}
          </Txt>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textDim} />
        </Pressable>
        {open && (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ borderTopWidth: 1, borderTopColor: palette.border }}>
            {options.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: active ? palette.glow : pressed ? palette.surface : 'transparent' })}
                >
                  {o.icon && <Ionicons name={o.icon} size={17} color={active ? palette.text : palette.textDim} />}
                  <View style={{ flex: 1 }}>
                    <Txt variant="strong">{o.label}</Txt>
                    {o.hint ? (
                      <Txt variant="caption" tone="faint">
                        {o.hint}
                      </Txt>
                    ) : null}
                  </View>
                  {active && <Ionicons name="checkmark" size={18} color={palette.primary} />}
                </Pressable>
              );
            })}
          </Animated.View>
        )}
      </View>
    </View>
  );
}
