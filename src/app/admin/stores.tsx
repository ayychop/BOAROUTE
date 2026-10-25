import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
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
import { MANAGERS, managerShort } from '@/lib/frequency';
import type { Manager, Store } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { useTheme } from '@/theme/ThemeProvider';

/** Only the first screenful plays the entrance; rows that mount while scrolling appear instantly. */
const ANIMATED_ROWS = 8;

export default function StoreManagement() {
  const { palette } = useTheme();
  const { isAdmin } = useAuth();
  const { stores, assignStores } = useData();
  const { columns } = useLayout();
  const listColumns = Math.min(columns, 2);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Manager | 'all'>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(
    () => Object.fromEntries(MANAGERS.map((m) => [m, stores.filter((s) => s.assigned_manager === m).length])) as Record<Manager, number>,
    [stores],
  );
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter((s) => (filter === 'all' || s.assigned_manager === filter) && (!q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)));
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
            </View>
          </View>
          {!selecting && (
            // Wrapping chips, so all four managers still fit on a Flip cover screen.
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
          extraData={{ selecting, selected, busy }}
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
