import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCourse } from '../hooks/useCourse';
import { getSectorLeaderboard, uploadSession } from '../lib/api';
import type { UploadResponse } from '../types';
import { CATEGORIES, categoryColor } from '../lib/categories';
import { segmentTourBySectors, sectorColor } from '../lib/sectors';
import TourMap, { type MapTrace, type MapWaypoint } from '../components/TourMap';
import CourseSelector from '../components/CourseSelector';
import Spinner from '../components/Spinner';
import { formatDuration } from '../lib/format';

const BEAUFORT = Array.from({ length: 13 }, (_, i) => i); // 0..12

export default function SubmitPage() {
  const { session } = useAuth();
  const { course, courseId } = useCourse();

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('wingfoil');
  const [wind, setWind] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  // record par secteur (pour la coloration relative) : sectorId -> secondes | null
  const [sectorRecords, setSectorRecords] = useState<Record<string, number | null>>({});

  const courseWaypoints = useMemo<MapWaypoint[]>(
    () =>
      course.waypoints.map((w) => ({
        id: w.id,
        name: w.name,
        lat: w.lat,
        lon: w.lon,
        radiusMeters: w.radiusMeters,
      })),
    [course],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSectorRecords({});

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
        courseId,
        category,
        windForce: wind === '' ? null : parseInt(wind, 10),
        comment: comment.trim() || undefined,
        token: session.access_token,
      });
      setResult(res);

      // Récupère les records de secteur pour colorer le rendu (best-effort).
      if (res.best) {
        const records = await Promise.all(
          course.sectors.map((s) =>
            getSectorLeaderboard({ course: courseId, sector: s.id, category: 'all', period: 'all' })
              .then((r) => [s.id, r.entries[0]?.duration_seconds ?? null] as const)
              .catch(() => [s.id, null] as const),
          ),
        );
        setSectorRecords(Object.fromEntries(records));
      }
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
    setSectorRecords({});
  }

  // Carte de résultat : un segment coloré par secteur (vert rapide → rouge lent).
  const sectorSegments = useMemo<MapTrace[]>(() => {
    if (!result?.best) return [];
    const durations = new Map(
      result.best.sectors.map((s) => [s.sectorId, s.durationSeconds] as [string, number]),
    );
    return segmentTourBySectors(result.best.points, course)
      .filter((seg) => seg.positions.length > 1)
      .map((seg, i) => {
        const dur = durations.get(seg.sectorId);
        const color =
          dur != null ? sectorColor(dur, sectorRecords[seg.sectorId] ?? null) : '#64748b';
        return {
          // id unique : une façade multi-arêtes (Golfe) peut donner plusieurs arcs.
          id: `${seg.sectorId}#${i}`,
          positions: seg.positions,
          color,
          label: dur != null ? `${seg.name} · ${formatDuration(dur)}` : seg.name,
        };
      });
  }, [result, course, sectorRecords]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-black">Soumettre une trace</h1>
        <p className="mt-1 text-slate-400">
          Fichier .gpx d'une session. L'analyse du tour se fait automatiquement
          côté serveur, selon le parcours choisi.
        </p>
      </header>

      {/* Sélection du parcours + aperçu */}
      <div className="card space-y-4 p-6">
        <div>
          <span className="label">Parcours</span>
          <div className="mt-1">
            <CourseSelector />
          </div>
          <p className="mt-2 text-sm text-slate-400">{course.description}</p>
        </div>
        <TourMap
          traces={[]}
          height={240}
          center={[course.centroid.lat, course.centroid.lon]}
          centerLabel={course.name}
          waypoints={courseWaypoints}
          showWaypointRadius={course.validationType !== 'winding'}
        />
      </div>

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
            {loading ? <Spinner label="Analyse en cours…" /> : 'Analyser et soumettre'}
          </button>
        </form>
      )}

      {result && (
        <div className="space-y-6">
          {/* Bandeau résultat global */}
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
                <Stat label="Temps total" value={result.best.durationLabel} />
                <Stat label="Distance" value={`${result.best.distanceKm.toFixed(2)} km`} />
                <Stat label="Vitesse moy." value={`${result.best.avgSpeedKnots.toFixed(1)} nds`} />
                <Stat
                  label="Vmax"
                  value={result.best.vmaxKnots != null ? `${result.best.vmaxKnots.toFixed(1)} nds` : '—'}
                />
              </div>
            )}

            {!result.best && (
              <p className="mt-3 text-sm text-amber-200/80">
                {result.analysis.totalPoints} point(s) GPS analysés. Vérifie que la
                trace couvre bien l'intégralité du parcours « {result.courseName} ».
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

          {/* Temps par secteur */}
          {result.best && result.best.sectors.some((s) => s.durationSeconds != null) && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold">Temps par secteur</h2>
              <div className="card divide-y divide-slate-800/70">
                {result.best.sectors
                  .filter((s) => s.durationSeconds != null)
                  .map((s) => {
                    const record = sectorRecords[s.sectorId] ?? null;
                    const color = sectorColor(s.durationSeconds, record);
                    const delta =
                      record && record > 0
                        ? Math.round(((s.durationSeconds - record) / record) * 100)
                        : null;
                    return (
                      <div key={s.sectorId} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span className="flex-1 text-sm text-slate-300">{s.name}</span>
                        <span className="font-mono font-semibold text-white">
                          {formatDuration(s.durationSeconds)}
                        </span>
                        <span className="w-24 text-right text-xs text-slate-400">
                          {delta == null
                            ? 'record !'
                            : delta <= 0
                              ? `${delta}% vs record`
                              : `+${delta}% vs record`}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Carte des secteurs colorés */}
          {sectorSegments.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold">Aperçu du tour par secteur</h2>
              <TourMap
                traces={sectorSegments}
                height={420}
                center={[course.centroid.lat, course.centroid.lon]}
                centerLabel={course.name}
                waypoints={courseWaypoints}
                showWaypointRadius={course.validationType !== 'winding'}
              />
              <p className="text-xs text-slate-500">
                Couleur relative au record du secteur : vert = rapide, rouge = lent.
              </p>
            </div>
          )}

          {/* Aperçu simple si pas de secteurs mesurés */}
          {result.best && sectorSegments.length === 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold">Aperçu du tour extrait</h2>
              <TourMap
                traces={[
                  {
                    id: 'preview',
                    positions: result.best.points.map((p) => [p.lat, p.lon] as [number, number]),
                    color: categoryColor(category),
                    label: `Tour · ${result.best.durationLabel}`,
                  },
                ]}
                height={420}
                center={[course.centroid.lat, course.centroid.lon]}
                centerLabel={course.name}
              />
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
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
