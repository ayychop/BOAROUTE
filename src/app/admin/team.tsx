import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Chip } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState, LoadingBlock } from '@/components/misc';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { MANAGERS, managersFor, managerShort } from '@/lib/frequency';
import { supabase } from '@/lib/supabaseClient';
import type { Manager, Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

type TeamMember = Pick<Profile, 'id' | 'email' | 'name' | 'role' | 'route_managers'>;

export default function TeamRoutes() {
  const { isAdmin, session, refreshProfile } = useAuth();
  const [team, setTeam] = useState<TeamMember[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('id,email,name,role,route_managers').order('name');
    if (error) {
      Alert.alert('Could not load the team', error.message);
      setTeam([]);
      return;
    }
    setTeam((data ?? []) as TeamMember[]);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('id,email,name,role,route_managers')
      .order('name')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) Alert.alert('Could not load the team', error.message);
        setTeam(error ? [] : ((data ?? []) as TeamMember[]));
      });
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Screen back title="Team routes">
        <EmptyState icon="lock-closed-outline" title="Admins only" body="Route assignments are managed by the admin." />
      </Screen>
    );
  }

  const toggle = async (member: TeamMember, manager: Manager) => {
    const current = managersFor(member);
    const next = current.includes(manager) ? current.filter((m) => m !== manager) : [...current, manager];
    if (next.length === 0) return Alert.alert('Keep at least one', 'Everyone needs at least one set of stores to route.');
    const ordered = MANAGERS.filter((m) => next.includes(m));
    setTeam((prev) => (prev ?? []).map((t) => (t.id === member.id ? { ...t, route_managers: ordered } : t)));
    const { error } = await supabase.from('profiles').update({ route_managers: ordered }).eq('id', member.id);
    if (error) {
      Alert.alert('Could not update', error.message);
      load();
      return;
    }
    if (member.id === session?.user.id) refreshProfile().catch(() => {});
  };

  return (
    <Screen back kicker="Admin portal" title="Team routes">
      <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
        Choose whose stores each person routes. Changes apply the next time they open the Route tab.
      </Txt>
      {team === null ? (
        <LoadingBlock label="Loading team" />
      ) : team.length === 0 ? (
        <EmptyState icon="people-outline" title="No team members yet" body="People appear here once they create an account." />
      ) : (
        <View style={{ gap: 10 }}>
          {team.map((m, i) => {
            const scope = managersFor(m);
            return (
              <GlassCard key={m.id} index={i}>
                <Txt variant="strong">{m.name ?? m.email}</Txt>
                <Txt variant="caption" tone="faint" style={{ marginBottom: 10 }}>
                  {m.role === 'admin' ? 'Admin' : 'Operational Manager'} · {m.email}
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {MANAGERS.map((mgr) => (
                    <Chip key={mgr} label={`${managerShort(mgr)}'s stores`} active={scope.includes(mgr)} icon={scope.includes(mgr) ? 'checkmark' : 'add'} onPress={() => toggle(m, mgr)} />
                  ))}
                </View>
              </GlassCard>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
