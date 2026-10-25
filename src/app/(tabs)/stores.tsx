import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, View, type ListRenderItem } from 'react-native';
import { Chip, Field } from '@/components/controls';
import { DataErrorBanner, EmptyState, LoadingBlock } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { StoreCard } from '@/components/StoreCard';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { GRADES, managerShort } from '@/lib/frequency';
import type { Grade, Manager, Store } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';

/** Only the first screenful plays the entrance; rows that mount while scrolling appear instantly. */
const ANIMATED_ROWS = 8;
const GAP = 12;

export default function Stores() {
  const { isAdmin } = useAuth();
  const { myStores, managers, tallies, targets, loading, refresh } = useData();
  const { columns } = useLayout();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [manager, setManager] = useState<Manager | 'all'>('all');
  const [grade, setGrade] = useState<Grade | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myStores.filter(
      (s) =>
        (manager === 'all' || s.assigned_manager === manager) &&
        (grade === 'all' || s.grade === grade) &&
        (!q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)),
    );
  }, [myStores, query, manager, grade]);

  const renderItem = useCallback<ListRenderItem<Store>>(
    ({ item, index }) => (
      <View style={{ flex: 1 / columns }}>
        <StoreCard store={item} tally={tallies[item.id]} target={targets[item.grade]} index={index} now={now} animateIn={index < ANIMATED_ROWS} />
      </View>
    ),
    [columns, tallies, targets, now],
  );

  const filters = (
    <View>
      <DataErrorBanner />
      <Field label="Search" icon="search" value={query} onChangeText={setQuery} placeholder="Store name, town or street" returnKeyType="search" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 4 }} style={{ marginBottom: 14 }}>
        {managers.length > 1 && (
          <>
            <Chip label="All" active={manager === 'all'} onPress={() => setManager('all')} />
            {managers.map((m) => (
              <Chip key={m} label={managerShort(m)} active={manager === m} onPress={() => setManager(m)} icon="person" tone={m === 'Joseph' ? 'primary' : 'gold'} />
            ))}
            <View style={{ width: 10 }} />
          </>
        )}
        <Chip label="Any grade" active={grade === 'all'} onPress={() => setGrade('all')} />
        {GRADES.map((g) => (
          <Chip key={g} label={`Grade ${g}`} active={grade === g} onPress={() => setGrade(g)} />
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
          data={loading ? [] : filtered}
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
              <LoadingBlock label="Loading stores" />
            ) : (
              <EmptyState icon="storefront-outline" title="No stores match" body={myStores.length ? 'Try a different search or filter.' : 'No stores on your patch yet. Tap Edit to choose yours.'} />
            )
          }
          ListFooterComponent={
            !loading && filtered.length > 0 ? (
              <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 16 }}>
                Showing {filtered.length} of {myStores.length}
              </Txt>
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
          removeClippedSubviews
        />
      )}
    />
  );
}

function Separator() {
  return <View style={{ height: GAP }} />;
}
