import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { getPref, setPref } from '@/lib/prefs';
import { CURRENT_RELEASE, WHATS_NEW_PREF, shouldShowWhatsNew } from '@/lib/whats-new';
import { COCKPIT_INK } from '@/theme/palettes';
import { radius, springs } from '@/theme/typography';
import { BRLogo } from './BRLogo';
import { PremiumButton } from './PremiumButton';
import { Txt } from './Txt';

/**
 * "What's new" card, shown once the first time the app opens after an
 * install or update. Close it with the cross, a tap outside, the back
 * button, or Let's go.
 */
export function WhatsNew() {
  const { insets, height, width } = useLayout();
  const [open, setOpen] = useState(() => shouldShowWhatsNew(getPref(WHATS_NEW_PREF)));
  const close = () => {
    Haptics.selectionAsync().catch(() => {});
    setPref(WHATS_NEW_PREF, CURRENT_RELEASE.id);
    setOpen(false);
  };
  if (!open) return null;

  const cardW = Math.min(width - 32, 460);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,3,4,0.78)' }]} onPress={close} accessibilityRole="button" accessibilityLabel="Close what's new" />
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
        <Animated.View
          entering={ZoomIn.springify().damping(springs.settle.damping)}
          accessibilityViewIsModal
          style={{ width: cardW, maxHeight: height - insets.top - insets.bottom - 32, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(232,207,148,0.45)', backgroundColor: '#0B0B0C' }}
        >
          <LinearGradient colors={['rgba(232,207,148,0.22)', 'rgba(11,11,12,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 0.6 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Ionicons name="close" size={20} color={COCKPIT_INK.text} />
          </Pressable>

          <View style={{ alignItems: 'center', paddingTop: 26, paddingHorizontal: 24 }}>
            <BRLogo size={46} animated />
            <Txt variant="label" style={{ color: COCKPIT_INK.gold, marginTop: 14, letterSpacing: 2 }}>
              What&apos;s new in BOAROUTE
            </Txt>
            <Txt variant="display" align="center" style={{ color: COCKPIT_INK.text, marginTop: 4 }} accessibilityRole="header">
              {CURRENT_RELEASE.title}
            </Txt>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 20, gap: 10 }} showsVerticalScrollIndicator={false}>
            {CURRENT_RELEASE.highlights.map((h, i) => (
              <Animated.View
                key={h.title}
                entering={FadeInDown.delay(180 + i * 70).springify().damping(springs.settle.damping)}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: COCKPIT_INK.border }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(232,207,148,0.14)', borderWidth: 1, borderColor: 'rgba(232,207,148,0.5)' }}>
                  <Ionicons name={h.icon} size={18} color={COCKPIT_INK.gold} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="strong" style={{ color: COCKPIT_INK.text }}>
                    {h.title}
                  </Txt>
                  <Txt variant="caption" style={{ color: COCKPIT_INK.dim, marginTop: 2 }}>
                    {h.body}
                  </Txt>
                </View>
              </Animated.View>
            ))}
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <PremiumButton label="Let's go" icon="arrow-forward" variant="gold" size="lg" onPress={close} onDark full />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
