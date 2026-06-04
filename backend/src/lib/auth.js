// Middleware d'authentification : vérifie le JWT Supabase envoyé par le front.
import { supabaseAnon } from './supabase.js';

/**
 * Exige un header `Authorization: Bearer <access_token>`.
 * En cas de succès, place l'utilisateur Supabase dans `req.user`.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentification échouée' });
  }
}
