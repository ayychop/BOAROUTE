import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Chip, Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { StartPointPicker } from '@/components/StartPointPicker';
import { Txt } from '@/components/Txt';
import { useHomePoint } from '@/hooks/useHomePoint';
import { setStartPoint, useStartPoint } from '@/hooks/useStartPoint';
import { geocode, isUkPostcode, normalisePostcode } from '@/lib/geo';
import { encodeNavRequest, type NavDestination } from '@/lib/nav-request';
import { hasCoords, toLatLng } from '@/lib/route-engine';
import { startPointLabel, type StartPoint } from '@/lib/start-point';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';

type StartTab = StartPoint['kind'];

export default function GoAnywhere() {
  const { profile } = useAuth();
  const { myStores } = useData();
  const { point: home } = useHomePoint(profile?.starting_location);
  const start = useStartPoint();
  const [tab, setTab] = useState<StartTab>(start.kind);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startQuery, setStartQuery] = useState(start.kind === 'custom' ? start.label : '');
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const startStore = useMemo(() => (start.kind === 'store' ? myStores.find((s) => s.id === start.storeId && hasCoords(s)) ?? null : null), [start, myStores]);
  const label = startPointLabel(start, { homeLabel: profile?.starting_location, storeName: startStore?.name });

  const choose = (p: StartPoint) => {
    Haptics.selectionAsync().catch(() => {});
    setStartPoint(p);
  };

  const saveCustomStart = async () => {
    const q = startQuery.trim();
    setStartError(null);
    if (q.length < 3) return setStartError('Enter a postcode or address.');
    setStartBusy(true);
    try {
      const p = await geocode(q);
      if (!p) return setStartError('We could not find that place. Try a full UK postcode.');
      choose({ kind: 'custom', label: isUkPostcode(q) ? normalisePostcode(q) : q, lat: p.lat, lng: p.lng });
    } catch {
      setStartError('Could not look that up. Check your connection and try again.');
    } finally {
      setStartBusy(false);
    }
  };

  /** Where this trip starts. "here" lets the navigator use the live fix. */
  const from = (): 'here' | NavDestination => {
    if (start.kind === 'custom') return { lat: start.lat, lng: start.lng, label: start.label };
    if (start.kind === 'store' && startStore) return { ...toLatLng(startStore), label: startStore.name };
    if (start.kind === 'home' && home && profile?.starting_location) return { ...home, label: profile.starting_location };
    return 'here';
  };

  const go = async () => {
    const q = query.trim();
    setError(null);
    if (q.length < 3) return setError('Enter a postcode or address.');
    setBusy(true);
    try {
      const point = await geocode(q);
      if (!point) return setError('We could not find that place. Try a full UK postcode like RG1 1AA.');
      const dest = isUkPostcode(q) ? normalisePostcode(q) : q;
      router.replace({
        pathname: '/navigate',
        params: { req: encodeNavRequest({ from: from(), to: [{ ...point, label: dest }], prefer: 'recommended', title: dest }) },
      });
    } catch {
      setError('Could not look that up. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back kicker="Premium routing" title="Go Anywhere">
      <View style={{ gap: 12 }}>
        <GlassCard glow="gold">
          <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
            Up to four live-traffic routes. Main roads first; country lanes only when there is no other way through.
          </Txt>
          <Field
            label="Postcode or address"
            icon="location-outline"
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. RG1 1AA or Bracknell"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={go}
            autoFocus
            error={error ?? undefined}
          />
          <View style={{ marginTop: 4 }}>
            <NeonButton label="Plan route" icon="navigate" variant="gold" size="lg" onPress={go} loading={busy} full />
          </View>
        </GlassCard>

        <GlassCard index={1}>
          <Txt variant="label" tone="dim">
            Starting point
          </Txt>
          <Txt variant="strong" numberOfLines={1} style={{ marginTop: 4, marginBottom: 12 }}>
            {label}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip
              icon="locate"
              label="Current location"
              active={tab === 'here'}
              onPress={() => {
                setTab('here');
                choose({ kind: 'here' });
              }}
            />
            <Chip
              icon="home"
              label="Home"
              active={tab === 'home'}
              onPress={() => {
                setTab('home');
                choose({ kind: 'home' });
              }}
            />
            <Chip icon="storefront" label="A store" active={tab === 'store'} onPress={() => setTab('store')} />
            <Chip icon="create-outline" label="Address" active={tab === 'custom'} onPress={() => setTab('custom')} />
          </View>
          <Txt variant="caption" tone="faint" style={{ marginTop: 10 }}>
            Used here and for Today&apos;s route.
          </Txt>
        </GlassCard>

        {tab === 'store' && (
          <StartPointPicker
            stores={myStores}
            selectedId={startStore?.id ?? null}
            homeLabel={profile?.starting_location ?? 'not set'}
            onChange={(id) => {
              if (id) choose({ kind: 'store', storeId: id });
              else {
                setTab('home');
                choose({ kind: 'home' });
              }
            }}
          />
        )}

        {tab === 'custom' && (
          <GlassCard animateIn={false}>
            <Field
              label="Start from this address"
              icon="flag-outline"
              value={startQuery}
              onChangeText={setStartQuery}
              placeholder="e.g. HP13 6BU"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveCustomStart}
              error={startError ?? undefined}
            />
            <NeonButton label="Set starting point" icon="checkmark" variant="outline" onPress={saveCustomStart} loading={startBusy} full />
          </GlassCard>
        )}
      </View>
    </Screen>
  );
}
