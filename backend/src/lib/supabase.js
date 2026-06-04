// Clients Supabase côté backend.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';

/** Vrai si toutes les variables Supabase nécessaires sont présentes. */
export const isSupabaseConfigured = Boolean(url && serviceKey && anonKey);

export const GPX_BUCKET = process.env.SUPABASE_GPX_BUCKET || 'gpx';

// URL de repli (valide syntaxiquement) pour éviter un crash à l'import quand
// l'environnement n'est pas configuré (ex. premier lancement). Les routes
// vérifient `isSupabaseConfigured` et renvoient 503 le cas échéant.
const safeUrl = url || 'http://localhost:54321';

/**
 * Client ADMIN (service_role) : contourne la RLS.
 * Réservé au backend pour écrire en base et gérer le Storage.
 * NE JAMAIS exposer cette clé au frontend.
 */
export const supabaseAdmin = createClient(safeUrl, serviceKey || 'placeholder-service-key', {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Client ANON : sert uniquement à valider le JWT d'un utilisateur
 * (supabaseAnon.auth.getUser(token)).
 */
export const supabaseAnon = createClient(safeUrl, anonKey || 'placeholder-anon-key', {
  auth: { autoRefreshToken: false, persistSession: false },
});
