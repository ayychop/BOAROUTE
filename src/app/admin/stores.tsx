import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, View, type ListRenderItem } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { GradeBadge, managerColor } from '@/components/badges';
import { Chip, Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { MANAGERS, isLegacyOwner, managerShort } from '@/lib/frequency';
import { supabase } from '@/lib/supabaseClient';
import type { Manager, Profile, Store } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { useTheme } from '@/theme/ThemeProvider';

type TeamUser = Pick<Profile, 'id' | 'email' | 'name'>;

const firstName = (u: TeamUser) => (u.name?.trim() || u.email).split(/[\s@]/)[0];

/** Only the first screenful plays the entrance; rows that mount while scrolling appear instantly. */
const ANIMATED_ROWS = 8;

export default function StoreManagement() {
  const { palette } = useTheme();
  const { isAdmin } = useAuth();
  const { stores, assignStores, storeAssignees, setStoreAssignee } = useData();
  const { columns } = useLayout();
  const listColumns = Math.min(columns, 2);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Manager | 'all' | 'unowned'>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  // Approved merchandisers, for handing a single store to one of them.
  const [team, setTeam] = useState<TeamUser[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    supabase
      .from('profiles')
      .select('id,email,name')
      .eq('role', 'user')
      .order('name')
      .then(({ data }) => {
        if (live && data) setTeam(data as TeamUser[]);
      });
    return () => {
      live = false;
    };
  }, [isAdmin]);

  const handedTo = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const r of storeAssignees) (out[r.store_id] ??= new Set()).add(r.user_id);
    return out;
  }, [storeAssignees]);

  const counts = useMemo(
    () => Object.fromEntries(MANAGERS.map((m) => [m, stores.filter((s) => s.assigned_manager === m).length])) as Record<Manager, number>,
    [stores],
  );
  // Stores still under David or Sarah from before the team split, waiting for a real owner.
  const unowned = useMemo(() => stores.filter((s) => isLegacyOwner(s.assigned_manager)).length, [stores]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inFilter = (s: Store) => filter === 'all' || (filter === 'unowned' ? isLegacyOwner(s.assigned_manager) : s.assigned_manager === filter);
    return stores.filter((s) => inFilter(s) && (!q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)));
  }, [stores, query, filter]);

  if (!isAdmin) {
    return (
      <Screen back title="Store Management">
        <EmptyState icon="lock-closed-outline" title="Admins only" body="Store assignments are managed by the admin." />
      </Screen>
    );
  }

  const assign = async (ids: string[], manager: Manager) => {
    setBusy(ids.length === 1 ? ids[0] : 'bulk');
    try {
      await assignStores(ids, manager);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (ids.length > 1) {
        setSelected(new Set());
        setSelecting(false);
      }
    } catch (e) {
      Alert.alert('Could not reassign', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const hand = async (store: Store, user: TeamUser, on: boolean) => {
    const key = `${store.id}:${user.id}`;
    if (busy === key) return;
    setBusy(key);
    try {
      await setStoreAssignee(store.id, user.id, on);
      Haptics.selectionAsync().catch(() => {});
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderItem: ListRenderItem<Store> = ({ item: s, index }) => {
    const isSel = selected.has(s.id);
    return (
      <View style={{ flex: 1 / listColumns }}>
        <GlassCard onPress={selecting ? () => toggle(s.id) : undefined} glow={isSel ? 'gold' : false} accessibilityLabel={s.name} index={index} animateIn={index < ANIMATED_ROWS}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: selecting ? 0 : 12 }}>
            {selecting && <Ionicons name={isSel ? 'checkbox' : 'square-outline'} size={22} color={isSel ? palette.gold : palette.textFaint} />}
            <GradeBadge grade={s.grade} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="strong" numberOfLines={1}>
                {s.name}
              </Txt>
              <Txt variant="caption" tone="faint" numberOfLines={1}>
                {selecting ? `${managerShort(s.assigned_manager)} · ${s.address}` : s.address}
              </Txt>
              {!selecting && isLegacyOwner(s.assigned_manager) && (
                <Txt variant="caption" tone="gold" numberOfLines={1}>
                  Was {s.assigned_manager}&apos;s · choose its owner
                </Txt>
              )}
            </View>
          </View>
          {!selecting && (
            // Wrapping chips, so all six owners still fit on a Flip cover screen.
            <View accessibilityRole="radiogroup" accessibilityLabel={`Manager for ${s.name}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MANAGERS.map((m) => (
                <Chip
                  key={m}
                  label={managerShort(m)}
                  active={s.assigned_manager === m}
                  icon={s.assigned_manager === m ? 'checkmark' : undefined}
                  onPress={() => {
                    if (m !== s.assigned_manager && busy !== s.id) assign([s.id], m);
                  }}
                />
              ))}
            </View>
          )}
          {!selecting && team.length > 0 && (
            // Keeps the owner (and their badge); the store just also shows up for these people.
            <View style={{ marginTop: 12, gap: 8 }}>
              <Txt variant="label" tone="dim">
                Also visible to
              </Txt>
              <View accessibilityLabel={`Who else sees ${s.name}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {team.map((u) => {
                  const on = !!handedTo[s.id]?.has(u.id);
                  return <Chip key={u.id} label={firstName(u)} tone="gold" active={on} icon={on ? 'checkmark' : 'person-add-outline'} onPress={() => hand(s, u, !on)} />;
                })}
              </View>
            </View>
          )}
        </GlassCard>
      </View>
    );
  };

  const listHeader = (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {MANAGERS.map((m) => (
          <GlassCard key={m} style={{ flexGrow: 1, flexBasis: 70, alignItems: 'center' }}>
            <Txt variant="metric" style={{ color: managerColor(m, palette) }} numberOfLines={1}>
              {counts[m]}
            </Txt>
            <Txt variant="label" tone="dim" numberOfLines={1}>
              {managerShort(m)}
            </Txt>
          </GlassCard>
        ))}
      </View>
      <Field label="Search" icon="search" value={query} onChangeText={setQuery} placeholder="Store or town" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
        <Chip label={`All (${stores.length})`} active={filter === 'all'} onPress={() => setFilter('all')} />
        {unowned > 0 && <Chip label={`Needs owner (${unowned})`} active={filter === 'unowned'} icon="alert-circle-outline" tone="gold" onPress={() => setFilter('unowned')} />}
        {MANAGERS.map((m) => (
          <Chip key={m} label={`${managerShort(m)} (${counts[m]})`} active={filter === m} onPress={() => setFilter(m)} />
        ))}
      </ScrollView>
      {selecting && (
        <Pressable onPress={() => setSelected(new Set(list.map((s) => s.id)))} style={{ marginBottom: 10 }} accessibilityRole="button" hitSlop={8}>
          <Txt variant="label" tone="primary">
            Select all {list.length} shown
          </Txt>
        </Pressable>
      )}
    </View>
  );

  return (
    <Screen
      back
      kicker="Admin portal"
      title="Store Management"
      right={
        <NeonButton
          size="sm"
          variant={selecting ? 'gold' : 'subtle'}
          icon={selecting ? 'close' : 'checkbox-outline'}
          label={selecting ? 'Done' : 'Select'}
          onPress={() => {
            setSelecting((v) => !v);
            setSelected(new Set());
          }}
        />
      }
      footer={
        selecting && selected.size > 0 ? (
          <Animated.View entering={SlideInDown.springify().damping(18)} exiting={SlideOutDown}>
            <GlassCard glow="gold">
              <Txt variant="label" tone="gold" style={{ marginBottom: 8 }}>
                Move {selected.size} store{selected.size > 1 ? 's' : ''} to
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MANAGERS.map((m) => (
                  <View key={m} style={{ flexGrow: 1, flexBasis: 70 }}>
                    <NeonButton label={managerShort(m)} size="sm" variant={m === 'Joseph' ? 'primary' : 'gold'} loading={busy === 'bulk'} onPress={() => assign([...selected], m)} full />
                  </View>
                ))}
              </View>
            </GlassCard>
          </Animated.View>
        ) : undefined
      }
      renderList={({ contentContainerStyle, header }) => (
        <FlatList
          // numColumns cannot change on the fly; a new key remounts the list when the Fold opens or closes.
          key={`cols-${listColumns}`}
          data={list}
          keyExtractor={(st) => st.id}
          renderItem={renderItem}
          extraData={{ selecting, selected, busy, team, handedTo }}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? { gap: 10 } : undefined}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={
            <>
              {header}
              {listHeader}
            </>
          }
          ListEmptyComponent={<EmptyState icon="search" title="No stores match" body="Try a different search or manager." />}
          contentContainerStyle={contentContainerStyle}
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
  return <View style={{ height: 10 }} />;
}
