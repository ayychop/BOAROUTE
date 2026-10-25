import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { MANAGERS, managerLabel, managerShort } from '@/lib/frequency';
import { filterStores, toggleGroup } from '@/lib/store-selection';
import type { Manager, Store } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, springs } from '@/theme/typography';
import { Chip, Field } from './controls';
import { Txt } from './Txt';

const StoreRow = memo(function StoreRow({ store, on, onToggle }: { store: Store; on: boolean; onToggle: (id: string) => void }) {
  const { palette } = useTheme();
  const check = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(on ? 1 : 0, springs.release) }] }));
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${store.name}, ${managerLabel(store.assigned_manager)}, grade ${store.grade}`}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onToggle(store.id);
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        backgroundColor: on ? palette.surfaceHighlight : 'transparent',
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: on ? palette.borderStrong : 'transparent',
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.2, borderColor: on ? palette.primary : palette.textFaint, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' }, check]}>
          <Ionicons name="checkmark" size={15} color={palette.primaryText} />
        </Animated.View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="strong" numberOfLines={1}>
          {store.name}
        </Txt>
        <Txt variant="caption" tone="faint" numberOfLines={1}>
          {managerLabel(store.assigned_manager)} · Grade {store.grade} · {store.address}
        </Txt>
      </View>
    </Pressable>
  );
});

/** Searchable checklist of every store, with one-tap "select all" per manager. */
export function StoreSelector({ stores, selected, onChange }: { stores: Store[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [manager, setManager] = useState<Manager | null>(null);
  const set = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => filterStores(stores, query, manager), [stores, query, manager]);
  const allShownOn = shown.length > 0 && shown.every((s) => set.has(s.id));

  // Stable toggle so the memoised rows only re-render when their own tick changes.
  const latest = useRef(selected);
  useEffect(() => {
    latest.current = selected;
  }, [selected]);
  const toggle = useCallback(
    (id: string) => {
      const cur = latest.current;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );

  return (
    <View>
      <Field label="Search stores" icon="search" value={query} onChangeText={setQuery} placeholder="Name, town or street" autoCorrect={false} returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
        <Chip label="All stores" active={manager === null} onPress={() => setManager(null)} />
        {MANAGERS.map((m) => (
          <Chip key={m} label={`${managerShort(m)}'s`} active={manager === m} onPress={() => setManager(m)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8, gap: 12 }}>
        <Txt variant="caption" tone="dim" style={{ flex: 1 }}>
          <Txt variant="strong" tone="gold">
            {selected.length}
          </Txt>{' '}
          selected · {shown.length} shown
        </Txt>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onChange(toggleGroup(selected, shown));
          }}
          disabled={shown.length === 0}
          hitSlop={8}
        >
          <Txt variant="label" tone={shown.length ? 'primary' : 'faint'}>
            {allShownOn ? 'Clear shown' : 'Select shown'}
          </Txt>
        </Pressable>
      </View>
      <View style={{ gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 8 }}>
        {shown.length === 0 ? (
          <Txt variant="caption" tone="faint" align="center" style={{ paddingVertical: 24 }}>
            No stores match that search.
          </Txt>
        ) : (
          shown.map((s) => <StoreRow key={s.id} store={s} on={set.has(s.id)} onToggle={toggle} />)
        )}
      </View>
    </View>
  );
}
