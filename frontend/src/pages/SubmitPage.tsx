import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { uploadSession } from '../lib/api';
import type { UploadResponse } from '../types';
import { CATEGORIES, categoryColor } from '../lib/categories';
import TourMap, { type MapTrace } from '../components/TourMap';
import Spinner from '../components/Spinner';

const BEAUFORT = Array.from({ length: 13 }, (_, i) => i); // 0..12

export default function SubmitPage() {
  const { session } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('wingfoil');
  const [wind, setWind] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError('Sélectionne un fichier GPX.');
      return;
    }
    if (!session) {
      setError('Session expirée. Reconnecte-toi.');
      return;
    }

    setLoading(true);
    try {
      const res = await uploadSession({
        file,
        category,
        windForce: wind === '' ? null : parseInt(wind, 10),
        comment: comment.trim() || undefined,
        token: session.access_token,
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setFile(null);
    setComment('');
    setWind('');
  }

  const previewTraces: MapTrace[] = result?.best
    ? [
        {
          id: 'preview',
          positions: result.best.points.map(
            (p) => [p.lat, p.lon] as [number, number],
          ),
          color: categoryColor(category),
          label: `Tour détecté · ${result.best.durationLabel}`,
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-black">Soumettre une trace</h1>
        <p className="mt-1 text-slate-400">
          Fichier .gpx d'une session autour de l'Île-aux-Moines. L'analyse du
          tour se fait automatiquement côté serveur.
        </p>
      </header>

      {!result && (
        <form onSubmit={handleSubmit} className="card space-y-5 p-6">
          <div>
            <label className="label" htmlFor="gpx">
              Fichier GPX
            </label>
            <input
              id="gpx"
              type="file"
              accept=".gpx,application/gpx+xml,application/xml,text/xml"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-ocean-600 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-ocean-500"
            />
            {file && (
              <p className="mt-2 text-xs text-slate-500">
                {file.name} · {(file.size / 1024).toFixed(0)} Ko
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">
                Catégorie de matériel
              </label>
              <select
                id="category"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="wind">
                Force du vent (optionnel)
              </label>
              <select
                id="wind"
                className="input"
                value={wind}
                onChange={(e) => setWind(e.target.value)}
              >
                <option value="">— Non renseigné</option>
                {BEAUFORT.map((b) => (
                  <option key={b} value={b}>
                    {b} Beaufort
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="comment">
              Commentaire (optionnel)
            </label>
            <textarea
              id="comment"
              className="input min-h-[80px]"
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conditions, matériel précis, ressenti…"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? (
              <Spinner label="Analyse en cours…" />
            ) : (
              'Analyser et soumettre'
            )}
          </button>
        </form>
      )}

      {result && (
        <div className="space-y-6">
          {/* Bandeau résultat */}
          <div
            className={`card p-6 ${
              result.best
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-amber-500/40 bg-amber-500/10'
            }`}
          >
            <p
              className={`text-lg font-semibold ${
                result.best ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {result.message}
            </p>

            {result.best && (
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Meilleur temps" value={result.best.durationLabel} />
                <Stat
                  label="Distance"
                  value={`${result.best.distanceKm.toFixed(2)} km`}
                />
                <Stat
                  label="Vitesse moy."
                  value={`${result.best.avgSpeedKnots.toFixed(1)} nds`}
                />
                <Stat
                  label="Tours détectés"
                  value={String(result.analysis.toursDetected)}
                />
              </div>
            )}

            {!result.best && (
              <p className="mt-3 text-sm text-amber-200/80">
                {result.analysis.pointsInZone} point(s) dans le Golfe sur{' '}
                {result.analysis.totalPoints}. Vérifie que la trace fait bien le
                tour complet de l'île.
              </p>
            )}
          </div>

          {/* Avertissements */}
          {result.warnings.length > 0 && (
            <div className="card border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
              {result.warnings.map((w, i) => (
                <p key={i}>⚠️ {w}</p>
              ))}
            </div>
          )}

          {/* Carte de prévisualisation */}
          {previewTraces.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold">Aperçu du tour extrait</h2>
              <TourMap traces={previewTraces} height={420} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={reset} className="btn-ghost">
              Soumettre une autre trace
            </button>
            <Link to="/leaderboard" className="btn-primary">
              Voir le classement
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 p-3 text-center">
      <div className="font-mono text-xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}
