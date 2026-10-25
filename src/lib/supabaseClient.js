import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

// Values come from .env.local in development and EAS environment variables
// in cloud builds. EXPO_PUBLIC_* names are inlined at build time.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** False until real credentials are provided; the app shows a setup screen instead of crashing. */
export const isSupabaseConfigured = /^https:\/\/\S+$/.test(supabaseUrl) && supabaseAnonKey.length > 20;

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://not-configured.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'not-configured-anon-key',
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (!isSupabaseConfigured) return;
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
