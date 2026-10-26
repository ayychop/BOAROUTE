import fs from 'fs';
import path from 'path';
import { TRAINING_OUTPUT_SCHEMA, TRAINING_SYSTEM_PROMPT, buildTrainingPrompt, parseTrainingOutput, validateSpecs } from '../supabase/functions/_shared/training-prompt';
import { dayOfYear } from '../src/lib/motivation';
import { dailyQuestions, type TrainingQuestion } from '../src/lib/training';
import { parsePastVisitCount } from '../src/lib/visit-timer';

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261025000000_boaroute_init.sql'), 'utf8');

const q = (i: number, extra: Partial<TrainingQuestion> = {}): TrainingQuestion => ({
  id: `q${String(i).padStart(2, '0')}`,
  topic: 'DeX',
  question: `Question ${i}?`,
  answer: `Answer ${i}`,
  is_active: true,
  is_approved: true,
  created_at: `2026-10-${String(i + 1).padStart(2, '0')}T09:00:00Z`,
  ...extra,
});

describe('Daily Samsung IQ picks', () => {
  const pool = Array.from({ length: 12 }, (_, i) => q(i));
  const day = new Date(2026, 9, 26, 9, 0);

  it('picks five unique questions starting at dayOfYear % pool size', () => {
    const picks = dailyQuestions(pool, day);
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map((p) => p.id)).size).toBe(5);
    expect(picks[0]).toBe(pool[dayOfYear(day) % pool.length]);
  });

  it('stays the same all day and rotates at midnight', () => {
    const morning = dailyQuestions(pool, new Date(2026, 9, 26, 0, 1)).map((p) => p.id);
    const night = dailyQuestions(pool, new Date(2026, 9, 26, 23, 59)).map((p) => p.id);
    const tomorrow = dailyQuestions(pool, new Date(2026, 9, 27, 0, 1)).map((p) => p.id);
    expect(night).toEqual(morning);
    expect(tomorrow).not.toEqual(morning);
  });

  it('ignores the order the pool arrives in', () => {
    expect(dailyQuestions([...pool].reverse(), day).map((p) => p.id)).toEqual(dailyQuestions(pool, day).map((p) => p.id));
  });

  it('only uses approved, active questions', () => {
    const mixed = [...pool.slice(0, 6), q(20, { is_approved: false }), q(21, { is_active: false })];
    const picks = dailyQuestions(mixed, day);
    expect(picks.every((p) => p.is_approved && p.is_active)).toBe(true);
  });

  it('wraps without repeats and shows fewer when the pool is small', () => {
    expect(dailyQuestions(pool.slice(0, 3), day)).toHaveLength(3);
    expect(new Set(dailyQuestions(pool.slice(0, 6), new Date(2026, 11, 31)).map((p) => p.id)).size).toBe(5);
    expect(dailyQuestions([], day)).toEqual([]);
  });
});

describe('training question generator', () => {
  it('asks for three grounded questions without dashes', () => {
    expect(TRAINING_SYSTEM_PROMPT).toMatch(/Never invent/);
    expect(TRAINING_SYSTEM_PROMPT).not.toMatch(/[–—]/);
    expect(buildTrainingPrompt(' S26 Ultra, 200MP ')).toContain('<specs>\nS26 Ultra, 200MP\n</specs>');
    expect(TRAINING_OUTPUT_SCHEMA.required).toEqual(['questions']);
  });

  it('validates the specs', () => {
    expect(validateSpecs({ specs: '  Galaxy S26  ' })).toBe('Galaxy S26');
    expect(() => validateSpecs({ specs: ' ' })).toThrow(/specs/);
    expect(() => validateSpecs({ specs: 'x'.repeat(3001) })).toThrow(/too long/);
    expect(() => validateSpecs(null)).toThrow();
  });

  it('parses up to three clean, distinct drafts', () => {
    const raw = JSON.stringify({
      questions: [
        { topic: 'Camera', question: 'How many megapixels?', answer: '200MP — the most yet' },
        { topic: 'Camera', question: 'how many megapixels?', answer: 'Repeat' },
        { topic: '', question: 'Battery size?', answer: '5000mAh' },
        { topic: 'Chip', question: 'Which chip?', answer: '' },
        { topic: 'Chip', question: 'Which processor?', answer: 'Snapdragon' },
        { topic: 'Extra', question: 'A fourth?', answer: 'Dropped' },
      ],
    });
    const drafts = parseTrainingOutput(raw);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].answer).toBe('200MP, the most yet');
    expect(drafts[1].topic).toBe('Galaxy');
    expect(drafts.map((d) => d.question)).toEqual(['How many megapixels?', 'Battery size?', 'Which processor?']);
    expect(() => parseTrainingOutput('not json')).toThrow(/JSON/);
  });

  it('seeds ten approved starter questions across DeX, Bixby, GoodLock and Gemini AI', () => {
    const seed = migration.slice(migration.indexOf('insert into public.training_questions'));
    const rows = seed.slice(0, seed.indexOf('on conflict')).match(/^\s+\('/gm) ?? [];
    expect(rows).toHaveLength(10);
    for (const topic of ['DeX', 'Bixby', 'GoodLock', 'Gemini AI']) expect(seed).toContain(`('${topic}'`);
    expect(migration).toMatch(/is_approved boolean not null default true/);
    expect(migration).toMatch(/add column show_training boolean not null default false/);
    expect(migration).toMatch(/Only an admin can change who sees training/);
  });
});

describe('log past visits', () => {
  it('accepts a whole number from 1 within the monthly cap', () => {
    expect(parsePastVisitCount('3', 0)).toBe(3);
    expect(parsePastVisitCount(' 2 ', 4)).toBe(2);
    expect(parsePastVisitCount('', 0)).toMatch(/from 1/);
    expect(parsePastVisitCount('0', 0)).toMatch(/from 1/);
    expect(parsePastVisitCount('30', 2)).toMatch(/more than 31/);
  });

  it('only lets the database function skip the visit timer', () => {
    expect(migration).toMatch(/if new\.is_manual then\s+if coalesce\(current_setting\('boaroute\.manual_visits', true\), ''\) <> 'on' then/);
    expect(migration).toMatch(/perform set_config\('boaroute\.manual_visits', 'on', true\);/);
    expect(migration).toMatch(/grant execute on function public\.log_past_visits\(uuid, integer\) to authenticated;/);
  });
});
