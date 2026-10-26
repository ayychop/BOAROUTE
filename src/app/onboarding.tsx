import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { BRLogo } from '@/components/BRLogo';
import { Field } from '@/components/controls';
import { ExpenseForm } from '@/components/ExpenseForm';
import { GlassCard } from '@/components/GlassCard';
import { StoreListSkeleton } from '@/components/Skeleton';
import { NeonButton } from '@/components/NeonButton';
import { Odometer } from '@/components/Odometer';
import { Screen } from '@/components/Screen';
import { StoreSelector } from '@/components/StoreSelector';
import { Txt } from '@/components/Txt';
import { VehiclePicker } from '@/components/VehiclePicker';
import { ShiftCalendar } from '@/components/ShiftCalendar';
import { geocode, normalisePostcode } from '@/lib/geo';
import { parseOdometer } from '@/lib/odometer';
import { defaultSelection } from '@/lib/store-selection';
import { VEHICLES, vehicleFor, type Vehicle } from '@/lib/vehicles';
import { DEFAULT_WORKING_DAYS, datesFromPattern, normaliseDates } from '@/lib/workdays';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { springs } from '@/theme/typography';

const STEPS = [
  { title: 'Your stores', kicker: 'Step 1 of 4', icon: 'storefront' },
  { title: 'Your vehicle', kicker: 'Step 2 of 4', icon: 'car-sport' },
  { title: 'Expenses', kicker: 'Step 3 of 4', icon: 'wallet' },
  { title: 'Shift calendar', kicker: 'Step 4 of 4', icon: 'calendar' },
] as const;

function StepSegment({ state }: { state: 'done' | 'current' | 'todo' }) {
  const { palette } = useTheme();
  const fill = useAnimatedStyle(() => ({ width: withSpring(state === 'todo' ? '0%' : state === 'current' ? '55%' : '100%', springs.settle) }));
  return (
    <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: palette.border, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: palette.primary }, fill]} />
    </View>
  );
}

export default function Onboarding() {
  const { palette } = useTheme();
  const { profile, updateProfile, isAdmin } = useAuth();
  const { patchStores: stores, chosenStoreIds, saveChosenStores, loading } = useData();
  const [step, setStep] = useState(0);
  const [forward, setForward] = useState(true);

  // Step 1: stores. Until the person edits, show what they already chose, or the default for their role.
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? (chosenStoreIds.length ? chosenStoreIds : defaultSelection(stores, isAdmin));

  // Step 2: vehicle, odometer and home base
  const [name, setName] = useState(profile?.name ?? '');
  const [vehicle, setVehicle] = useState<Vehicle['id'] | null>(vehicleFor(profile?.vehicle_model)?.id ?? (isAdmin ? '25' : null));
  const [mileage, setMileage] = useState(profile?.current_mileage != null ? String(Math.floor(Number(profile.current_mileage))) : '');
  const [start, setStart] = useState(profile?.starting_location ?? (isAdmin ? 'HP13 6BU' : ''));

  // Step 3: expenses logged during onboarding
  const [logged, setLogged] = useState<string[]>([]);

  // Step 4: shift calendar, starting from Mon to Fri for this month and the next two
  const [dates, setDates] = useState<string[]>(() =>
    profile?.shift_dates ? normaliseDates(profile.shift_dates) : datesFromPattern(profile?.working_days?.length ? profile.working_days : DEFAULT_WORKING_DAYS, new Date(), 3),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const odometer = parseOdometer(mileage);

  const go = (next: number) => {
    setError(null);
    setForward(next > step);
    setStep(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const next = async () => {
    setError(null);
    if (step === 0) {
      if (selected.length === 0) return setError('Choose at least one store to build your routes from.');
      return go(1);
    }
    if (step === 1) {
      if (!VEHICLES.some((v) => v.id === vehicle)) return setError('Choose your vehicle.');
      if (!Number.isFinite(odometer)) return setError('Enter your current mileage as shown on the dashboard, for example 14500.');
      if (!start.trim()) return setError('Add your starting postcode so routes begin from home.');
      setBusy(true);
      try {
        const point = await geocode(start);
        if (!point) return setError('We could not find that location. Try a full UK postcode like HP13 6BU.');
        go(2);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 2) return go(3);
    return finish();
  };

  const finish = async () => {
    const v = VEHICLES.find((x) => x.id === vehicle);
    if (!v || !Number.isFinite(odometer)) return go(1);
    if (dates.length === 0) return setError('Tap at least one working date.');
    setBusy(true);
    setError(null);
    try {
      await saveChosenStores(selected);
      await updateProfile({
        name: name.trim() || profile?.name || null,
        vehicle_model: v.model,
        current_mileage: odometer,
        starting_location: normalisePostcode(start),
        shift_dates: dates,
        onboarded_at: new Date().toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const entering = (forward ? FadeInRight : FadeInLeft).springify().damping(springs.settle.damping).stiffness(springs.settle.stiffness);
  const exiting = (forward ? FadeOutLeft : FadeOutRight).duration(180);
  const meta = STEPS[step];
  const primaryLabel = step === 3 ? 'Enter BOAROUTE' : step === 2 ? (logged.length ? 'Continue' : 'Skip for now') : 'Continue';

  const footer = (
    <View>
      {error ? (
        <Txt variant="caption" tone="danger" align="center" style={{ marginBottom: 10 }}>
          {error}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {step > 0 && <NeonButton label="Back" icon="chevron-back" variant="subtle" onPress={() => go(step - 1)} size="lg" />}
        <NeonButton
          label={primaryLabel}
          icon={step === 3 ? 'sparkles' : step === 2 && !logged.length ? 'play-skip-forward' : 'arrow-forward'}
          variant={step === 3 ? 'gold' : 'primary'}
          onPress={next}
          loading={busy}
          size="lg"
          style={{ flex: 1 }}
          full
        />
      </View>
    </View>
  );

  return (
    <Screen kicker={meta.kicker} title={meta.title} right={<BRLogo size={40} glow={false} />} footer={footer}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <StepSegment key={s.title} state={i < step ? 'done' : i === step ? 'current' : 'todo'} />
        ))}
      </View>

      <Animated.View key={step} entering={entering} exiting={exiting}>
        {step === 0 && (
          <View>
            <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
              {isAdmin ? "Every one of Jo's stores is already ticked. Untick any you don't cover, or add others." : 'Tick the stores that belong to you. Your routes and monthly targets are built from this list.'}
            </Txt>
            {loading ? <StoreListSkeleton /> : <StoreSelector stores={stores} selected={selected} onChange={setPicked} />}
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: 16 }}>
            <VehiclePicker value={vehicle} onChange={setVehicle} />
            <GlassCard glow="gold">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Ionicons name="speedometer-outline" size={18} color={palette.gold} />
                <Txt variant="label" tone="dim">
                  Digital cockpit
                </Txt>
              </View>
              <View style={{ alignItems: 'center', marginBottom: 18 }}>
                <Odometer value={Number.isFinite(odometer) ? odometer : null} size="lg" />
              </View>
              <Field
                label="Current mileage"
                icon="speedometer-outline"
                value={mileage}
                onChangeText={setMileage}
                placeholder="e.g. 14500"
                keyboardType="number-pad"
                maxLength={9}
                hint="Exactly as your dashboard shows it. Every trip you log adds to it."
              />
              <Field label="Your name" icon="person-outline" value={name} onChangeText={setName} placeholder="Your first name" autoCapitalize="words" />
              <Field
                label="Starting location"
                icon="home-outline"
                value={start}
                onChangeText={setStart}
                placeholder="e.g. HP13 6BU"
                autoCapitalize="characters"
                hint="Every route starts and ends here. A UK postcode works best."
              />
            </GlassCard>
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 16 }}>
            <Txt variant="body" tone="dim">
              Anything to log right now? Add it here and it comes straight off this month&apos;s budget. Nothing to add? Skip for now.
            </Txt>
            <GlassCard>
              <ExpenseForm onSaved={(summary) => setLogged((l) => [...l, summary])} />
            </GlassCard>
            {logged.map((l, i) => (
              <Animated.View key={`${l}-${i}`} entering={FadeInRight.springify().damping(springs.settle.damping)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={18} color={palette.success} />
                <Txt variant="strong">{l}</Txt>
              </Animated.View>
            ))}
          </View>
        )}

        {step === 3 && (
          <View>
            <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
              Tap the dates you work. Your Hub shows days off, and you can change this any time from Me.
            </Txt>
            <ShiftCalendar value={dates} onChange={setDates} />
          </View>
        )}
      </Animated.View>
    </Screen>
  );
}
