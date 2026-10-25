import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { BRLogo } from '@/components/BRLogo';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { VehiclePicker } from '@/components/VehiclePicker';
import { geocode, normalisePostcode } from '@/lib/geo';
import { VEHICLES, vehicleFor, type Vehicle } from '@/lib/vehicles';
import { useAuth } from '@/providers/AuthProvider';

export default function Onboarding() {
  const { profile, updateProfile, isAdmin } = useAuth();
  const [step, setStep] = useState<0 | 1>(0);
  const [vehicle, setVehicle] = useState<Vehicle['id'] | null>(vehicleFor(profile?.vehicle_model)?.id ?? (isAdmin ? '25' : null));
  const [name, setName] = useState(profile?.name ?? '');
  const [start, setStart] = useState(profile?.starting_location ?? (isAdmin ? 'HP13 6BU' : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setError(null);
    const v = VEHICLES.find((x) => x.id === vehicle);
    if (!v) return setError('Choose your vehicle first.');
    if (!start.trim()) return setError('Add your starting postcode so routes begin from home.');
    setBusy(true);
    try {
      const point = await geocode(start);
      if (!point) {
        setError('We could not find that location. Try a full UK postcode like HP13 6BU.');
        return;
      }
      await updateProfile({ vehicle_model: v.model, starting_location: normalisePostcode(start), name: name.trim() || profile?.name || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      kicker={`Step ${step + 1} of 2`}
      title={step === 0 ? 'Select your vehicle' : 'Calibrate your cockpit'}
      right={<BRLogo size={40} glow={false} />}
    >
      {step === 0 ? (
        <Animated.View key="vehicle" entering={FadeInRight.duration(350)} exiting={FadeOutLeft.duration(250)}>
          <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
            Your digital cockpit is tuned to your car. Pick the plate you drive.
          </Txt>
          <VehiclePicker value={vehicle} onChange={setVehicle} />
          <View style={{ marginTop: 22 }}>
            <NeonButton label="Continue" icon="arrow-forward" onPress={() => (vehicle ? setStep(1) : setError('Choose your vehicle first.'))} size="lg" full />
            {error ? (
              <Txt variant="caption" tone="danger" align="center" style={{ marginTop: 10 }}>
                {error}
              </Txt>
            ) : null}
          </View>
        </Animated.View>
      ) : (
        <Animated.View key="details" entering={FadeInRight.duration(350)}>
          <GlassCard glow="primary">
            <Field label="Your name" icon="person-outline" value={name} onChangeText={setName} placeholder="Your first name" autoCapitalize="words" returnKeyType="next" />
            <Field
              label="Starting location"
              icon="home-outline"
              value={start}
              onChangeText={setStart}
              placeholder="e.g. HP13 6BU"
              autoCapitalize="characters"
              hint="Every route starts and ends here. A UK postcode works best."
              returnKeyType="done"
              onSubmitEditing={finish}
            />
            {error ? (
              <Txt variant="caption" tone="danger" style={{ marginBottom: 12 }}>
                {error}
              </Txt>
            ) : null}
            <View style={{ gap: 12 }}>
              <NeonButton label="Launch BOAROUTE" icon="rocket" variant="gold" onPress={finish} loading={busy} size="lg" full />
              <NeonButton label="Back" variant="ghost" onPress={() => setStep(0)} full />
            </View>
          </GlassCard>
        </Animated.View>
      )}
    </Screen>
  );
}
