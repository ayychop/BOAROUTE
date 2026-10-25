import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { LoadingBlock } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { StoreSelector } from '@/components/StoreSelector';
import { Txt } from '@/components/Txt';
import { useData } from '@/providers/DataProvider';

export default function MyStores() {
  const { stores, chosenStoreIds, myStores, saveChosenStores, loading } = useData();
  // Start from the saved picks, or from whatever the route currently covers.
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? (chosenStoreIds.length ? chosenStoreIds : myStores.map((s) => s.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (selected.length === 0) return setError('Keep at least one store.');
    setBusy(true);
    setError(null);
    try {
      await saveChosenStores(selected);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your stores.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      kicker="Your patch"
      title="My stores"
      footer={
        <>
          {error ? (
            <Txt variant="caption" tone="danger" align="center" style={{ marginBottom: 10 }}>
              {error}
            </Txt>
          ) : null}
          <NeonButton label={`Save ${selected.length} stores`} icon="checkmark" onPress={save} loading={busy} disabled={picked === null} size="lg" full />
        </>
      }
    >
      <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
        Routes, targets and the Stores tab are built from the stores you tick here.
      </Txt>
      {loading ? <LoadingBlock label="Loading stores" /> : <StoreSelector stores={stores} selected={selected} onChange={setPicked} />}
    </Screen>
  );
}
