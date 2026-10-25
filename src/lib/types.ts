export type Role = 'admin' | 'user';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type Manager = 'Joseph' | 'Pete' | 'David' | 'Marcia';
export type TaskType = 'note' | 'email';
export type EventType = 'General' | 'Sales Day' | 'OOH';
export type MileageType = 'work' | 'personal';
export type ExpenseCategory = 'standard' | 'sales_day' | 'ooh';

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
  /** Managers whose stores this person routes. NULL or empty means the role default. */
  route_managers: string[] | null;
  /** Odometer in miles; numeric(9,1), so PostgREST may return a string. Trips add to it. */
  current_mileage: number | string | null;
  /** Working weekdays, 0 = Sunday ... 6 = Saturday. */
  working_days: number[];
  /** Set when onboarding is finished. */
  onboarded_at: string | null;
  /** Monthly budgets in GBP; numeric(8,2), so PostgREST may return strings. */
  standard_budget: number | string | null;
  sales_day_budget: number | string | null;
}

export interface Store {
  id: string;
  user_id: string | null;
  name: string;
  address: string;
  grade: Grade;
  required_frequency: number;
  visits_completed: number;
  last_visit_date: string | null;
  assigned_manager: Manager;
  vibe: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Visit {
  id: string;
  store_id: string;
  user_id: string;
  visited_at: string;
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
  created_at: string;
}
