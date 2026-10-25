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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    const q = query.trim();
    setError(null);
    if (q.length < 3) return setError('Enter a postcode or address.');
    setBusy(true);
    try {
      const point = await geocode(q);
      if (!point) return setError('We could not find that place. Try a full UK postcode like RG1 1AA.');
      const label = isUkPostcode(q) ? normalisePostcode(q) : q;
      // From home when it is known, otherwise from wherever the phone is.
      const from = home && profile?.starting_location ? { ...home, label: profile.starting_location } : ('here' as const);
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

  return (
    <Screen back kicker="Premium routing" title="Go Anywhere">
      <GlassCard glow="gold">
        <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
          Motorways preferred, country lanes avoided. Live traffic picks the quickest way {home ? `from home (${profile?.starting_location})` : 'from where you are'}.
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
    </Screen>
  );
}
