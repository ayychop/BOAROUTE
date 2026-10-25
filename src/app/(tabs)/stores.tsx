import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Chip, Field } from '@/components/controls';
import { EmptyState, LoadingBlock } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { StoreCard } from '@/components/StoreCard';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { GRADES, managerShort } from '@/lib/frequency';
import type { Grade, Manager } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';

export default function Stores() {
  const { isAdmin } = useAuth();
  const { myStores, managers, tallies, targets, loading, refresh } = useData();
  const { columns } = useLayout();
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

  return (
    <Screen
      inTabs
      kicker={`${myStores.length} stores in your patch`}
      title="Stores"
      right={isAdmin ? <NeonButton size="sm" variant="gold" icon="shield-checkmark" label="Manage" onPress={() => router.push('/admin/stores')} /> : undefined}
      onRefresh={async () => {
        setRefreshing(true);
        await refresh().catch(() => {});
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      <Field label="Search" icon="search" value={query} onChangeText={setQuery} placeholder="Store name, town or street" returnKeyType="search" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} style={{ marginBottom: 14 }}>
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

      {loading ? (
        <LoadingBlock label="Loading stores" />
      ) : filtered.length === 0 ? (
        <EmptyState icon="storefront-outline" title="No stores match" body={myStores.length ? 'Try a different search or filter.' : 'No stores are assigned to your patch yet. Ask your admin to assign some.'} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {filtered.map((s, i) => (
              <View key={s.id} style={{ width: columns === 1 ? '100%' : `${100 / columns - 2}%`, flexGrow: 1 }}>
                <StoreCard store={s} tally={tallies[s.id]} target={targets[s.grade]} index={Math.min(i, 12)} />
              </View>
            ))}
          </View>
          <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 16 }}>
            Showing {filtered.length} of {myStores.length}
          </Txt>
        </>
      )}
    </Screen>
  );
}
