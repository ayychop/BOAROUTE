import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { localDateString } from '@/lib/budget';
import { isMember, managersFor, targetsFor } from '@/lib/frequency';
import { geocode } from '@/lib/geo';
import { getPref, setPref } from '@/lib/prefs';
import type { VisitTally } from '@/lib/route-engine';
import { storesForPerson } from '@/lib/store-selection';
import { supabase } from '@/lib/supabaseClient';
import type { EventType, Expense, ExpenseCategory, Grade, GradeTargets, Manager, MileageLog, MileageType, Store, StoreOwner, Visit, WorkEvent } from '@/lib/types';
import { canCompleteVisit, parseActiveVisit, type ActiveVisit } from '@/lib/visit-timer';
import { deleteMedia } from '@/services/media';
import { syncEventReminders } from '@/services/notifications';
import { cancelVisitAlarm, scheduleVisitAlarm } from '@/services/visit-alarm';
import { useAuth } from './AuthProvider';

// '*' so the app keeps working whether or not the newest columns (frequency_custom) exist yet.
const STORE_COLUMNS = '*';

const GRADE_SET = new Set<Grade>(['A', 'B', 'C', 'D']);

/** Normalises a store row: grade trimmed and upper-cased so filters match, coordinates as numbers. */
function cleanStore(raw: Store): Store {
  const grade = String(raw.grade ?? '').trim().toUpperCase() as Grade;
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    ...raw,
    grade: GRADE_SET.has(grade) ? grade : 'D',
    required_frequency: Number(raw.required_frequency) || 0,
    frequency_custom: raw.frequency_custom === true,
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
  };
}
const EMPTY: never[] = [];

export interface StoreAssignee {
  store_id: string;
  user_id: string;
}

interface DataValue {
  loading: boolean;
  error: string | null;
  stores: Store[];
  /** Stores this person routes: the ones they chose, or their managers' stores if they chose none, plus any handed to them. */
  myStores: Store[];
  /** Every store in this person's patch (pickers). The admin's full list stays in stores, for Store Management. */
  patchStores: Store[];
  /** Stores handed to one person on top of their patch, owner unchanged. The admin gets every row, everyone else their own. */
  storeAssignees: StoreAssignee[];
  /** Admin: show a store to one team member (on) or stop (off). */
  setStoreAssignee: (storeId: string, userId: string, on: boolean) => Promise<void>;
  /** Store ids this person picked as theirs (user_stores). */
  chosenStoreIds: string[];
  saveChosenStores: (storeIds: string[]) => Promise<void>;
  /** Store owners whose stores this person works (badges and filters appear when there are several). */
  managers: StoreOwner[];
  targets: GradeTargets;
  tallies: Record<string, VisitTally>;
  /** This person's visits from the last six months, newest first. */
  visits: Visit[];
  /** The visit in progress on this device, if any. */
  activeVisit: ActiveVisit | null;
  /** Starts the visit clock for a store and schedules the one-hour clock-out alarm. */
  startVisit: (storeId: string) => Promise<void>;
  /** Saves the visit with its start and end time. Only allowed after the 25-minute minimum. */
  completeVisit: () => Promise<{ storeId: string; minutes: number }>;
  cancelVisit: () => Promise<void>;
  /** Continue visit: silences the one-hour alarm and keeps the clock running. */
  silenceVisitAlarm: () => Promise<void>;
  events: WorkEvent[];
  mileage: MileageLog[];
  expenses: Expense[];
  refresh: () => Promise<void>;
  /** Grade and monthly frequency for a store. frequency null = use the grade default. */
  updateStoreSettings: (storeId: string, grade: Grade, frequency: number | null) => Promise<void>;
  undoLastVisit: (storeId: string) => Promise<void>;
  updateStoreAddress: (storeId: string, address: string) => Promise<{ located: boolean }>;
  assignStores: (storeIds: string[], manager: Manager) => Promise<void>;
  addEvent: (e: { title: string; description: string | null; event_date: string; reminder_before: boolean; reminder_on_day: boolean; event_type: EventType }) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  addMileage: (m: { miles: number; type: MileageType; notes: string | null; date?: string }) => Promise<void>;
  deleteMileage: (id: string) => Promise<void>;
  addExpense: (e: { amount: number; location: string; recipient: string; category: ExpenseCategory; date?: string; eventBudget?: number | null; customLabel?: string | null; receiptPaths?: string[] }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, profile, refreshProfile } = useAuth();
  const userId = session?.user.id ?? null;
  // Store visibility (RLS) follows the profile's role and patch, which the
  // sign-in refresh (refresh_my_access) settles. Loading waits for that
  // profile and reloads whenever access changes, so a first sign-in never
  // caches an empty store list from before the patch was applied.
  const accessKey = userId && profile?.id === userId && isMember(profile) ? `${userId}|${profile.role}|${(profile.route_managers ?? []).join(',')}` : null;
  // Which user and access the data below belongs to; nothing is exposed for anyone else.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [mileage, setMileage] = useState<MileageLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<StoreAssignee[]>([]);
  const lastLoad = useRef(0);
  const retried = useRef<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const activeKey = userId ? `visit.active.${userId}` : null;
  const [active, setActive] = useState<{ key: string | null; visit: ActiveVisit | null }>({ key: null, visit: null });
  const activeVisit = active.key === activeKey ? active.visit : activeKey ? parseActiveVisit(getPref(activeKey)) : null;
  const saveActive = useCallback(
    (visit: ActiveVisit | null) => {
      if (!activeKey) return;
      setPref(activeKey, visit ? JSON.stringify(visit) : null);
      setActive({ key: activeKey, visit });
    },
    [activeKey],
  );

  const refresh = useCallback(async () => {
    if (!userId || !accessKey) return;
    const sinceDate = localDateString(new Date(monthStart().getFullYear(), monthStart().getMonth() - 6, 1));
    const since = new Date(`${sinceDate}T00:00:00`).toISOString();
    const [s, v, e, m, x, u, a] = await Promise.all([
      supabase.from('stores').select(STORE_COLUMNS).order('name'),
      // '*' so visits load before and after the visit-time columns exist.
      supabase.from('visits').select('*').eq('user_id', userId).gte('visited_at', since).order('visited_at', { ascending: false }).limit(5000),
      supabase.from('events').select('*').eq('user_id', userId).order('event_date'),
      supabase.from('mileage_logs').select('*').eq('user_id', userId).gte('date', sinceDate).order('date', { ascending: false }),
      supabase.from('expenses').select('*').eq('user_id', userId).gte('date', sinceDate).order('date', { ascending: false }),
      supabase.from('user_stores').select('store_id').eq('user_id', userId),
      supabase.from('store_assignees').select('store_id,user_id'),
    ]);
    const firstError = s.error ?? v.error ?? e.error ?? m.error ?? x.error ?? u.error;
    setError(firstError ? firstError.message : null);
    if (!s.error) setStores(((s.data ?? []) as Store[]).map(cleanStore));
    if (!v.error) setVisits((v.data ?? []) as Visit[]);
    if (!e.error) {
      const evs = (e.data ?? []) as WorkEvent[];
      setEvents(evs);
      syncEventReminders(evs).catch(() => {});
    }
    if (!m.error) setMileage((m.data ?? []) as MileageLog[]);
    if (!x.error) setExpenses((x.data ?? []) as Expense[]);
    if (!u.error) setChosen((u.data ?? []).map((r: { store_id: string }) => r.store_id));
    // Left out of the error banner: before the SQL update there is no table, and the patch still works.
    setAssignees(a.error ? [] : ((a.data ?? []) as StoreAssignee[]));
    lastLoad.current = Date.now();
    setLoadedFor(accessKey);
    // A brand-new approval can reach the app a moment before the database
    // finishes applying the patch. One quiet retry covers that window.
    if (!s.error && (s.data ?? []).length === 0 && retried.current !== accessKey) {
      retried.current = accessKey;
      setTimeout(() => setRetryTick((t) => t + 1), 2000);
    }
  }, [userId, accessKey]);

  useEffect(() => {
    if (!accessKey) return;
    // refresh() only sets state after awaiting the network, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load your data');
      setLoadedFor(accessKey);
    });
  }, [accessKey, refresh, retryTick]);

  // Refresh when coming back to the app after a while (new month, other devices).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastLoad.current > 5 * 60_000) refresh().catch(() => {});
    });
    return () => sub.remove();
  }, [refresh]);

  const mine = !!accessKey && loadedFor === accessKey;
  const loading = !mine;
  const vStores = mine ? stores : EMPTY;
  const vVisits = mine ? visits : EMPTY;
  const vEvents = mine ? events : EMPTY;
  const vMileage = mine ? mileage : EMPTY;
  const vExpenses = mine ? expenses : EMPTY;
  const vChosen = mine ? chosen : EMPTY;
  const vAssignees = mine ? assignees : EMPTY;

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
  const handedToMe = useMemo(() => (vAssignees as StoreAssignee[]).filter((r) => r.user_id === userId).map((r) => r.store_id), [vAssignees, userId]);
  const { patch: patchStores, mine: myStores } = useMemo(
    () => storesForPerson(vStores as Store[], managers, vChosen as string[], handedToMe),
    [vStores, managers, vChosen, handedToMe],
  );

  const saveChosenStores = useCallback(
    async (storeIds: string[]) => {
      if (!userId) throw new Error('Not signed in');
      const next = new Set(storeIds);
      const prev = new Set(chosen);
      const add = storeIds.filter((id) => !prev.has(id));
      const remove = chosen.filter((id) => !next.has(id));
      if (add.length) {
        const { error: err } = await supabase.from('user_stores').upsert(
          add.map((store_id) => ({ user_id: userId, store_id })),
          { onConflict: 'user_id,store_id', ignoreDuplicates: true },
        );
        if (err) throw err;
      }
      if (remove.length) {
        const { error: err } = await supabase.from('user_stores').delete().eq('user_id', userId).in('store_id', remove);
        if (err) throw err;
      }
      setChosen([...next]);
    },
    [userId, chosen],
  );
  const targets = useMemo(() => targetsFor(profile), [profile]);

  const startVisit = useCallback(
    async (storeId: string) => {
      if (activeVisit && activeVisit.storeId !== storeId) throw new Error('Finish or cancel the visit you already started first.');
      const visit: ActiveVisit = { storeId, startedAt: new Date().toISOString() };
      saveActive(visit);
      const name = stores.find((s) => s.id === storeId)?.name ?? 'Your store';
      // The alarm is a safety net; the visit clock runs without it.
      scheduleVisitAlarm(name, storeId, visit.startedAt).catch(() => {});
    },
    [activeVisit, saveActive, stores],
  );

  const completeVisit = useCallback(async () => {
    const current = activeVisit;
    if (!current) throw new Error('No visit in progress.');
    if (!canCompleteVisit(current.startedAt, Date.now())) throw new Error('Visits must be at least 25 minutes long.');
    const end = new Date().toISOString();
    const { data, error: err } = await supabase
      .from('visits')
      .insert({ store_id: current.storeId, visit_start_time: current.startedAt, visit_end_time: end, visited_at: end })
      .select('*')
      .single();
    if (err) {
      if (/visit_start_time|visit_end_time/.test(err.message) && !/at least|Start the visit/.test(err.message)) throw new Error('Timed visits need the latest database update. Ask your admin to re-run the SQL file.');
      throw err;
    }
    setVisits((prev) => [data as Visit, ...prev]);
    saveActive(null);
    cancelVisitAlarm().catch(() => {});
    return { storeId: current.storeId, minutes: (new Date(end).getTime() - new Date(current.startedAt).getTime()) / 60_000 };
  }, [activeVisit, saveActive]);

  const cancelVisit = useCallback(async () => {
    saveActive(null);
    await cancelVisitAlarm().catch(() => {});
  }, [saveActive]);

  const silenceVisitAlarm = useCallback(async () => {
    if (!activeVisit) return;
    saveActive({ ...activeVisit, alarmSilenced: true });
    await cancelVisitAlarm().catch(() => {});
  }, [activeVisit, saveActive]);

  const updateStoreSettings = useCallback(
    async (storeId: string, grade: Grade, frequency: number | null) => {
      const before = stores.find((s) => s.id === storeId);
      setStores((prev) =>
        prev.map((s) => (s.id === storeId ? { ...s, grade, frequency_custom: frequency !== null, required_frequency: frequency ?? s.required_frequency } : s)),
      );
      const { data, error: err } = await supabase.rpc('update_store_settings', { p_store_id: storeId, p_grade: grade, p_frequency: frequency });
      if (err) {
        if (before) setStores((prev) => prev.map((s) => (s.id === storeId ? before : s)));
        throw new Error(/update_store_settings/.test(err.message) ? 'Store editing needs the latest database update. Ask your admin to re-run the SQL file.' : err.message);
      }
      const row = (Array.isArray(data) ? data[0] : data) as Store | null;
      if (row) setStores((prev) => prev.map((s) => (s.id === storeId ? cleanStore({ ...s, ...row }) : s)));
    },
    [stores],
  );

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

  const setStoreAssignee = useCallback(async (storeId: string, assignee: string, on: boolean) => {
    const row = { store_id: storeId, user_id: assignee };
    const same = (r: StoreAssignee) => r.store_id === storeId && r.user_id === assignee;
    setAssignees((prev) => (on ? [...prev.filter((r) => !same(r)), row] : prev.filter((r) => !same(r))));
    const { error: err } = on
      ? await supabase.from('store_assignees').upsert(row, { onConflict: 'store_id,user_id', ignoreDuplicates: true })
      : await supabase.from('store_assignees').delete().eq('store_id', storeId).eq('user_id', assignee);
    if (err) {
      setAssignees((prev) => (on ? prev.filter((r) => !same(r)) : [...prev, row]));
      if (/store_assignees/.test(err.message)) throw new Error('Handing stores to one person needs the latest database update. Re-run the SQL file in Supabase.');
      throw err;
    }
  }, []);

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
    // The database adds the trip to the odometer; pull the new reading.
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const deleteMileage = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('mileage_logs').delete().eq('id', id);
    if (err) throw err;
    setMileage((prev) => prev.filter((m) => m.id !== id));
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const addExpense = useCallback<DataValue['addExpense']>(async (e) => {
    const { data, error: err } = await supabase
      .from('expenses')
      .insert({
        amount: e.amount,
        location: e.location,
        recipient: e.recipient,
        category: e.category,
        date: e.date ?? localDateString(new Date()),
        // Town Takeovers carry their own day budget; other categories must not send the column.
        ...(e.category === 'town_takeover' ? { event_budget: e.eventBudget ?? null } : {}),
        // Only sent when filled in, so expenses still save before the column exists.
        ...(e.customLabel?.trim() ? { custom_label: e.customLabel.trim().slice(0, 60) } : {}),
        ...(e.receiptPaths?.length ? { receipt_paths: e.receiptPaths } : {}),
      })
      .select('*')
      .single();
    if (err) {
      // The database enforces the session and weekly caps; its message is written for people.
      if (err.code === '23514' && /cap/i.test(err.message)) throw new Error(err.message.replace(/GBP\s?/g, '£'));
      if (/receipt_paths/.test(err.message)) throw new Error('Receipt photos need the latest database update. Ask your admin to re-run the SQL file.');
      if (/custom_label/.test(err.message)) throw new Error('Expense labels need the latest database update. Ask your admin to re-run the SQL file.');
      if (/event_budget|town_takeover|expenses_category_check/.test(err.message)) throw new Error('Town Takeovers need the latest database update. Ask your admin to re-run the SQL file.');
      throw err;
    }
    setExpenses((prev) => [data as Expense, ...prev]);
  }, []);

  const deleteExpense = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from('expenses').delete().eq('id', id);
      if (err) throw err;
      const receipts = expenses.find((x) => x.id === id)?.receipt_paths ?? [];
      setExpenses((prev) => prev.filter((x) => x.id !== id));
      // The row is gone either way; a leftover file is harmless, so don't fail the delete over it.
      if (receipts.length) deleteMedia(receipts).catch(() => {});
    },
    [expenses],
  );

  const value = useMemo<DataValue>(
    () => ({
      loading,
      error: mine ? error : null,
      stores: vStores as Store[],
      myStores,
      patchStores,
      storeAssignees: vAssignees as StoreAssignee[],
      setStoreAssignee,
      chosenStoreIds: vChosen as string[],
      saveChosenStores,
      managers,
      targets,
      tallies,
      visits: vVisits as Visit[],
      activeVisit,
      startVisit,
      completeVisit,
      cancelVisit,
      silenceVisitAlarm,
      events: vEvents as WorkEvent[],
      mileage: vMileage as MileageLog[],
      expenses: vExpenses as Expense[],
      refresh,
      updateStoreSettings,
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
    [loading, mine, error, vStores, myStores, patchStores, vAssignees, setStoreAssignee, vChosen, saveChosenStores, managers, targets, tallies, vVisits, activeVisit, startVisit, completeVisit, cancelVisit, silenceVisitAlarm, vEvents, vMileage, vExpenses, refresh, updateStoreSettings, undoLastVisit, updateStoreAddress, assignStores, addEvent, deleteEvent, addMileage, deleteMileage, addExpense, deleteExpense],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
