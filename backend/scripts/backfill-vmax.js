// ============================================================================
// Backfill Vmax (+ secteurs) des anciennes performances.
//
// Relit chaque GPX depuis Supabase Storage, relance la détection v2 (detectTour)
// et met à jour `vmax_knots`, `sector_times`, et reconstruit `sector_performances`.
//
// Usage (depuis le dossier backend/, avec .env renseigné) :
//   node scripts/backfill-vmax.js --dry-run      # prévisualise, n'écrit rien
//   node scripts/backfill-vmax.js                # applique vmax + secteurs
//   node scripts/backfill-vmax.js --vmax-only    # met à jour SEULEMENT vmax_knots
//
// Sûr : ne supprime jamais une performance ; si un tour n'est pas redétecté,
// la ligne est laissée intacte et signalée.
// ============================================================================
import 'dotenv/config';
import { supabaseAdmin, isSupabaseConfigured, GPX_BUCKET } from '../src/lib/supabase.js';
import { parseGpx } from '../src/core/gpxParser.js';
import { detectTour } from '../src/core/tourDetector.js';
import { getCourse } from '../src/config/courses.js';

const DRY_RUN = process.argv.includes('--dry-run');
const VMAX_ONLY = process.argv.includes('--vmax-only');
const WITH_SECTORS = !VMAX_ONLY;

async function main() {
  if (!isSupabaseConfigured) {
    console.error('❌ Supabase non configuré : renseigne backend/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY).');
    process.exit(1);
  }

  console.log(
    `\n🔄 Backfill Vmax${WITH_SECTORS ? ' + secteurs' : ' (vmax uniquement)'}${DRY_RUN ? ' — DRY RUN (aucune écriture)' : ''}\n`,
  );

  // 1) Toutes les performances.
  const { data: perfs, error } = await supabaseAdmin
    .from('performances')
    .select('id, session_id, user_id, course_id, category, validated_at, vmax_knots')
    .order('validated_at', { ascending: true });
  if (error) throw new Error(error.message);
  console.log(`${perfs.length} performance(s) à traiter.\n`);

  // 2) Carte session_id -> chemin GPX.
  const sessionIds = [...new Set(perfs.map((p) => p.session_id))];
  const { data: sessions, error: se } = await supabaseAdmin
    .from('sessions')
    .select('id, gpx_file_url')
    .in('id', sessionIds);
  if (se) throw new Error(se.message);
  const pathById = new Map(sessions.map((s) => [s.id, s.gpx_file_url]));

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const perf of perfs) {
    const tag = perf.id.slice(0, 8);
    const path = pathById.get(perf.session_id);
    if (!path) {
      console.warn(`  ⏭️  ${tag} : aucun fichier GPX en Storage, ignoré.`);
      skipped++;
      continue;
    }
    const course = getCourse(perf.course_id);
    if (!course) {
      console.warn(`  ⏭️  ${tag} : parcours inconnu « ${perf.course_id} », ignoré.`);
      skipped++;
      continue;
    }

    try {
      const { data: blob, error: de } = await supabaseAdmin.storage.from(GPX_BUCKET).download(path);
      if (de || !blob) throw new Error(de?.message || 'téléchargement vide');

      const xml = await blob.text();
      const points = parseGpx(xml);
      const det = detectTour(points, course);

      if (!det.valid || !det.bestTour) {
        console.warn(`  ⏭️  ${tag} : tour non redétecté (${course.id}), laissé intact.`);
        skipped++;
        continue;
      }

      const best = det.bestTour;
      const vmax = best.vmaxKnots != null ? Number(best.vmaxKnots.toFixed(2)) : null;
      const measured = (best.sectors || []).filter((s) => s.durationSeconds != null);

      console.log(
        `  ✏️  ${tag} : vmax ${perf.vmax_knots ?? '—'} → ${vmax ?? '—'} nds` +
          (WITH_SECTORS ? ` · ${measured.length} secteur(s)` : ''),
      );

      if (DRY_RUN) {
        updated++;
        continue;
      }

      // Mise à jour de la performance.
      const patch = { vmax_knots: vmax };
      if (WITH_SECTORS) patch.sector_times = measured;
      const { error: ue } = await supabaseAdmin
        .from('performances')
        .update(patch)
        .eq('id', perf.id);
      if (ue) throw new Error(ue.message);

      // Reconstruction du classement par secteur (idempotent : delete + insert).
      if (WITH_SECTORS) {
        const { error: del } = await supabaseAdmin
          .from('sector_performances')
          .delete()
          .eq('performance_id', perf.id);
        if (del) throw new Error(del.message);

        if (measured.length > 0) {
          const rows = measured.map((s) => ({
            performance_id: perf.id,
            user_id: perf.user_id,
            course_id: perf.course_id,
            sector_id: s.sectorId,
            sector_name: s.name,
            duration_seconds: s.durationSeconds,
            category: perf.category,
            achieved_at: perf.validated_at,
          }));
          const { error: ie } = await supabaseAdmin.from('sector_performances').insert(rows);
          if (ie) throw new Error(ie.message);
        }
      }

      updated++;
    } catch (e) {
      console.error(`  ❌ ${tag} : ERREUR — ${e.message}`);
      failed++;
    }
  }

  console.log(
    `\n✅ Terminé : ${updated} ${DRY_RUN ? 'à mettre à jour' : 'mis à jour'}, ${skipped} ignorés, ${failed} en erreur.\n`,
  );
}

main().catch((e) => {
  console.error('\n💥 Échec du backfill :', e.message);
  process.exit(1);
});
