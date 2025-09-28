import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const hasSupabaseConfig =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.trim() !== '' &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.trim() !== '';

if (!hasSupabaseConfig) {
  console.error(
    'Supabase client not initialized: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local.'
  );
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = hasSupabaseConfig;
