import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { hasCoords, type RoutableStore } from '@/lib/route-engine';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip, Field } from './controls';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

const MAX_RESULTS = 6;

/**
 * "Start route from": home (the default) or any store on the patch. Picking a
 * store re-plans the day from there; the store itself is left out of the stops.
 */
export function StartPointPicker<S extends RoutableStore>({
  stores,
  selectedId,
  homeLabel,
  onChange,
}: {
  stores: S[];
  selectedId: string | null;
  homeLabel: string;
  onChange: (storeId: string | null) => void;
}) {
  const { palette } = useTheme();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const located = useMemo(() => stores.filter(hasCoords).sort((a, b) => a.name.localeCompare(b.name)), [stores]);
  const selected = located.find((s) => s.id === selectedId) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? located.filter((s) => s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)) : located;
    return list.slice(0, MAX_RESULTS);
  }, [located, query]);

  return (
    <GlassCard animateIn={false}>
      <Txt variant="label" tone="dim" style={{ marginBottom: 10 }}>
        Start route from
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip
          icon="home"
          label={`Home · ${homeLabel}`}
          active={!selected}
          onPress={() => {
            setPicking(false);
            onChange(null);
          }}
        />
        <Chip icon="storefront" label={selected ? selected.name : 'A store'} active={!!selected || picking} onPress={() => setPicking((p) => !p)} />
      </View>

      {selected && !picking ? (
        <Txt variant="caption" tone="faint" style={{ marginTop: 10 }}>
          Routing from {selected.name}. It is left out of today&apos;s stops, so mark it visited from its store page.
        </Txt>
      ) : null}

      {picking && (
        <View style={{ marginTop: 14 }}>
          <Field label="Find a store" icon="search" value={query} onChangeText={setQuery} placeholder="Store name or town" autoCorrect={false} returnKeyType="search" />
          {results.length === 0 ? (
            <Txt variant="caption" tone="faint">
              No stores match &quot;{query.trim()}&quot;.
            </Txt>
          ) : (
            results.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`Start from ${s.name}`}
                onPress={() => {
                  onChange(s.id);
                  setPicking(false);
                  setQuery('');
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.border, opacity: pressed ? 0.7 : 1 })}
              >
                <Ionicons name={s.id === selectedId ? 'radio-button-on' : 'radio-button-off'} size={18} color={s.id === selectedId ? palette.gold : palette.textFaint} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="strong" numberOfLines={1}>
                    {s.name}
                  </Txt>
                  <Txt variant="caption" tone="faint" numberOfLines={1}>
                    {s.address}
                  </Txt>
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}
    </GlassCard>
  );
}
