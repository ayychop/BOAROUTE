import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Chip, Field, ToggleRow } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState, LoadingBlock } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { TEAM_SEATS, defaultPatchFor, distinctOwners, managerShort, patchOwners } from '@/lib/frequency';
import { supabase } from '@/lib/supabaseClient';
import type { Profile, StoreOwner, TeamSeat } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

/** A row of public.team_members: the email allowlist. */
interface TeamMember {
  email: string;
  role: 'admin' | 'user';
  /** A TeamSeat for anyone approved here; older rows may hold another owner's name. */
  manager_name: string;
  route_managers: StoreOwner[] | null;
}

type Account = Pick<Profile, 'id' | 'email' | 'name' | 'role' | 'show_training'> & { created_at?: string };

interface TeamData {
  members: TeamMember[];
  accounts: Account[];
  /** Every distinct stores.assigned_manager, with how many stores each has. */
  owners: { owner: StoreOwner; stores: number }[];
}

const EMAIL = /^\S+@\S+\.\S+$/;

async function fetchTeam(): Promise<TeamData> {
  const [members, accounts, stores] = await Promise.all([
    supabase.from('team_members').select('email,role,manager_name,route_managers').order('role').order('email'),
    supabase.from('profiles').select('id,email,name,role,show_training,created_at').order('created_at', { ascending: false }),
    // The admin reads every store (RLS), so this covers every owner in use.
    supabase.from('stores').select('assigned_manager').limit(10000),
  ]);
  if (members.error) throw members.error;
  if (accounts.error) throw accounts.error;
  if (stores.error) throw stores.error;
  return { members: (members.data ?? []) as TeamMember[], accounts: (accounts.data ?? []) as Account[], owners: distinctOwners(stores.data ?? []) };
}

// The admin's pick (route_managers) when set, otherwise the seat's default patch.
const patchOf = (m: TeamMember): StoreOwner[] => (m.role === 'admin' ? ['Joseph'] : m.route_managers?.length ? m.route_managers : defaultPatchFor(m.manager_name));

const sameOwners = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** "Jo, Pete and Marcia" */
function ownersSentence(patch: readonly StoreOwner[]): string {
  const named = patchOwners(patch);
  const names = (named.length ? named : patch).map(managerShort);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? 'no one');
}

const SEAT_LABEL: Record<TeamSeat, string> = { Sarah: "Sarah's team", David: "David's team", Pete: 'Pete' };

/** What a sign-up is approved as. Store owners (Marcia, Jermaine...) are never app accounts. */
function SeatPicker({ value, onChange }: { value: TeamSeat | null; onChange: (m: TeamSeat) => void }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TEAM_SEATS.map((m) => (
          <Chip key={m} label={SEAT_LABEL[m]} active={value === m} icon={value === m ? 'checkmark' : 'person-outline'} tone="gold" onPress={() => onChange(m)} />
        ))}
      </View>
      {value && (
        <Txt variant="caption" tone="dim" style={{ marginTop: 8 }}>
          Sees {ownersSentence(defaultPatchFor(value))}&apos;s stores.
        </Txt>
      )}
    </View>
  );
}

/** Whose stores someone works: one chip per owner that has stores today. */
function OwnerPicker({ owners, value, onChange }: { owners: TeamData['owners']; value: StoreOwner[]; onChange: (next: StoreOwner[]) => void }) {
  if (owners.length === 0) {
    return (
      <Txt variant="caption" tone="warning" style={{ marginBottom: 12 }}>
        No stores found. Add stores in Store Management first.
      </Txt>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {owners.map(({ owner, stores }) => {
        const on = value.includes(owner);
        return (
          <Chip
            key={owner}
            label={`${managerShort(owner)}'s stores · ${stores}`}
            active={on}
            icon={on ? 'checkmark' : 'storefront-outline'}
            tone={owner === 'Joseph' ? 'primary' : 'gold'}
            onPress={() => onChange(on ? value.filter((o) => o !== owner) : [...value, owner])}
          />
        );
      })}
    </View>
  );
}

export default function TeamManagement() {
  const { isAdmin, profile, refreshProfile } = useAuth();
  const [data, setData] = useState<TeamData | null>(null);
  const [picks, setPicks] = useState<Record<string, TeamSeat>>({});
  // Whose stores each pending request or team member works, keyed by profile id or email.
  const [ownerPicks, setOwnerPicks] = useState<Record<string, StoreOwner[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newManager, setNewManager] = useState<TeamSeat | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchTeam());
    } catch (e) {
      Alert.alert('Could not load the team', e instanceof Error ? e.message : 'Please try again.');
      setData((prev) => prev ?? { members: [], accounts: [], owners: [] });
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetchTeam()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => {
        if (!alive) return;
        Alert.alert('Could not load the team', e instanceof Error ? e.message : 'Please try again.');
        setData({ members: [], accounts: [], owners: [] });
      });
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Screen back title="Team Management">
        <EmptyState icon="lock-closed-outline" title="Admins only" body="Only the admin can approve sign-ups and manage the team." />
      </Screen>
    );
  }

  const run = async (key: string, task: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(key);
    try {
      const { error } = await task();
      if (error) Alert.alert('Could not update', error.message);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const approve = (account: Account) => {
    const manager = picks[account.id];
    if (!manager) return Alert.alert('Choose their team', `Pick which team ${account.name ?? 'they'} will join, then approve.`);
    const owners = ownerPicks[account.id] ?? defaultPatchFor(manager);
    if (owners.length === 0) return Alert.alert('Choose their stores', `Pick whose stores ${account.name ?? 'they'} will work, then approve.`);
    run(`approve:${account.id}`, async () => {
      const approved = await supabase.rpc('review_access_request', { p_profile_id: account.id, p_approve: true, p_manager: manager });
      if (approved.error) return approved;
      // Only store a custom pick; the seat's default needs no override.
      if (sameOwners(owners, defaultPatchFor(manager))) return { error: null };
      return supabase.from('team_members').update({ route_managers: owners }).eq('email', account.email.trim().toLowerCase());
    });
  };

  const saveOwners = (member: TeamMember, owners: StoreOwner[]) => {
    if (owners.length === 0) return Alert.alert('Choose their stores', 'Pick at least one set of stores.');
    const override = sameOwners(owners, defaultPatchFor(member.manager_name)) ? null : owners;
    run(`owners:${member.email}`, async () => {
      const res = await supabase.from('team_members').update({ route_managers: override }).eq('email', member.email);
      if (!res.error) setOwnerPicks((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== member.email)));
      return res;
    });
  };

  const deny = (account: Account) =>
    Alert.alert('Deny access?', `${account.email} will stay on the sign-in screen and see nothing.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: () => run(`deny:${account.id}`, () => supabase.rpc('review_access_request', { p_profile_id: account.id, p_approve: false })) },
    ]);

  const remove = (member: TeamMember) =>
    Alert.alert('Remove from the team?', `${member.email} loses access straight away. You can add them again later.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(`remove:${member.email}`, () => supabase.from('team_members').delete().eq('email', member.email)) },
    ]);

  const add = async () => {
    const email = newEmail.trim().toLowerCase();
    setAddError(null);
    if (!EMAIL.test(email)) return setAddError('Enter a valid email address.');
    if (!newManager) return setAddError('Choose which team they join.');
    if (data?.members.some((m) => m.email === email)) return setAddError('That email is already on the team.');
    setBusy('add');
    const { error } = await supabase.from('team_members').insert({ email, role: 'user', manager_name: newManager });
    setBusy(null);
    if (error) return setAddError(error.message);
    setNewEmail('');
    setNewManager(null);
    load();
  };

  if (!data) {
    return (
      <Screen back kicker="Admin portal" title="Team Management">
        <LoadingBlock label="Loading team" />
      </Screen>
    );
  }

  const pending = data.accounts.filter((a) => a.role === 'unassigned');
  const denied = data.accounts.filter((a) => a.role === 'denied');
  const accountFor = (email: string) => data.accounts.find((a) => a.email.toLowerCase() === email) ?? null;
  const nameFor = (email: string) => accountFor(email)?.name ?? null;

  // Daily Samsung IQ on their Home screen. Needs their account, so not before they sign up.
  const trainingToggle = (email: string) => {
    const account = accountFor(email);
    if (!account) {
      return (
        <Txt variant="caption" tone="faint" style={{ marginBottom: 10 }}>
          Daily Samsung IQ can be switched on once they sign up.
        </Txt>
      );
    }
    return (
      <View style={{ marginBottom: 10, opacity: busy === `training:${account.id}` ? 0.5 : 1 }}>
        <ToggleRow
          label="Daily Samsung IQ"
          hint="Five training questions a day on their Home screen"
          value={!!account.show_training}
          onChange={(on) => {
            if (busy) return;
            run(`training:${account.id}`, async () => {
              const res = await supabase.from('profiles').update({ show_training: on }).eq('id', account.id);
              // Their own switch changes their Home straight away.
              if (!res.error && account.id === profile?.id) await refreshProfile();
              return res;
            });
          }}
        />
      </View>
    );
  };

  const requestCard = (a: Account, i: number, wasDenied: boolean) => (
    <GlassCard key={a.id} index={i} glow={wasDenied ? false : 'gold'}>
      <Txt variant="strong">{a.name ?? a.email}</Txt>
      <Txt variant="caption" tone="faint" style={{ marginBottom: 12 }}>
        {a.email}
        {a.created_at ? ` · signed up ${new Date(a.created_at).toLocaleDateString('en-GB')}` : ''}
      </Txt>
      <Txt variant="label" tone="dim" style={{ marginBottom: 8 }}>
        Which team do they join?
      </Txt>
      <SeatPicker
        value={picks[a.id] ?? null}
        onChange={(m) => {
          setPicks((p) => ({ ...p, [a.id]: m }));
          // Start the store pick from the seat's default; the admin can change it below.
          setOwnerPicks((p) => ({ ...p, [a.id]: defaultPatchFor(m) }));
        }}
      />
      {picks[a.id] && (
        <>
          <Txt variant="label" tone="dim" style={{ marginBottom: 8 }}>
            Whose stores do they work?
          </Txt>
          <OwnerPicker owners={data.owners} value={ownerPicks[a.id] ?? defaultPatchFor(picks[a.id])} onChange={(next) => setOwnerPicks((p) => ({ ...p, [a.id]: next }))} />
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <NeonButton label="Approve" icon="checkmark-circle" variant="gold" onPress={() => approve(a)} loading={busy === `approve:${a.id}`} disabled={!!busy} style={{ flex: 1 }} />
        {!wasDenied && <NeonButton label="Deny" icon="close-circle-outline" variant="ghost" onPress={() => deny(a)} loading={busy === `deny:${a.id}`} disabled={!!busy} style={{ flex: 1 }} />}
      </View>
    </GlassCard>
  );

  return (
    <Screen back kicker="Admin portal" title="Team Management" onRefresh={load}>
      <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
        Only emails on this list can use BOAROUTE. New sign-ups wait here for you to approve them.
      </Txt>

      <Txt variant="title" style={{ marginBottom: 10 }}>
        Pending requests{pending.length ? ` · ${pending.length}` : ''}
      </Txt>
      {pending.length === 0 ? (
        <GlassCard animateIn={false}>
          <Txt variant="body" tone="dim" align="center">
            No one is waiting. New sign-ups appear here.
          </Txt>
        </GlassCard>
      ) : (
        <View style={{ gap: 10 }}>{pending.map((a, i) => requestCard(a, i, false))}</View>
      )}

      <Txt variant="title" style={{ marginTop: 26, marginBottom: 10 }}>
        Team · {data.members.length}
      </Txt>
      <View style={{ gap: 10 }}>
        {data.members.map((m, i) => {
          const scope = patchOf(m);
          const name = nameFor(m.email);
          return (
            <GlassCard key={m.email} index={i}>
              <Txt variant="strong">{name ?? m.email}</Txt>
              <Txt variant="caption" tone="faint" style={{ marginBottom: 10 }}>
                {m.role === 'admin' ? 'Admin' : SEAT_LABEL[m.manager_name as TeamSeat] ?? 'Merchandiser'} · {name ? m.email : 'not signed up yet'}
              </Txt>
              {trainingToggle(m.email)}
              {m.role === 'admin' ? (
                <Txt variant="caption" tone="dim">
                  Your daily patch is Jo&apos;s stores. The full master list is in Store Management.
                </Txt>
              ) : (
                <>
                  <Txt variant="caption" tone="dim" style={{ marginBottom: 10 }}>
                    Sees {ownersSentence(scope)}&apos;s stores.
                  </Txt>
                  <OwnerPicker owners={data.owners} value={ownerPicks[m.email] ?? scope} onChange={(next) => setOwnerPicks((p) => ({ ...p, [m.email]: next }))} />
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    {ownerPicks[m.email] && !sameOwners(ownerPicks[m.email], scope) && (
                      <NeonButton label="Save stores" icon="checkmark" variant="gold" size="sm" onPress={() => saveOwners(m, ownerPicks[m.email])} loading={busy === `owners:${m.email}`} disabled={!!busy} />
                    )}
                    <NeonButton label="Remove from team" icon="person-remove-outline" variant="subtle" size="sm" onPress={() => remove(m)} loading={busy === `remove:${m.email}`} disabled={!!busy} />
                  </View>
                </>
              )}
            </GlassCard>
          );
        })}
      </View>

      <Txt variant="title" style={{ marginTop: 26, marginBottom: 10 }}>
        Add by email
      </Txt>
      <GlassCard animateIn={false}>
        <Txt variant="caption" tone="dim" style={{ marginBottom: 12 }}>
          Pre-approve someone so they get straight in when they sign up.
        </Txt>
        <Field label="Email" icon="mail-outline" value={newEmail} onChangeText={setNewEmail} placeholder="name@company.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" autoCorrect={false} />
        <SeatPicker value={newManager} onChange={setNewManager} />
        {addError ? (
          <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
            {addError}
          </Txt>
        ) : null}
        <NeonButton label="Add to team" icon="person-add-outline" variant="gold" onPress={add} loading={busy === 'add'} disabled={!!busy && busy !== 'add'} full />
      </GlassCard>

      {denied.length > 0 && (
        <>
          <Txt variant="title" style={{ marginTop: 26, marginBottom: 10 }}>
            Denied · {denied.length}
          </Txt>
          <View style={{ gap: 10 }}>{denied.map((a, i) => requestCard(a, i, true))}</View>
        </>
      )}
    </Screen>
  );
}
