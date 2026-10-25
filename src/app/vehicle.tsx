import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { VehiclePicker } from '@/components/VehiclePicker';
import { VEHICLES, vehicleFor, type Vehicle } from '@/lib/vehicles';
import { useAuth } from '@/providers/AuthProvider';

export default function ChangeVehicle() {
  const { profile, updateProfile } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle['id'] | null>(vehicleFor(profile?.vehicle_model)?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const v = VEHICLES.find((x) => x.id === vehicle);
    if (!v) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ vehicle_model: v.model });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your vehicle.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back kicker="Cockpit" title="Your vehicle">
      <VehiclePicker value={vehicle} onChange={setVehicle} />
      <View style={{ marginTop: 20 }}>
        <NeonButton label="Save vehicle" icon="checkmark" onPress={save} loading={busy} disabled={!vehicle} size="lg" full />
        {error ? (
          <Txt variant="caption" tone="danger" align="center" style={{ marginTop: 10 }}>
            {error}
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
