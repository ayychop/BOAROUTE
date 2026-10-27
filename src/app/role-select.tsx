import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BRLogo } from '@/components/BRLogo';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import type { UserRole } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, springs } from '@/theme/typography';

const ROLES: { role: UserRole; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { role: 'OM', label: 'I am an OM', detail: '1 visit per store each week, 2 at D grade stores.', icon: 'briefcase' },
  { role: 'OTM', label: 'I am an OTM', detail: 'Visit to your monthly targets, with no weekly limit.', icon: 'storefront' },
];

/** Shown once, straight after sign-in, until the person picks OM or OTM. The app opens once it is saved. */
export default function RoleSelect() {
  const { setUserRole, signOut } = useAuth();
  const { compact } = useLayout();
  const [saving, setSaving] = useState<UserRole | null>(null);

  const save = async (role: UserRole) => {
    setSaving(role);
    try {
      await setUserRole(role);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // The root layout's guard moves on as soon as the profile has a role.
    } catch (e) {
      Alert.alert('Role not saved', e instanceof Error && e.message ? e.message : 'Check your connection and try again.');
      setSaving(null);
    }
  };

  // Only the admin can change it afterwards, so confirm before saving.
  const pick = (role: UserRole) => {
    if (saving) return;
    Alert.alert(`Continue as ${role}?`, 'Your admin can change this for you later if it is wrong.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: () => save(role) },
    ]);
  };

  return (
    <Screen>
      <Animated.View entering={FadeInUp.duration(600)} style={{ alignItems: 'center', marginTop: compact ? 4 : 24, marginBottom: compact ? 18 : 28 }}>
        <BRLogo size={compact ? 72 : 96} />
        <Txt variant="label" tone="gold" style={{ marginTop: 16 }}>
          One last thing
        </Txt>
        <Txt variant="display" align="center" style={{ marginTop: 6 }}>
          Choose your role
        </Txt>
        <Txt variant="body" tone="dim" align="center" style={{ marginTop: 8, maxWidth: 360 }}>
          This sets how often you can log visits to each store.
        </Txt>
      </Animated.View>

      <View style={{ gap: 14, width: '100%', maxWidth: 460, alignSelf: 'center' }} accessibilityRole="radiogroup">
        {ROLES.map((r, i) => (
          <Animated.View key={r.role} entering={FadeInDown.delay(150 + i * 120).duration(560)}>
            <RoleButton {...r} busy={saving === r.role} disabled={!!saving && saving !== r.role} onPress={() => pick(r.role)} />
          </Animated.View>
        ))}
      </View>

      <View style={{ alignItems: 'center', marginTop: 24 }}>
        <NeonButton label="Sign out" icon="log-out-outline" variant="ghost" size="sm" onPress={() => signOut().catch(() => {})} disabled={!!saving} />
      </View>
    </Screen>
  );
}

/** A tall metallic-rimmed glass button with an icon medallion, label and one line of detail. */
function RoleButton({ label, detail, icon, busy, disabled, onPress }: { label: string; detail: string; icon: keyof typeof Ionicons.glyphMap; busy: boolean; disabled: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  const { compact } = useLayout();
  const scale = useSharedValue(1);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[press, { borderRadius: radius.lg, shadowColor: palette.gold, shadowOpacity: disabled ? 0 : 0.25, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityHint={detail}
        accessibilityState={{ disabled: disabled || busy, busy, checked: busy }}
        disabled={disabled || busy}
        onPressIn={() => scale.set(withSpring(0.97, springs.press))}
        onPressOut={() => scale.set(withSpring(1, springs.release))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        style={{
          minHeight: compact ? 104 : 124,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: palette.gold,
          backgroundColor: palette.surfaceStrong,
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          paddingHorizontal: compact ? 16 : 22,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <LinearGradient pointerEvents="none" colors={[palette.gold + '2E', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 1, backgroundColor: palette.surfaceHighlight }} />
        <View style={{ width: 56, height: 56, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <LinearGradient colors={palette.goldMetal} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
          <Ionicons name={icon} size={26} color={palette.goldText} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="title" maxFontSizeMultiplier={1.2}>
            {label}
          </Txt>
          <Txt variant="caption" tone="dim" maxFontSizeMultiplier={1.2}>
            {detail}
          </Txt>
        </View>
        {busy ? <ActivityIndicator color={palette.gold} /> : <Ionicons name="chevron-forward" size={22} color={palette.gold} />}
      </Pressable>
    </Animated.View>
  );
}
