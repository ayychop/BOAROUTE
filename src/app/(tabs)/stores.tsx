import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, View, type ListRenderItem } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Chip, Field } from '@/components/controls';
import { DataErrorBanner, EmptyState } from '@/components/misc';
import { StoreListSkeleton } from '@/components/Skeleton';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { GoalBar, StoreCard } from '@/components/StoreCard';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { monthKey } from '@/lib/budget';
import { GRADES, managerShort, storeTarget } from '@/lib/frequency';
import { getPref, setPref } from '@/lib/prefs';
import { ownerTabs } from '@/lib/store-selection';
import type { Grade, Store, StoreOwner } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { celebratedKey, parseCelebrated, quoteFor, splitStores, winsHeadline } from '@/lib/wins';

/** Only the first screenful plays the entrance; rows that mount while scrolling appear instantly. */
const ANIMATED_ROWS = 8;
const GAP = 12;

/** Two cards per row on phones, more on the Fold and tablets, one on the narrowest cover screens. */
function gridColumns(width: number): number {
  if (width < 330) return 1;
  if (width >= 1040) return 4;
  if (width >= 700) return 3;
  return 2;
}

export default function Stores() {
  const { isAdmin } = useAuth();
  const { myStores, patchStores, managers, tallies, targets, visitsLeftThisWeek, loading, refresh } = useData();
  const { palette } = useTheme();
  const { width } = useLayout();
  const columns = gridColumns(width);
  const focused = useIsFocused();
  const now = useNow();
  const month = monthKey(new Date(now));
  const [query, setQuery] = useState('');
  const [manager, setManager] = useState<StoreOwner | 'all'>('all');
  const [grade, setGrade] = useState<Grade | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  // Entrance animations only on the first screenful. After a filter change, rows
  // appear instantly: animating cells that mount mid-list could leave them blank on Android.
  const [touched, setTouched] = useState(false);
  // Stores whose completion exit already played this month (kept on the device).
  const [celebrated, setCelebrated] = useState<{ month: string; ids: Set<string> }>(() => ({ month, ids: parseCelebrated(getPref(celebratedKey(month))) }));
  const celebratedIds = celebrated.month === month ? celebrated.ids : parseCelebrated(getPref(celebratedKey(month)));

  const onExited = useCallback(
    (id: string) => {
      setCelebrated((prev) => {
        const ids = new Set(prev.month === month ? prev.ids : []);
        ids.add(id);
        setPref(celebratedKey(month), JSON.stringify([...ids]));
        return { month, ids };
      });
    },
    [month],
  );
  const pickGrade = (g: Grade | 'all') => {
    setTouched(true);
    setGrade(g);
  };
  const pickManager = (m: StoreOwner | 'all') => {
    setTouched(true);
    setManager(m);
  };

  const owners = useMemo(() => ownerTabs(managers, patchStores), [managers, patchStores]);
  const showOwner = owners.length > 1;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myStores.filter(
      (s) =>
        (manager === 'all' || s.assigned_manager === manager) &&
        (grade === 'all' || s.grade === grade) &&
        (!q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)),
    );
  }, [myStores, query, manager, grade]);

  const split = useMemo(() => splitStores(filtered, tallies, targets, celebratedIds), [filtered, tallies, targets, celebratedIds]);

  const renderItem = useCallback<ListRenderItem<Store>>(
    ({ item, index }) => (
      <View style={{ flex: 1 / columns }}>
        <StoreCard
          store={item}
          tally={tallies[item.id]}
          target={storeTarget(item, targets)}
          index={index}
          now={now}
          animateIn={!touched && index < ANIMATED_ROWS}
          // Only once the screen is in view, so the exit is actually seen.
          exiting={focused && split.exiting.has(item.id)}
          onExited={onExited}
          showOwner={showOwner}
          weekLocked={visitsLeftThisWeek(item.id) <= 0}
        />
      </View>
    ),
    [columns, tallies, targets, visitsLeftThisWeek, now, touched, focused, split.exiting, onExited, showOwner],
  );

  const winsSection =
    !loading && filtered.length > 0 ? (
      <View style={{ marginTop: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Ionicons name="trophy" size={22} color={palette.gold} />
          <Txt variant="title" style={{ flex: 1 }}>
            Your Wins
          </Txt>
          <Txt variant="strong" tone="gold">
            {split.wins.length}
          </Txt>
        </View>
        <Txt variant="caption" tone="dim" style={{ marginBottom: 14 }}>
          {winsHeadline(split.wins.length, filtered.length)}
        </Txt>
        {split.wins.length === 0 ? (
          <GlassCard animateIn={false}>
            <Txt variant="body" tone="dim" align="center">
              Hit a store&apos;s monthly target and it lands here with a little celebration.
            </Txt>
          </GlassCard>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {split.wins.map((s, i) => {
              const target = storeTarget(s, targets);
              const done = tallies[s.id]?.count ?? 0;
              return (
                <Animated.View key={s.id} entering={FadeInDown.delay(Math.min(i, 8) * 60).springify().damping(16)} style={{ flexBasis: columns > 1 ? `${100 / columns - 3}%` : '100%', flexGrow: 1 }}>
                  <GlassCard glow="gold" animateIn={false} onPress={() => router.push({ pathname: '/store/[id]', params: { id: s.id } })} accessibilityLabel={`${s.name}, complete, ${done} of ${target} visits`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.gold, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="checkmark" size={22} color="#0B0B0C" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="strong" numberOfLines={1}>
                          {s.name}
                        </Txt>
                        <Txt variant="caption" tone="gold" numberOfLines={1}>
                          Complete · {done}/{target} visits · Grade {s.grade}
                        </Txt>
                      </View>
                    </View>
                    <GoalBar done={done} target={target} met />
                    <Txt variant="caption" tone="dim" style={{ marginTop: 10, fontStyle: 'italic' }}>
                      &ldquo;{quoteFor(s.id, month)}&rdquo;
                    </Txt>
                  </GlassCard>
                </Animated.View>
              );
            })}
          </View>
        )}
      </View>
    ) : null;

  const gradeCounts = useMemo(() => {
    const c: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const s of myStores) if (manager === 'all' || s.assigned_manager === manager) c[s.grade]++;
    return c;
  }, [myStores, manager]);

  const filters = (
    <View>
      <DataErrorBanner />
      <Field label="Search" icon="search" value={query} onChangeText={setQuery} placeholder="Store name, town or street" returnKeyType="search" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 4 }} style={{ marginBottom: 14 }}>
        {showOwner && (
          <>
            <Chip label="All" active={manager === 'all'} onPress={() => pickManager('all')} />
            {owners.map((m) => (
              <Chip key={m} label={managerShort(m)} active={manager === m} onPress={() => pickManager(m)} icon="person" tone={m === 'Joseph' ? 'primary' : 'gold'} />
            ))}
            <View style={{ width: 10 }} />
          </>
        )}
        <Chip label={`Any grade · ${myStores.length}`} active={grade === 'all'} onPress={() => pickGrade('all')} />
        {GRADES.map((g) => (
          <Chip key={g} label={`Grade ${g} · ${gradeCounts[g]}`} active={grade === g} onPress={() => pickGrade(g)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen
      inTabs
      kicker={`${myStores.length} stores in your patch`}
      title="Stores"
      right={
        isAdmin ? (
          <NeonButton size="sm" variant="gold" icon="shield-checkmark" label="Manage" onPress={() => router.push('/admin/stores')} />
        ) : (
          <NeonButton size="sm" variant="subtle" icon="create-outline" label="Edit" onPress={() => router.push('/my-stores')} />
        )
      }
      onRefresh={async () => {
        setRefreshing(true);
        await refresh().catch(() => {});
        setRefreshing(false);
      }}
      refreshing={refreshing}
      renderList={({ contentContainerStyle, header, refreshControl }) => (
        <FlatList
          // numColumns cannot change on the fly; a new key remounts the list when the Fold opens or closes.
          key={`cols-${columns}`}
          data={loading ? [] : split.active}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={
            <>
              {header}
              {filters}
            </>
          }
          ListEmptyComponent={
            loading ? (
              <StoreListSkeleton />
            ) : (
              filtered.length > 0 ? (
                <EmptyState icon="trophy-outline" title="All done here" body="Every store in this view has hit its target this month. Enjoy your wins below." />
              ) : (
                <EmptyState icon="storefront-outline" title="No stores match" body={
                    !myStores.length
                      ? 'No stores on your patch yet. Tap Edit to choose yours.'
                      : manager !== 'all' && !myStores.some((s) => s.assigned_manager === manager)
                        ? `You haven't picked any of ${managerShort(manager)}'s stores. Tap Edit to add them.`
                        : 'Try a different search or filter.'
                  } />
              )
            )
          }
          ListFooterComponent={
            !loading && filtered.length > 0 ? (
              <>
                <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 16 }}>
                  {grade === 'all' ? 'All grades' : `Grade ${grade}`}: {filtered.length} of {myStores.length} stores · {split.active.length - split.exiting.size} to visit · {split.wins.length + split.exiting.size} complete
                </Txt>
                {winsSection}
              </>
            ) : undefined
          }
          contentContainerStyle={contentContainerStyle}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={9}
        />
      )}
    />
  );
}

function Separator() {
  return <View style={{ height: GAP }} />;
}
