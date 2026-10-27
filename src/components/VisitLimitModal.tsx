import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { VISIT_LIMIT_MESSAGE } from '@/lib/visit-limits';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { NeonButton } from './NeonButton';
import { Txt } from './Txt';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Shown under the message, e.g. "Unlocks Monday". */
  footnote?: string;
}

/** Centred glass pop-up for an OM going over their weekly visit limit at a store. */
export function VisitLimitModal({ open, onClose, footnote }: Props) {
  const { palette } = useTheme();
  const { gutter } = useLayout();

  useEffect(() => {
    if (open) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [open]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: gutter }} pointerEvents="box-none">
        <Animated.View
          entering={ZoomIn.springify().damping(14)}
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={`Visit limit reached. ${VISIT_LIMIT_MESSAGE}`}
          style={{
            width: '100%',
            maxWidth: 400,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: palette.gold,
            backgroundColor: palette.surfaceStrong,
            overflow: 'hidden',
            paddingHorizontal: 22,
            paddingTop: 28,
            paddingBottom: 22,
            alignItems: 'center',
            shadowColor: palette.gold,
            shadowOpacity: 0.3,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <LinearGradient pointerEvents="none" colors={[palette.gold + '24', 'rgba(255,255,255,0)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }} style={StyleSheet.absoluteFill} />
          <View style={{ width: 68, height: 68, borderRadius: 34, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <LinearGradient colors={palette.goldMetal} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="lock-closed" size={30} color={palette.goldText} />
          </View>
          <Txt variant="title" align="center" style={{ marginBottom: 8 }}>
            Weekly limit reached
          </Txt>
          <Txt variant="body" tone="dim" align="center">
            {VISIT_LIMIT_MESSAGE}
          </Txt>
          {footnote ? (
            <Txt variant="caption" tone="gold" align="center" style={{ marginTop: 10 }}>
              {footnote}
            </Txt>
          ) : null}
          <NeonButton label="Got it" icon="checkmark" variant="gold" onPress={onClose} style={{ marginTop: 20 }} full />
        </Animated.View>
      </View>
    </Modal>
  );
}
