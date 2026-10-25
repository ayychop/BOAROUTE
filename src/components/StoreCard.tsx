import { router } from 'expo-router';
import { memo } from 'react';
import { View } from 'react-native';
import { daysSinceLabel } from '@/lib/format';
import type { VisitTally } from '@/lib/route-engine';
import type { Store } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { GradeBadge, ManagerBadge } from './badges';
import { ProgressBar } from './controls';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

interface Props {
  store: Store;
  tally?: VisitTally;
  target: number;
  index: number;
  /** Current time from the list, so 100+ cards don't each run a timer. */
  now: number;
  animateIn?: boolean;
}

export const StoreCard = memo(function StoreCard({ store, tally, target, index, now, animateIn = true }: Props) {
  const { palette } = useTheme();
  const done = tally?.count ?? 0;
  const days = tally?.last ? Math.floor((now - new Date(tally.last).getTime()) / 86_400_000) : null;
  const met = done >= target;
  return (
    <GlassCard index={index} animateIn={animateIn} onPress={() => router.push({ pathname: '/store/[id]', params: { id: store.id } })} accessibilityLabel={`${store.name}, grade ${store.grade}`} style={{ height: '100%' }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <GradeBadge grade={store.grade} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt variant="strong" numberOfLines={2}>
            {store.name}
          </Txt>
          <ManagerBadge manager={store.assigned_manager} />
          <Txt variant="caption" tone="faint" numberOfLines={2}>
            {store.address}
          </Txt>
        </View>
      </View>
      <View style={{ marginTop: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt variant="caption" tone={met ? 'success' : 'dim'} numberOfLines={1}>
            {done} / {target} this month
          </Txt>
          <Txt variant="caption" tone="faint" numberOfLines={1}>
            {daysSinceLabel(days)}
          </Txt>
        </View>
        <ProgressBar value={target ? done / target : 1} color={met ? palette.success : undefined} />
      </View>
    </GlassCard>
  );
});
