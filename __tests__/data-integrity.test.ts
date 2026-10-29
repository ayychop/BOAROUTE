import fs from 'fs';
import path from 'path';
import seed from '../src/data/seed-stores.json';
import { MANAGERS, STORE_OWNERS, TEAM_PATCHES, TEAM_SEATS } from '../src/lib/frequency';


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
    expect(fs.readdirSync(path.join(root, 'supabase/migrations')).sort()).toEqual([
      '20261025000000_boaroute_init.sql',
      '20261027120000_team_features.sql',
      '20261029120000_speed_cameras.sql',
    ]);
  });

  it('enables RLS on the team-feature tables', () => {
    const team = fs.readFileSync(path.join(root, 'supabase/migrations/20261027120000_team_features.sql'), 'utf8');
    for (const t of ['voice_memos', 'team_orders', 'team_order_items']) {
      expect(team).toContain(`create table if not exists public.${t}`);
      expect(team).toContain(`alter table public.${t} enable row level security`);
    }
    expect(team).toContain("insert into storage.buckets");
    // The scrapped fleet-map table must not come back.
    expect(team).not.toContain('live_locations');
  });

  it('enables RLS on every table', () => {
    const all = migration;
    const tables = [...all.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(['events', 'expenses', 'hazard_reports', 'mileage_logs', 'profiles', 'store_assignees', 'stores', 'tasks', 'team_members', 'training_questions', 'user_stores', 'visits']);
    for (const t of tables) expect(all).toContain(`alter table public.${t} enable row level security`);
  });

  it('decides access by email from team_members, with Jo as the only admin', () => {
    expect(migration).toContain("values ('ayychop@gmail.com', 'admin', 'Joseph')");
    expect(migration).toContain('team_members_one_admin');
    // Stores are filtered by patch in the database, not only in the app.
    expect(migration).toContain('using (public.is_admin() or assigned_manager = any (public.my_route_managers()) or id = any (public.my_assigned_store_ids()))');
    expect(migration).not.toMatch(/stores: read for signed-in users[\s\S]{0,120}using \(true\)/);
    expect(migration).not.toMatch(/ilike 'david%'/);
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

describe('team model in the SQL file', () => {
  const sqlList = (items: readonly string[]) => items.map((m) => `'${m}'`).join(', ');

  it('gives each seat the same patch as the app', () => {
    for (const seat of ['Sarah', 'David'] as const) {
      expect(migration).toContain(`when p_manager = '${seat}' then array[${sqlList(TEAM_PATCHES[seat])}]`);
    }
  });

  it('accepts every store owner and only approves the three seats', () => {
    expect(migration).toContain(`check (assigned_manager in (${sqlList(STORE_OWNERS)}))`);
    expect(migration).toContain(`p_manager not in (${sqlList(TEAM_SEATS)})`);
    expect(STORE_OWNERS.slice(0, MANAGERS.length)).toEqual(MANAGERS);
  });
});
