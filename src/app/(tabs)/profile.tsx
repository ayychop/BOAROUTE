import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { BRLogo } from '@/components/BRLogo';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { managerShort } from '@/lib/frequency';
import { geocode, normalisePostcode } from '@/lib/geo';
import { formatOdometer } from '@/lib/odometer';
import { vehicleFor } from '@/lib/vehicles';
import { describeDays } from '@/lib/workdays';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { PALETTES, phaseForDate } from '@/theme/palettes';
import { useTheme, type AmbianceMode } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

const AMBIANCES: { value: AmbianceMode; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }[] = [
  { value: 'auto', label: 'Auto', icon: 'time', hint: 'Follows the clock' },
  { value: 'dawn', label: PALETTES.dawn.name, icon: 'sunny', hint: PALETTES.dawn.tagline },
  { value: 'focus', label: PALETTES.focus.name, icon: 'partly-sunny', hint: PALETTES.focus.tagline },
  { value: 'cockpit', label: PALETTES.cockpit.name, icon: 'moon', hint: PALETTES.cockpit.tagline },
];

function LinkRow({ icon, label, hint, href, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; href: Href; tone?: 'gold' }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icon} size={20} color={tone === 'gold' ? palette.gold : palette.primary} />
      <View style={{ flex: 1 }}>
        <Txt variant="strong">{label}</Txt>
        {hint ? (
          <Txt variant="caption" tone="faint">
            {hint}
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
    </Pressable>
  );
}

export default function Me() {
  const { palette, mode, setMode } = useTheme();
  const { profile, isAdmin, updateProfile, signOut } = useAuth();
  const { managers, myStores, chosenStoreIds } = useData();
  const vehicle = vehicleFor(profile?.vehicle_model);
  const [start, setStart] = useState(profile?.starting_location ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const saveStart = async () => {
    setMsg(null);
    if (!start.trim()) return setMsg({ tone: 'danger', text: 'Enter a postcode or address.' });
    setSaving(true);
    try {
      const p = await geocode(start);
      if (!p) return setMsg({ tone: 'danger', text: 'Could not find that location. Try a full UK postcode.' });
      await updateProfile({ starting_location: normalisePostcode(start) });
      setMsg({ tone: 'success', text: 'Starting location saved. Routes now begin here.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen inTabs kicker={isAdmin ? 'Admin' : 'Operational Manager'} title={profile?.name ?? 'Me'}>
      <GlassCard glow="gold" padded={false} index={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {vehicle && <Image source={vehicle.image} style={{ width: 120, height: 96 }} contentFit="cover" />}
          <View style={{ flex: 1, padding: 14, gap: 4 }}>
            <Txt variant="caption" tone="faint" numberOfLines={1}>
              {profile?.email}
            </Txt>
            <Txt variant="strong" numberOfLines={1}>
              {vehicle ? `${vehicle.year} X1 M Sport Hybrid` : 'No vehicle selected'}
            </Txt>
            <Txt variant="caption" tone="primary" numberOfLines={1}>
              {formatOdometer(profile?.current_mileage)} mi · {chosenStoreIds.length ? `${myStores.length} stores` : `Routes: ${managers.map(managerShort).join(' + ')}`}
            </Txt>
          </View>
          <View style={{ paddingRight: 14 }}>
            <BRLogo size={36} glow={false} />
          </View>
        </View>
      </GlassCard>

      <SectionHeader title="Ambiance" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {AMBIANCES.map((a) => {
          const active = mode === a.value;
          const preview = a.value === 'auto' ? PALETTES[phaseForDate(new Date())] : PALETTES[a.value];
          return (
            <Pressable
              key={a.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${a.label} ambiance`}
              onPress={() => setMode(a.value)}
              style={{
                flexGrow: 1,
                flexBasis: 140,
                borderRadius: radius.md,
                borderWidth: active ? 1.5 : StyleSheet.hairlineWidth * 2,
                borderColor: active ? palette.primary : palette.border,
                backgroundColor: palette.surface,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: preview.bg[1], borderWidth: 1, borderColor: preview.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={a.icon} size={16} color={preview.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="strong">{a.label}</Txt>
                <Txt variant="caption" tone="faint" numberOfLines={1}>
                  {a.hint}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="Starting location" />
      <GlassCard>
        <Field label="Postcode or address" icon="home-outline" value={start} onChangeText={setStart} autoCapitalize="characters" placeholder="HP13 6BU" returnKeyType="done" onSubmitEditing={saveStart} />
        {msg ? (
          <Txt variant="caption" tone={msg.tone} style={{ marginBottom: 10 }}>
            {msg.text}
          </Txt>
        ) : null}
        <NeonButton label="Save location" icon="checkmark" onPress={saveStart} loading={saving} disabled={start.trim() === (profile?.starting_location ?? '')} full />
      </GlassCard>

      <SectionHeader title="Settings" />
      <GlassCard>
        <LinkRow icon="storefront" label="My stores" hint={`${myStores.length} stores on your patch`} href="/my-stores" />
        <LinkRow icon="calendar" label="Working days" hint={describeDays(profile?.working_days ?? [])} href="/working-days" />
        <LinkRow icon="options" label="Route Settings" hint="Your monthly visit targets per grade" href="/route-settings" />
        <LinkRow icon="car-sport" label="Change vehicle" hint={vehicle?.plate} href="/vehicle" />
        {isAdmin && <LinkRow icon="shield-checkmark" label="Store Management" hint="Assign stores to Jo, Pete or David" href="/admin/stores" tone="gold" />}
        {isAdmin && <LinkRow icon="people" label="Team routes" hint="Choose whose stores each person routes" href="/admin/team" tone="gold" />}
        <LinkRow icon="images" label="Image credits" href="/credits" />
      </GlassCard>

      <NeonButton
        label="Sign out"
        icon="log-out-outline"
        variant="ghost"
        full
        style={{ marginTop: 20 }}
        onPress={() =>
          Alert.alert('Sign out?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => signOut().catch(() => {}) },
          ])
        }
      />
    </Screen>
  );
}
