import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export default function RegisterPage() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (user) navigate('/submit', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim();
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(cleanUsername)) {
      setError(
        'Pseudo invalide : 3 à 24 caractères (lettres, chiffres, tiret, underscore).',
      );
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, cleanUsername);
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="text-5xl">⛵</div>
        <h1 className="mt-4 text-2xl font-bold">Compte créé !</h1>
        <p className="mt-2 text-slate-400">
          Si la confirmation par e-mail est activée sur le projet, validez votre
          adresse avant de vous connecter.
        </p>
        <Link to="/login" className="btn-primary mt-6">
          Aller à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="mb-1 text-2xl font-bold">Créer un compte</h1>
      <p className="mb-6 text-sm text-slate-400">
        Choisis un pseudo : c'est lui qui apparaîtra au classement.
      </p>

      {!isSupabaseConfigured && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          Authentification non configurée (variables Supabase manquantes).
        </p>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="username">
            Pseudo
          </label>
          <input
            id="username"
            type="text"
            className="input"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ex. ozzy-foil"
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Création…' : "S'inscrire"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-400">
        Déjà un compte ?{' '}
        <Link to="/login" className="text-ocean-300 hover:text-ocean-200">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
