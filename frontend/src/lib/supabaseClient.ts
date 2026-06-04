import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Le classement public (servi par l'API backend) fonctionne sans cela,
  // mais l'authentification nécessite ces variables.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants : l'authentification est désactivée. Voir frontend/.env",
  );
}

export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'placeholder-anon-key',
);
