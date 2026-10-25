import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import type { Profile } from '@/lib/types';

interface AuthValue {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Signed in, but the profile could not be loaded (offline or server error). */
  profileError: boolean;
  isAdmin: boolean;
  onboarded: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Returns true when the user must confirm their email before signing in. */
  signUp: (email: string, password: string, name: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Omit<Profile, 'id' | 'email' | 'role' | 'route_managers'>>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const PROFILE_COLUMNS = 'id,email,role,name,vehicle_model,starting_location,freq_a,freq_b,freq_c,freq_d,route_managers';

async function loadProfile(session: Session): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;
  // The signup trigger normally creates the row; create it if it is missing.
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: session.user.id, email: session.user.email ?? '', name: (session.user.user_metadata?.name as string | undefined) ?? null })
    .select(PROFILE_COLUMNS)
    .single();
  if (insertError) throw insertError;
  return created as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) {
      setProfile(null);
      setProfileError(false);
      return;
    }
    try {
      setProfile(await loadProfile(next));
      setProfileError(false);
    } catch (e) {
      console.warn('Profile load failed', e);
      setProfile(null);
      setProfileError(true);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .finally(() => mounted && setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'TOKEN_REFRESHED') {
        setSession(next);
        return;
      }
      applySession(next);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
    if (error) throw error;
    return !data.session;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const updateProfile = useCallback<AuthValue['updateProfile']>(
    async (patch) => {
      if (!session) throw new Error('Not signed in');
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', session.user.id).select(PROFILE_COLUMNS).single();
      if (error) throw error;
      setProfile(data as Profile);
    },
    [session],
  );

  const refreshProfile = useCallback(async () => {
    if (session) await applySession(session);
  }, [session, applySession]);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      profile,
      profileError,
      isAdmin: profile?.role === 'admin',
      onboarded: !!profile?.vehicle_model && !!profile?.starting_location,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshProfile,
    }),
    [ready, session, profile, profileError, signIn, signUp, signOut, updateProfile, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
