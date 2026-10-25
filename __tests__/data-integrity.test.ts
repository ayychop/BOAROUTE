import fs from 'fs';
import path from 'path';
import seed from '../src/data/seed-stores.json';


const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261025000000_boaroute_init.sql'), 'utf8');

describe('seed data', () => {
  it('has 78 Jo stores and 65 David stores with valid grades and coordinates', () => {
    expect(seed.filter((s) => s.manager === 'Joseph')).toHaveLength(78);
    expect(seed.filter((s) => s.manager === 'David')).toHaveLength(65);
    for (const s of seed) {
      expect(['A', 'B', 'C', 'D']).toContain(s.grade);
      expect(s.latitude).toBeGreaterThan(50.9);
      expect(s.latitude).toBeLessThan(52.1);
      expect(s.longitude).toBeGreaterThan(-1.8);
      expect(s.longitude).toBeLessThan(0.6);
    }
    expect(new Set(seed.map((s) => s.name)).size).toBe(143);
  });

  it('seeds every store into the single migration with its manager and vibe', () => {
    for (const s of seed) expect(migration).toContain(`'${s.name.replace(/'/g, "''")}'`);
    expect(migration.match(/'Joseph', 'fun and lively'/g)).toHaveLength(78);
    expect(migration.match(/'David', 'reserved'/g)).toHaveLength(65);
    expect(migration).toContain("'HP13 6BU'");
    expect(fs.readdirSync(path.join(root, 'supabase/migrations'))).toEqual(['20261025000000_boaroute_init.sql']);
  });

  it('enables RLS on every table', () => {
    const all = migration;
    const tables = [...all.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(['app_admins', 'events', 'expenses', 'hazard_reports', 'mileage_logs', 'profiles', 'stores', 'tasks', 'user_stores', 'visits']);
    for (const t of tables) expect(all).toContain(`alter table public.${t} enable row level security`);
  });
});

describe('copy style', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return walk(p);
      return /\.(tsx?|jsx?|json|sql)$/.test(d.name) ? [p] : [];
    });

  it('contains no em dashes or en dashes anywhere in the app or backend', () => {
    const offenders = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'supabase'))].filter((f) =>
      /[\u2013\u2014]/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
