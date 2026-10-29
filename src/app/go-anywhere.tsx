import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useHomePoint } from '@/hooks/useHomePoint';
import { geocode, isUkPostcode, normalisePostcode } from '@/lib/geo';
import { encodeNavRequest } from '@/lib/nav-request';
import { useAuth } from '@/providers/AuthProvider';

export default function GoAnywhere() {
  const { profile } = useAuth();
  const { point: home } = useHomePoint(profile?.starting_location);
  const [query, setQuery] = useState('');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const go = async () => {
    const q = query.trim();
    const s = start.trim();
    setError(null);
    setStartError(null);
    if (q.length < 3) return setError('Enter a postcode or address.');
    setBusy(true);
    try {
      // The starting point defaults to the profile's home. Anything typed here
      // overrides it for this one trip, so the day's default is left untouched.
      let from: 'here' | { lat: number; lng: number; label: string };
      if (s.length >= 3) {
        const origin = await geocode(s);
        if (!origin) {
          setStartError('We could not find that starting point. Try a full UK postcode like RG1 1AA.');
          return;
        }
        from = { ...origin, label: isUkPostcode(s) ? normalisePostcode(s) : s };
      } else {
        // From home when it is known, otherwise from wherever the phone is.
        from = home && profile?.starting_location ? { ...home, label: profile.starting_location } : 'here';
      }

      const point = await geocode(q);
      if (!point) return setError('We could not find that place. Try a full UK postcode like RG1 1AA.');
      const label = isUkPostcode(q) ? normalisePostcode(q) : q;
      router.replace({
        pathname: '/navigate',
        params: { req: encodeNavRequest({ from, to: [{ ...point, label }], prefer: 'motorway', title: label }) },
      });
    } catch {
      setError('Could not look that up. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const startsFrom = start.trim().length >= 3 ? start.trim() : home ? `home (${profile?.starting_location})` : 'where you are';

  return (
    <Screen back kicker="Premium routing" title="Go Anywhere">
      <GlassCard glow="gold">
        <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
          Motorways preferred, country lanes avoided. Live traffic picks the quickest way from {startsFrom}.
        </Txt>
        <Field
          label="Starting point (optional)"
          icon="flag-outline"
          value={start}
          onChangeText={setStart}
          placeholder={home ? `Default: ${profile?.starting_location}` : 'Default: where you are'}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="next"
          error={startError ?? undefined}
        />
        <Field
          label="Destination"
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
    </Screen>
  );
}
