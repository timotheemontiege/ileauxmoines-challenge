import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white'
  }`;
}

export default function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const username = (user?.user_metadata?.username as string | undefined) ?? null;

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <header className="sticky top-0 z-[1000] border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-black tracking-tight">
          <img src="/sail.svg" alt="" className="h-8 w-8" />
          <span className="hidden sm:inline">
            Île-aux-Moines <span className="text-ocean-400">Challenge</span>
          </span>
          <span className="sm:hidden text-ocean-400">IAM</span>
        </Link>

        <div className="flex items-center gap-1">
          <NavLink to="/" end className={navClass}>
            Accueil
          </NavLink>
          <NavLink to="/leaderboard" className={navClass}>
            Classement
          </NavLink>
          <NavLink to="/submit" className={navClass}>
            Soumettre
          </NavLink>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {username && (
                <Link
                  to={`/profile/${username}`}
                  className="hidden rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white sm:inline"
                >
                  {username}
                </Link>
              )}
              <button onClick={handleSignOut} className="btn-ghost text-sm">
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-sm">
                Connexion
              </Link>
              <Link to="/register" className="btn-primary text-sm">
                Inscription
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
