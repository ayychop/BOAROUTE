import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { localDateString } from '@/lib/budget';
import { managersFor, targetsFor } from '@/lib/frequency';
import { geocode } from '@/lib/geo';
import type { VisitTally } from '@/lib/route-engine';
import { storesInScope } from '@/lib/route-engine';
import { supabase } from '@/lib/supabaseClient';
import type { EventType, Expense, ExpenseCategory, GradeTargets, Manager, MileageLog, MileageType, Store, Visit, WorkEvent } from '@/lib/types';
import { syncEventReminders } from '@/services/notifications';
import { useAuth } from './AuthProvider';

const STORE_COLUMNS = 'id,user_id,name,address,grade,required_frequency,visits_completed,last_visit_date,assigned_manager,vibe,latitude,longitude';
const DAY_MS = 86_400_000;
const EMPTY: never[] = [];

interface DataValue {
  loading: boolean;
  error: string | null;
  stores: Store[];
  /** Stores this person routes (their managers' stores). */
  myStores: Store[];
  managers: Manager[];
  targets: GradeTargets;
  tallies: Record<string, VisitTally>;
  events: WorkEvent[];
  mileage: MileageLog[];
  expenses: Expense[];
  refresh: () => Promise<void>;
  logVisit: (storeId: string) => Promise<void>;
  undoLastVisit: (storeId: string) => Promise<void>;
  updateStoreAddress: (storeId: string, address: string) => Promise<{ located: boolean }>;
  assignStores: (storeIds: string[], manager: Manager) => Promise<void>;
  addEvent: (e: { title: string; description: string | null; event_date: string; reminder_before: boolean; reminder_on_day: boolean; event_type: EventType }) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  addMileage: (m: { miles: number; type: MileageType; notes: string | null; date?: string }) => Promise<void>;
  deleteMileage: (id: string) => Promise<void>;
  addExpense: (e: { amount: number; location: string; recipient: string; category: ExpenseCategory; date?: string }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;
  // Which user the data below belongs to; nothing is exposed for anyone else.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [mileage, setMileage] = useState<MileageLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const lastLoad = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const since = new Date(Date.now() - 120 * DAY_MS).toISOString();
    const sinceDate = localDateString(new Date(monthStart().getFullYear(), monthStart().getMonth() - 6, 1));
    const [s, v, e, m, x] = await Promise.all([
      supabase.from('stores').select(STORE_COLUMNS).order('name'),
      supabase.from('visits').select('id,store_id,user_id,visited_at').eq('user_id', userId).gte('visited_at', since).order('visited_at', { ascending: false }).limit(5000),
      supabase.from('events').select('*').eq('user_id', userId).order('event_date'),
      supabase.from('mileage_logs').select('*').eq('user_id', userId).gte('date', sinceDate).order('date', { ascending: false }),
      supabase.from('expenses').select('*').eq('user_id', userId).gte('date', sinceDate).order('date', { ascending: false }),
    ]);
    const firstError = s.error ?? v.error ?? e.error ?? m.error ?? x.error;
    setError(firstError ? firstError.message : null);
    if (!s.error) setStores((s.data ?? []) as Store[]);
    if (!v.error) setVisits((v.data ?? []) as Visit[]);
    if (!e.error) {
      const evs = (e.data ?? []) as WorkEvent[];
      setEvents(evs);
      syncEventReminders(evs).catch(() => {});
    }
    if (!m.error) setMileage((m.data ?? []) as MileageLog[]);
    if (!x.error) setExpenses((x.data ?? []) as Expense[]);
    lastLoad.current = Date.now();
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // refresh() only sets state after awaiting the network, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load your data');
      setLoadedFor(userId);
    });
  }, [userId, refresh]);

  // Refresh when coming back to the app after a while (new month, other devices).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastLoad.current > 5 * 60_000) refresh().catch(() => {});
    });
    return () => sub.remove();
  }, [refresh]);

  const mine = !!userId && loadedFor === userId;
  const loading = !mine;
  const vStores = mine ? stores : EMPTY;
  const vVisits = mine ? visits : EMPTY;
  const vEvents = mine ? events : EMPTY;
  const vMileage = mine ? mileage : EMPTY;
  const vExpenses = mine ? expenses : EMPTY;

  const tallies = useMemo(() => {
    const start = monthStart().getTime();
    const out: Record<string, VisitTally> = {};
    for (const v of vVisits as Visit[]) {
      const t = (out[v.store_id] ??= { count: 0, last: null });
      if (new Date(v.visited_at).getTime() >= start) t.count++;
      if (!t.last || v.visited_at > t.last) t.last = v.visited_at;
    }
    return out;
  }, [vVisits]);

  const managers = useMemo(() => managersFor(profile), [profile]);
  const myStores = useMemo(() => storesInScope(vStores as Store[], managers), [vStores, managers]);
  const targets = useMemo(() => targetsFor(profile), [profile]);

  const logVisit = useCallback(async (storeId: string) => {
    const { data, error: err } = await supabase.from('visits').insert({ store_id: storeId }).select('id,store_id,user_id,visited_at').single();
    if (err) throw err;
    setVisits((prev) => [data as Visit, ...prev]);
  }, []);

  const undoLastVisit = useCallback(
    async (storeId: string) => {
      const latest = visits.find((v) => v.store_id === storeId);
      if (!latest) return;
      setVisits((prev) => prev.filter((v) => v.id !== latest.id));
      const { error: err } = await supabase.from('visits').delete().eq('id', latest.id);
      if (err) {
        setVisits((prev) => [latest, ...prev]);
        throw err;
      }
    },
    [visits],
  );

  const updateStoreAddress = useCallback(
    async (storeId: string, address: string) => {
      const before = stores.find((s) => s.id === storeId);
      const clean = address.trim();
      // Show the new address immediately; the pin follows once geocoded.
      setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, address: clean } : s)));
      try {
        const point = await geocode(clean);
        const { data, error: err } = await supabase.rpc('update_store_address', {
          p_store_id: storeId,
          p_address: clean,
          p_latitude: point?.lat ?? null,
          p_longitude: point?.lng ?? null,
        });
        if (err) throw err;
        const row = (Array.isArray(data) ? data[0] : data) as Store | null;
        if (row) setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, ...row } : s)));
        return { located: !!point };
      } catch (err) {
        if (before) setStores((prev) => prev.map((s) => (s.id === storeId ? before : s)));
        throw err;
      }
    },
    [stores],
  );

  const assignStores = useCallback(
    async (storeIds: string[], manager: Manager) => {
      if (storeIds.length === 0) return;
      const snapshot = stores;
      setStores((prev) => prev.map((s) => (storeIds.includes(s.id) ? { ...s, assigned_manager: manager } : s)));
      const { error: err } = await supabase.from('stores').update({ assigned_manager: manager }).in('id', storeIds);
      if (err) {
        setStores(snapshot);
        throw err;
      }
    },
    [stores],
  );

  const addEvent = useCallback<DataValue['addEvent']>(async (e) => {
    const { data, error: err } = await supabase.from('events').insert(e).select('*').single();
    if (err) throw err;
    setEvents((prev) => {
      const next = [...prev, data as WorkEvent].sort((a, b) => a.event_date.localeCompare(b.event_date));
      syncEventReminders(next).catch(() => {});
      return next;
    });
  }, []);

  const deleteEvent = useCallback(
    async (id: string) => {
      const snapshot = events;
      const next = events.filter((e) => e.id !== id);
      setEvents(next);
      const { error: err } = await supabase.from('events').delete().eq('id', id);
      if (err) {
        setEvents(snapshot);
        throw err;
      }
      syncEventReminders(next).catch(() => {});
    },
    [events],
  );

  const addMileage = useCallback<DataValue['addMileage']>(async (m) => {
    const { data, error: err } = await supabase
      .from('mileage_logs')
      .insert({ miles: m.miles, type: m.type, notes: m.notes, date: m.date ?? localDateString(new Date()) })
      .select('*')
      .single();
    if (err) throw err;
    setMileage((prev) => [data as MileageLog, ...prev]);
  }, []);

  const deleteMileage = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('mileage_logs').delete().eq('id', id);
    if (err) throw err;
    setMileage((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addExpense = useCallback<DataValue['addExpense']>(async (e) => {
    const { data, error: err } = await supabase
      .from('expenses')
      .insert({ amount: e.amount, location: e.location, recipient: e.recipient, category: e.category, date: e.date ?? localDateString(new Date()) })
      .select('*')
      .single();
    if (err) throw err;
    setExpenses((prev) => [data as Expense, ...prev]);
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('expenses').delete().eq('id', id);
    if (err) throw err;
    setExpenses((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo<DataValue>(
    () => ({
      loading,
      error: mine ? error : null,
      stores: vStores as Store[],
      myStores,
      managers,
      targets,
      tallies,
      events: vEvents as WorkEvent[],
      mileage: vMileage as MileageLog[],
      expenses: vExpenses as Expense[],
      refresh,
      logVisit,
      undoLastVisit,
      updateStoreAddress,
      assignStores,
      addEvent,
      deleteEvent,
      addMileage,
      deleteMileage,
      addExpense,
      deleteExpense,
    }),
    [loading, mine, error, vStores, myStores, managers, targets, tallies, vEvents, vMileage, vExpenses, refresh, logVisit, undoLastVisit, updateStoreAddress, assignStores, addEvent, deleteEvent, addMileage, deleteMileage, addExpense, deleteExpense],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
