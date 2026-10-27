import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect, useMemo } from 'react';
import { computeDue } from '@/lib/route-engine';
import { useData } from '@/providers/DataProvider';
import { CarAppService } from './CarAppService';
import { EMPTY_CAR_CONTEXT, MAX_CAR_ROWS, type CarContext } from './car-templates';

/**
 * Feeds the Android Auto screen the person's upcoming stores and handles its
 * Start Visit button. Renders nothing; mounted once for signed-in users.
 */
export function CarBridge() {
  const { myStores, patchStores, tallies, targets, weekLocked, activeVisit, startVisit } = useData();

  const context = useMemo<CarContext>(() => {
    // Stores an OM is locked out of this week would only refuse Start Visit, so they are left off.
    const due = computeDue(myStores.filter((s) => !weekLocked.has(s.id)), tallies, targets).slice(0, MAX_CAR_ROWS);
    const storeIds: Record<string, string> = {};
    for (const s of patchStores) storeIds[s.name] = s.id;
    for (const s of myStores) storeIds[s.name] = s.id;
    const visiting = activeVisit ? (patchStores.find((s) => s.id === activeVisit.storeId)?.name ?? 'your store') : null;
    return {
      upcoming: due.map((d) => ({ id: d.store.id, name: d.store.name, detail: `Grade ${d.store.grade} · ${d.remaining} ${d.remaining === 1 ? 'visit' : 'visits'} to go` })),
      storeIds,
      visiting,
    };
  }, [myStores, patchStores, tallies, targets, weekLocked, activeVisit]);

  useEffect(() => {
    CarAppService.setContext(context);
  }, [context]);

  useEffect(() => {
    CarAppService.onStartVisit((storeId) => {
      const name = patchStores.find((s) => s.id === storeId)?.name ?? 'your store';
      startVisit(storeId)
        .then(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Speech.speak(`Visit started at ${name}`, { language: 'en-GB' });
        })
        .catch((e: unknown) => Speech.speak(e instanceof Error ? e.message : 'Could not start the visit.', { language: 'en-GB' }));
    });
    return () => CarAppService.onStartVisit(null);
  }, [startVisit, patchStores]);

  // Signed out: the car goes back to the plain prompt.
  useEffect(() => () => CarAppService.setContext(EMPTY_CAR_CONTEXT), []);

  return null;
}
