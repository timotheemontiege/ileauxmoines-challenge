import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import CourseSelector from './CourseSelector';
import { useCourse } from '../hooks/useCourse';

export default function Layout() {
  const { course } = useCourse();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* Sélecteur de parcours persistant, visible sur toutes les pages */}
      <div className="sticky top-[57px] z-[900] border-b border-slate-800 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <CourseSelector />
          <p className="hidden text-xs text-slate-400 sm:block">{course.description}</p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        <p>
          Tour Île Challenge — records des tours à la voile · Golfe du Morbihan
        </p>
        <p className="mt-1">
          Détection automatique (winding number / waypoints) · Cartes ©{' '}
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
