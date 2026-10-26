import { dayOfYear } from './motivation';

/** A row of public.training_questions. */
export interface TrainingQuestion {
  id: string;
  topic: string;
  question: string;
  answer: string;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
}

export const DAILY_IQ_COUNT = 5;

/** Quick picks in Training Center; any other topic can be typed. */
export const TRAINING_TOPICS = ['DeX', 'Bixby', 'GoodLock', 'Gemini AI', 'Galaxy AI', 'Camera'] as const;

/** Questions the team can see: approved and switched on. */
export const isLive = (q: Pick<TrainingQuestion, 'is_active' | 'is_approved'>) => q.is_active && q.is_approved;

/**
 * Today's questions: start at dayOfYear % pool size and take the next `count`,
 * wrapping round, so the five are unique, the same all day and rotate at local
 * midnight. The pool is ordered by creation, so a new question slots in at the end.
 */
export function dailyQuestions<T extends Pick<TrainingQuestion, 'id' | 'created_at' | 'is_active' | 'is_approved'>>(pool: readonly T[], date: Date, count = DAILY_IQ_COUNT): T[] {
  const live = pool.filter(isLive).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const n = live.length;
  if (n === 0) return [];
  const start = dayOfYear(date) % n;
  return Array.from({ length: Math.min(count, n) }, (_, i) => live[(start + i) % n]);
}
