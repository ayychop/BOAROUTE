/**
 * Set by the database from team_members, by the signed-in email.
 * 'unassigned' is a pending sign-up, 'denied' a refused one: neither gets into the app.
 */
export type Role = 'admin' | 'user' | 'unassigned' | 'denied';
/** Field role picked on the Role Selection screen after the first sign-in (profiles.user_role). */
export type UserRole = 'OM' | 'OTM';
export type Grade = 'A' | 'B' | 'C' | 'D';
/** Store owners: the names Jo assigns stores to. Only Jo (Joseph) uses the app among them by default. */
export type Manager = 'Joseph' | 'Pete' | 'Marcia' | 'Jermaine' | 'Kishan' | 'Raphael';
/** Earlier owners still on some stores until Jo reassigns them in Store Management. */
export type LegacyOwner = 'David' | 'Sarah';
export type StoreOwner = Manager | LegacyOwner;
/** What an approved app user is set up as (team_members.manager_name). */
export type TeamSeat = 'Sarah' | 'David' | 'Pete';
export type TaskType = 'note' | 'email';
export type EventType = 'General' | 'Sales Day' | 'OOH';
export type MileageType = 'work' | 'personal';
export type ExpenseCategory = 'standard' | 'sales_day' | 'ooh' | 'town_takeover';
/** Stored on each expense (derived from category in the database). */
export type SessionType = 'Standard' | 'OOH_Session' | 'Town_Takeover';

export interface Profile {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  vehicle_model: string | null;
  starting_location: string | null;
  freq_a: number | null;
  freq_b: number | null;
  freq_c: number | null;
  freq_d: number | null;
  /** Managers whose stores this person routes, mirrored from team_members. Empty until approved. */
  route_managers: string[] | null;
  /** Whose stores are theirs (team_members.manager_name). NULL until approved. */
  manager_name?: string | null;
  /** Distance unit for every display: 'mi' (UK default) or 'km'. */
  distance_unit?: 'mi' | 'km' | null;
  /** Odometer in miles; numeric(9,1), so PostgREST may return a string. Trips add to it. */
  current_mileage: number | string | null;
  /** Working weekdays, 0 = Sunday ... 6 = Saturday. Only used until shift_dates is set. */
  working_days: number[];
  /** Exact working dates (YYYY-MM-DD) from the shift calendar. NULL until first saved. */
  shift_dates?: string[] | null;
  /** App settings without a column of their own (car indicator, route colour...). */
  preferences?: UserPreferences | null;
  /** Set when onboarding is finished. */
  onboarded_at: string | null;
  /** Monthly budgets in GBP; numeric(8,2), so PostgREST may return strings. */
  standard_budget: number | string | null;
  sales_day_budget: number | string | null;
  /** Per OOH / Sales Day session allowance in GBP (default 25). */
  ooh_session_allowance?: number | string | null;
  /** Daily Samsung IQ on Home. Only the admin switches it, per person, in Team Management. */
  show_training?: boolean;
  /** OM or OTM. NULL until picked; the app asks before anything else. Only the admin can change it after. */
  user_role?: UserRole | null;
}

export interface Store {
  id: string;
  user_id: string | null;
  name: string;
  address: string;
  grade: Grade;
  required_frequency: number;
  /** True when someone set required_frequency by hand; false means "use the person's grade target". */
  frequency_custom?: boolean;
  visits_completed: number;
  last_visit_date: string | null;
  assigned_manager: StoreOwner;
  vibe: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Visit {
  id: string;
  store_id: string;
  user_id: string;
  visited_at: string;
  /** Set on timed visits (Start Visit / Complete Visit); NULL on older ones. */
  visit_start_time?: string | null;
  visit_end_time?: string | null;
  /** Logged by hand from Store > Log Past Visit, without the visit timer. */
  is_manual?: boolean;
}

export type CarIconId = 'car-sport' | 'car' | 'arrow' | 'diamond' | 'bolt' | 'star';
export type RouteColorId = 'gold' | 'neon-blue' | 'violet' | 'emerald' | 'rose-gold' | 'platinum';

/** profiles.preferences (jsonb). Every key is optional; defaults live in src/lib/preferences.ts. */
export interface UserPreferences {
  car_icon?: CarIconId;
  route_color?: RouteColorId;
  /** Free text, e.g. "Ford Puma ST-Line". */
  car_make_model?: string;
  /** UK registration as typed, e.g. "AB12 CDE". */
  car_reg?: string;
  /** What the yellow plate on the Home car shows, e.g. "AB12 CDE". Empty means their first name. */
  custom_plate?: string;
}

export interface WorkEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;
  reminder_before: boolean;
  reminder_on_day: boolean;
  event_type: EventType;
  created_at: string;
}

export interface Task {
  id: string;
  store_id: string | null;
  user_id: string;
  title: string;
  content: string;
  media_urls: string[];
  task_type: TaskType;
  created_at: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type GradeTargets = Record<Grade, number>;

export interface MileageLog {
  id: string;
  user_id: string;
  /** YYYY-MM-DD */
  date: string;
  miles: number | string;
  type: MileageType;
  notes: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  /** YYYY-MM-DD */
  date: string;
  /** numeric(10,2); PostgREST may return it as a string */
  amount: number | string;
  location: string;
  recipient: string;
  category: ExpenseCategory;
  session_type?: SessionType | null;
  /** YYYY-MM-DD of the session; defaults to date. */
  session_date?: string | null;
  /** Town Takeover only: the custom budget for that day (numeric, may arrive as a string). */
  event_budget?: number | string | null;
  /** Optional free-text label, e.g. "Parking". The category still decides the budget. */
  custom_label?: string | null;
  /** Receipt photos: object paths in the private task-media bucket. */
  receipt_paths?: string[] | null;
  created_at: string;
}
