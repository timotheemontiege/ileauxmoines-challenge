import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        <p>
          Île-aux-Moines Challenge — records du tour à la voile · Golfe du
          Morbihan
        </p>
        <p className="mt-1">
          Détection automatique par « winding number » · Cartes ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            className="hover:text-slate-300"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>
        </p>
      </footer>
    </div>
  );
}
