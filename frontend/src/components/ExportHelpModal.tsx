import { useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Guides d'export GPX par source (liens officiels / guides). */
const SOURCES: { name: string; url: string }[] = [
  {
    name: 'Strava',
    url: 'https://support.strava.com/hc/fr/articles/216918437-Exportation-de-vos-donn%C3%A9es-et-exportation-en-masse-de-donn%C3%A9es',
  },
  {
    name: 'Garmin Connect',
    url: 'https://support.garmin.com/fr-FR/?faq=W1TvTPW8JZ6LfJSfK512Q8',
  },
  {
    name: 'Coros',
    url: 'https://gpxchunk.com/fr/guide/export/coros/',
  },
];

/** Fenêtre d'aide : comment récupérer un fichier .gpx puis le soumettre. */
export default function ExportHelpModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-help-title"
    >
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="export-help-title" className="text-xl font-bold">
            📥 Exporter ta trace en GPX
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-2xl leading-none text-slate-400 transition hover:text-white"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300">
          Récupère le fichier <strong>.gpx</strong> de ta session depuis ton appareil ou ton
          application, selon ta source :
        </p>

        <ul className="mt-4 space-y-2">
          {SOURCES.map((s) => (
            <li key={s.name}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-medium text-ocean-300 transition hover:border-ocean-500 hover:text-ocean-200"
              >
                <span>Depuis {s.name}</span>
                <span aria-hidden>↗</span>
              </a>
            </li>
          ))}
          <li className="px-1 pt-1 text-xs text-slate-400">
            Autre appareil (Suunto, Amazfit / Zepp, Polar…) : cherche « exporter en GPX » dans
            l'application, ou un guide sur{' '}
            <a
              href="https://gpxchunk.com/fr/guide/export/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ocean-300 underline hover:text-ocean-200"
            >
              gpxchunk.com
            </a>
            .
          </li>
        </ul>

        <div className="mt-5 rounded-xl border border-ocean-500/30 bg-ocean-500/10 p-4 text-sm text-slate-200">
          Une fois le fichier <strong>.gpx</strong> sur ton appareil, importe-le ici avec le
          bouton{' '}
          <Link
            to="/submit"
            onClick={onClose}
            className="font-semibold text-ocean-300 hover:text-ocean-200"
          >
            « Soumettre une trace »
          </Link>
          .
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            Fermer
          </button>
          <Link to="/submit" onClick={onClose} className="btn-primary">
            Soumettre une trace
          </Link>
        </div>
      </div>
    </div>
  );
}
