import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CarIllustration } from '@/components/CarIllustration';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { NumberPlate } from '@/components/NumberPlate';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { VehiclePicker } from '@/components/VehiclePicker';
import { useLayout } from '@/hooks/useLayout';
import { MAX_MAKE_MODEL, MAX_REG, formatReg, plateName, prefsFor } from '@/lib/preferences';
import { VEHICLES, vehicleFor, type Vehicle } from '@/lib/vehicles';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function ChangeVehicle() {
  const { palette } = useTheme();
  const { contentWidth } = useLayout();
  const { profile, updateProfile } = useAuth();
  const prefs = prefsFor(profile);
  const [vehicle, setVehicle] = useState<Vehicle['id'] | null>(vehicleFor(profile?.vehicle_model)?.id ?? null);
  const [makeModel, setMakeModel] = useState(prefs.car_make_model ?? '');
  const [reg, setReg] = useState(prefs.car_reg ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = plateName(profile?.name, profile?.email);
  const typedCar = makeModel.trim();

  const save = async () => {
    const v = VEHICLES.find((x) => x.id === vehicle);
    if (!v && !typedCar) return setError("Pick a photo or type your car's make and model.");
    setBusy(true);
    setError(null);
    try {
      // One save, so the photo choice and the typed details never drift apart.
      await updateProfile({
        ...(v ? { vehicle_model: v.model } : null),
        preferences: { ...(profile?.preferences ?? {}), car_make_model: typedCar || undefined, car_reg: reg.trim() ? formatReg(reg) : undefined },
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your vehicle.');
    } finally {
      setBusy(false);
    }
  };

  const carW = Math.min(contentWidth - 40, 420);

  return (
    <Screen back kicker="Cockpit" title="Your vehicle">
      <GlassCard glow="gold" animateIn={false} style={{ alignItems: 'center', gap: 12 }}>
        <CarIllustration width={carW} accent={palette.gold} plate={name} label={typedCar || 'Your car'} shadow={palette.statusBar === 'dark' ? 'rgba(60,40,10,0.18)' : 'rgba(0,0,0,0.5)'} />
        <NumberPlate text={name} height={40} />
        <Txt variant="caption" tone="dim" align="center">
          {typedCar || 'Your car'}
          {reg.trim() ? ` · ${formatReg(reg)}` : ''}
        </Txt>
      </GlassCard>

      <SectionHeader title="Car details" />
      <GlassCard animateIn={false}>
        <Field label="Make and model" icon="car-sport-outline" value={makeModel} onChangeText={setMakeModel} placeholder="e.g. Ford Puma ST-Line" maxLength={MAX_MAKE_MODEL} autoCapitalize="words" returnKeyType="next" />
        <Field
          label="Registration plate"
          icon="card-outline"
          value={reg}
          onChangeText={(t) => setReg(t.toUpperCase())}
          onBlur={() => reg.trim() && setReg(formatReg(reg))}
          placeholder="AB12 CDE"
          maxLength={MAX_REG}
          autoCapitalize="characters"
          autoCorrect={false}
          hint="Shown on your Hub and in reports. Your name goes on the plate above."
        />
      </GlassCard>

      <SectionHeader title="Photo" />
      <VehiclePicker value={vehicle} onChange={setVehicle} />
      <View style={{ marginTop: 20 }}>
        <NeonButton label="Save vehicle" icon="checkmark" onPress={save} loading={busy} disabled={!vehicle && !typedCar} size="lg" full />
        {error ? (
          <Txt variant="caption" tone="danger" align="center" style={{ marginTop: 10 }}>
            {error}
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
