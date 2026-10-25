import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { HAZARD_TYPES, hazardMeta, reportedAgo, type HazardReport, type HazardType } from '@/lib/hazards';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { NeonButton } from './NeonButton';
import { Txt } from './Txt';

/** Slide-up sheet over the map. Opaque, so it reads clearly over any map tile. */
export function BottomSheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const { palette } = useTheme();
  const { insets, gutter } = useLayout();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]} onPress={onClose} />
      <View style={{ flex: 1 }} pointerEvents="box-none" />
      <View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={{
          backgroundColor: palette.surfaceStrong,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: palette.borderStrong,
          paddingTop: 10,
          paddingHorizontal: Math.max(gutter, insets.left + 12, insets.right + 12),
          paddingBottom: insets.bottom + 20,
          width: '100%',
          maxWidth: 640,
          alignSelf: 'center',
        }}
      >
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: palette.border, marginBottom: 14 }} />
        {children}
      </View>
    </Modal>
  );
}

/** Custom map marker: a coloured disc with the hazard's icon. */
export function HazardPin({ type }: { type: HazardType }) {
  const meta = hazardMeta(type);
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: meta.color, borderWidth: 3, borderColor: '#0B0B0C', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={meta.icon} size={19} color="#0B0B0C" />
    </View>
  );
}

/** Four large report options, sized to hit at a glance from the driver's seat. */
export function ReportSheet({ open, onClose, onPick, busy }: { open: boolean; onClose: () => void; onPick: (type: HazardType) => void; busy: HazardType | null }) {
  const { palette } = useTheme();
  return (
    <BottomSheet open={open} onClose={onClose} label="Report a hazard">
      <Txt variant="title" style={{ marginBottom: 4 }}>
        Report
      </Txt>
      <Txt variant="caption" tone="faint" style={{ marginBottom: 16 }}>
        Pinned where you are now and shared with the team for two hours.
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {HAZARD_TYPES.map((h) => (
          <Pressable
            key={h.type}
            accessibilityRole="button"
            accessibilityLabel={`Report ${h.label}`}
            disabled={!!busy}
            onPress={() => onPick(h.type)}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexBasis: '45%',
              minHeight: 112,
              borderRadius: radius.lg,
              backgroundColor: palette.surface,
              borderWidth: 2,
              borderColor: busy === h.type ? h.color : palette.border,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 12,
              opacity: busy && busy !== h.type ? 0.5 : pressed ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: h.color, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={h.icon} size={26} color="#0B0B0C" />
            </View>
            <Txt variant="strong" align="center" numberOfLines={2}>
              {busy === h.type ? 'Sending...' : h.label}
            </Txt>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

/** Details for a tapped hazard with one large "Not There" action. */
export function HazardSheet({ hazard, onClose, onClear, busy }: { hazard: HazardReport | null; onClose: () => void; onClear: () => void; busy: boolean }) {
  const meta = hazard ? hazardMeta(hazard.hazard_type) : null;
  return (
    <BottomSheet open={!!hazard} onClose={onClose} label="Hazard details">
      {hazard && meta ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <HazardPin type={hazard.hazard_type} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="title" numberOfLines={1}>
                {meta.label}
              </Txt>
              <Txt variant="caption" tone="faint">
                Reported {reportedAgo(hazard.created_at).toLowerCase()}
              </Txt>
            </View>
          </View>
          <NeonButton label="Not There · Clear Hazard" icon="close-circle" variant="gold" size="lg" onPress={onClear} loading={busy} full />
          <NeonButton label="Still there" variant="ghost" onPress={onClose} full style={{ marginTop: 10 }} />
        </>
      ) : null}
    </BottomSheet>
  );
}

/** Short confirmation that fades away on its own. */
export function Toast({ message, onHide, top }: { message: string | null; onHide: () => void; top: number }) {
  const { palette } = useTheme();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, 2800);
    return () => clearTimeout(t);
  }, [message, onHide]);
  if (!message) return null;
  return (
    <Animated.View
      key={message}
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutUp.duration(200)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        top,
        left: 16,
        right: 16,
        alignItems: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.borderStrong }}>
        <Ionicons name="checkmark-circle" size={20} color={palette.success} />
        <Txt variant="strong" style={{ fontSize: 14 }}>
          {message}
        </Txt>
      </View>
    </Animated.View>
  );
}
