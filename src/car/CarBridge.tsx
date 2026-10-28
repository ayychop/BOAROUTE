import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { useUnits } from '@/hooks/useUnits';
import { computeDue } from '@/lib/route-engine';
import { formatDuration, MIN_VISIT_MS } from '@/lib/visit-timer';
import { supabase } from '@/lib/supabaseClient';
import { useData } from '@/providers/DataProvider';
import { setCheckinStores, setCheckinVisiting } from '@/services/checkin-watch';
import { startHazardWatch, stopHazardWatch } from '@/services/hazard-watch';
import { fetchOpenOrder, fetchOrderItems } from '@/services/team-orders';
import { CarAppService } from './CarAppService';
import { EMPTY_CAR_CONTEXT, type CarContext } from './car-state';

/**
 * Connects the Android Auto screen to the person's data: their next stores
 * and running visit go to the car, and the car's Start Visit / End Visit
 * buttons run the same startVisit / completeVisit as the phone, so the
 * 25-minute timer starts and the visit is logged to Supabase. Also keeps the
 * co-pilot on for the whole time Android Auto is connected. Renders nothing;
 * mounted once for signed-in users.
 */
export function CarBridge() {
  const { myStores, patchStores, tallies, targets, weekLocked, activeVisit, startVisit, completeVisit } = useData();
  const units = useUnits();

  const context = useMemo<CarContext>(() => {
    // Stores an OM is locked out of this week would only refuse Start Visit, so they are left off.
    const due = computeDue(myStores.filter((s) => !weekLocked.has(s.id)), tallies, targets);
    const storeIds: Record<string, string> = {};
    for (const s of patchStores) storeIds[s.name] = s.id;
    for (const s of myStores) storeIds[s.name] = s.id;
    const visitName = activeVisit ? (patchStores.find((s) => s.id === activeVisit.storeId)?.name ?? 'your store') : null;
    return {
      upcoming: due.slice(0, 6).map((d) => ({ id: d.store.id, name: d.store.name })),
      storeIds,
      visit: activeVisit && visitName ? { storeName: visitName, startedAt: activeVisit.startedAt } : null,
      lockMs: MIN_VISIT_MS,
    };
  }, [myStores, patchStores, tallies, targets, weekLocked, activeVisit]);

  useEffect(() => {
    CarAppService.setContext(context);
  }, [context]);

  useEffect(() => {
    CarAppService.setMetric(units.unit === 'km');
  }, [units.unit]);

  // Feed the check-in reminder: the person's own stores that have coordinates.
  useEffect(() => {
    setCheckinStores(
      myStores
        .filter((s): s is typeof s & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null)
        .map((s) => ({ id: s.id, name: s.name, lat: s.latitude, lng: s.longitude })),
    );
  }, [myStores]);

  useEffect(() => {
    setCheckinVisiting(!!activeVisit);
  }, [activeVisit]);

  // Keep the idle car screen showing the running group lunch order.
  useEffect(() => {
    let cancelled = false;
    const refreshLunch = async () => {
      try {
        const open = await fetchOpenOrder();
        if (cancelled) return;
        if (!open) return CarAppService.setLunch(null);
        const items = await fetchOrderItems(open.id);
        if (cancelled) return;
        const where = open.place ? ` (${open.place})` : '';
        CarAppService.setLunch(items.length === 0 ? `Lunch order open${where}` : `Lunch${where}: ${items.length} ${items.length === 1 ? 'item' : 'items'}`);
      } catch {
        // Leave the last summary in place if the fetch fails.
      }
    };
    refreshLunch();
    const channel = supabase
      .channel('car-lunch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_order_items' }, refreshLunch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_orders' }, refreshLunch)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const nameOf = (id: string) => patchStores.find((s) => s.id === id)?.name ?? 'your store';
    CarAppService.onStartVisit((storeId) => {
      startVisit(storeId)
        .then(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          CarAppService.toast(`Visit started at ${nameOf(storeId)}. 25 minutes on the clock.`);
        })
        .catch((e: unknown) => CarAppService.toast(e instanceof Error ? e.message : 'Could not start the visit.'));
    });
    CarAppService.onEndVisit(() => {
      completeVisit()
        .then(({ storeId, minutes }) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          CarAppService.toast(`Visit logged: ${formatDuration(minutes)} at ${nameOf(storeId)}.`);
        })
        .catch((e: unknown) => CarAppService.toast(e instanceof Error ? e.message : 'Could not log the visit.'));
    });
    return () => {
      CarAppService.onStartVisit(null);
      CarAppService.onEndVisit(null);
    };
  }, [startVisit, completeVisit, patchStores]);

  // Co-pilot alerts for every drive with Android Auto, whichever app is navigating.
  useEffect(() => {
    const follow = (connected: boolean) => {
      if (connected) startHazardWatch('car').catch(() => {});
      else stopHazardWatch('car').catch(() => {});
    };
    if (CarAppService.isConnected()) follow(true);
    const off = CarAppService.onConnectionChange(follow);
    return () => {
      off();
      stopHazardWatch('car').catch(() => {});
    };
  }, []);

  // Signed out: the car goes back to the plain prompt.
  useEffect(() => () => CarAppService.setContext(EMPTY_CAR_CONTEXT), []);

  return null;
}
