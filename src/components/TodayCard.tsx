import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useNow } from '@/hooks/useNow';
import type { DueStore } from '@/lib/route-engine';
import type { Store } from '@/lib/types';
import { isVisitLimitError, VISIT_LIMIT_MESSAGE } from '@/lib/visit-limits';
import { formatCountdown, formatDuration, lockRemainingMs, MIN_VISIT_MS, type ActiveVisit } from '@/lib/visit-timer';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { GlassCard } from './GlassCard';
import { NeonButton } from './NeonButton';
import { Txt } from './Txt';

interface Props {
  activeVisit: ActiveVisit | null;
  /** Name of the store being visited. */
  visitStore: Pick<Store, 'id' | 'name'> | null;
  /** The most pressing store to visit next. */
  next: DueStore<Store> | null;
  workingToday: boolean;
  /** e.g. "12 of 30 visits · 18 owed". */
  progressLine: string;
  startVisit: (storeId: string) => Promise<void>;
  completeVisit: () => Promise<{ storeId: string; minutes: number }>;
}

/**
 * The first thing on Home: what to do right now. With a visit running it is
 * the 25-minute countdown and End Visit; otherwise the next store with Start
 * Visit and today's route. The same buttons Android Auto shows on the car.
 */
export function TodayCard({ activeVisit, visitStore, next, workingToday, progressLine, startVisit, completeVisit }: Props) {
  const { palette } = useTheme();
  const [busy, setBusy] = useState(false);
  // Ticks every second only while the countdown is on screen.
  const now = useNow(activeVisit ? 1_000 : 60_000);

  const run = async (work: () => Promise<void>, failTitle: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      Alert.alert(failTitle, isVisitLimitError(e) ? VISIT_LIMIT_MESSAGE : e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (activeVisit) {
    const left = lockRemainingMs(activeVisit.startedAt, now);
    const done = 1 - left / MIN_VISIT_MS;
    return (
      <GlassCard glow="gold" index={0} accessibilityLabel={`Visit in progress at ${visitStore?.name ?? 'your store'}`}>
        <Txt variant="label" tone="primary" numberOfLines={1}>
          Visit in progress
        </Txt>
        <Txt variant="title" numberOfLines={2} style={{ marginTop: 2 }}>
          {visitStore?.name ?? 'Your store'}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
          <Txt variant="display" maxFontSizeMultiplier={1.1} style={{ fontVariant: ['tabular-nums'], color: left > 0 ? palette.text : palette.success }}>
            {left > 0 ? formatCountdown(left) : 'Done'}
          </Txt>
          <Txt variant="caption" tone="faint" numberOfLines={2} style={{ flexShrink: 1 }}>
            {left > 0 ? 'until you can end the visit' : '25 minutes reached. End the visit when you are ready.'}
          </Txt>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.border, marginTop: 12, overflow: 'hidden' }}>
          <View style={{ height: 4, width: `${Math.round(done * 100)}%`, backgroundColor: left > 0 ? palette.gold : palette.success }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <NeonButton
              label="End Visit"
              icon="stop-circle"
              variant="danger"
              size="lg"
              full
              loading={busy}
              disabled={left > 0}
              onPress={() =>
                run(async () => {
                  const { minutes } = await completeVisit();
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  Alert.alert('Visit logged', `${formatDuration(minutes)} on site.`);
                }, 'Visit not saved')
              }
            />
          </View>
          {visitStore && <NeonButton label="Store" icon="storefront" variant="outline" size="lg" onPress={() => router.push(`/store/${visitStore.id}`)} />}
        </View>
      </GlassCard>
    );
  }

  return (
    <GlassCard glow="gold" index={0} accessibilityLabel="Today">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="label" tone="primary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {next ? 'Next store' : 'Today'}
        </Txt>
        <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.border }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: workingToday ? palette.success : palette.textFaint }} />
          <Txt variant="label" tone="dim" numberOfLines={1} style={{ fontSize: 9.5 }}>
            {workingToday ? 'Working day' : 'Day off'}
          </Txt>
        </View>
      </View>
      <Txt variant="title" numberOfLines={2} style={{ marginTop: 2 }}>
        {next ? next.store.name : 'Every store on target'}
      </Txt>
      <Txt variant="caption" tone="faint" numberOfLines={2} style={{ marginTop: 4 }}>
        {next ? `Grade ${next.store.grade} · ${next.remaining} ${next.remaining === 1 ? 'visit' : 'visits'} to go · ${progressLine}` : progressLine}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        {next && (
          <View style={{ flexGrow: 1, flexBasis: 140 }}>
            <NeonButton
              label="Start Visit"
              icon="play-circle"
              size="lg"
              full
              loading={busy}
              onPress={() =>
                run(async () => {
                  await startVisit(next.store.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                }, 'Visit not started')
              }
            />
          </View>
        )}
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <NeonButton label="Today's route" icon="navigate" variant="outline" size="lg" full onPress={() => router.navigate('/route')} />
        </View>
      </View>
      {!next && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <Ionicons name="checkmark-circle" size={16} color={palette.success} />
          <Txt variant="caption" tone="faint">
            Nothing owed. Log a past visit from any store page.
          </Txt>
        </View>
      )}
    </GlassCard>
  );
}
