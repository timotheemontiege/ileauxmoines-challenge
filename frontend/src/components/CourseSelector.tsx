import { useCourse } from '../hooks/useCourse';

/**
 * Sélecteur de parcours persistant (segmented control).
 * Affiché dans la navbar : visible sur toutes les pages.
 */
export default function CourseSelector({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { courseId, courses, setCourse } = useCourse();

  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
      {courses.map((c) => {
        const active = c.id === courseId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setCourse(c.id)}
            aria-pressed={active}
            title={c.description}
            className={`rounded-lg font-medium transition ${pad} ${
              active
                ? 'bg-ocean-600 text-white shadow'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {c.name.replace(/^Tour (de l'|du )/, '')}
          </button>
        );
      })}
    </div>
  );
}
