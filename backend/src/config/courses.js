// ============================================================================
// Configuration centrale des parcours « Tour Île Challenge ».
//
// C'est la source de vérité côté backend. Le frontend en tient un miroir typé
// dans frontend/src/config/courses.ts — garder les deux fichiers synchronisés.
//
// Chaque parcours décrit :
//   - id / name / description
//   - validationType : 'winding' (indice d'enroulement) | 'waypoints' (passage ordonné)
//   - centroid       : centre du winding number / centrage carte
//   - boundingBox    : filtre géographique des points GPX (bruit hors zone)
//   - waypoints      : liste ORDONNÉE de bornes { id, name, lat, lon, radiusMeters }
//                      · 'waypoints'  -> points à passer dans l'ordre pour valider
//                      · 'winding'    -> bornes de secteur (les 4 pointes de l'île),
//                                        ordonnées dans le sens de parcours (angulaire)
//   - sectors        : { id, name, startWaypointIndex, endWaypointIndex }
//                      découpe le tour en arcs entre deux bornes consécutives
//   - categories     : catégories de matériel autorisées
//
// Toutes les coordonnées proviennent d'OpenStreetMap / Nominatim, sauf mention
// « ⚠️ dérivé » (voir la pointe ouest de l'Île-aux-Moines).
// ============================================================================

import { CATEGORIES } from '../core/constants.js';

const ALL_CATEGORIES = [...CATEGORIES];

/** Construit une bounding box carrée autour d'un centroïde (± marge en degrés). */
export function boundingBoxAround(centroid, marginDeg = 0.05) {
  return {
    minLat: centroid.lat - marginDeg,
    maxLat: centroid.lat + marginDeg,
    minLon: centroid.lon - marginDeg,
    maxLon: centroid.lon + marginDeg,
  };
}

// ─── [1] Île-aux-Moines ─────────────────────────────────────────────────────
// Centroïde fixe (cahier des charges, cohérent avec OSM).
const ILE_AUX_MOINES_CENTROID = { lat: 47.5975, lon: -2.8433 };

// Bornes de secteur = les pointes de l'île, ordonnées dans le sens angulaire
// (anti-horaire) autour du centroïde pour que les secteurs soient des arcs
// contigus. Les libellés N/S/E/O suivent la géographie RÉELLE (OSM), qui diffère
// du cahier des charges : Brouel est à l'est, Nioul au sud.
const ILE_AUX_MOINES = {
  id: 'ile-aux-moines',
  name: "Tour de l'Île-aux-Moines",
  description:
    "Le tour historique de l'Île-aux-Moines, au cœur du Golfe du Morbihan. " +
    'Boucle complète détectée automatiquement (indice d\'enroulement).',
  validationType: 'winding',
  centroid: ILE_AUX_MOINES_CENTROID,
  boundingBox: { minLat: 47.4, maxLat: 47.8, minLon: -3.1, maxLon: -2.6 },
  categories: ALL_CATEGORIES,
  waypoints: [
    // ordre angulaire anti-horaire : Trec'h (N) → ouest → Nioul (S) → Brouel (E)
    { id: 'trech', name: "Pointe du Trec'h", lat: 47.6076482, lon: -2.8385098, radiusMeters: 500 },
    // ⚠️ dérivé : aucun nœud OSM nommé pour la pointe ouest de l'île
    // (« Pointe de Loh » du cahier des charges introuvable ; le « Toulindac »
    // d'OSM est sur le continent à Baden). Coordonnée approximative sur la côte
    // ouest, À VÉRIFIER / corriger si un point officiel est connu.
    { id: 'ouest', name: 'Pointe ouest (Toulindac, dérivé)', lat: 47.599, lon: -2.8525, radiusMeters: 500 },
    { id: 'nioul', name: 'Pointe de Nioul', lat: 47.5646531, lon: -2.859824, radiusMeters: 500 },
    { id: 'brouel', name: 'Pointe de Brouel', lat: 47.5907711, lon: -2.8276682, radiusMeters: 500 },
  ],
  sectors: [
    { id: 's1', name: "Façade ouest (Trec'h → Toulindac)", startWaypointIndex: 0, endWaypointIndex: 1 },
    { id: 's2', name: 'Façade sud-ouest (Toulindac → Nioul)', startWaypointIndex: 1, endWaypointIndex: 2 },
    { id: 's3', name: 'Façade sud-est (Nioul → Brouel)', startWaypointIndex: 2, endWaypointIndex: 3 },
    { id: 's4', name: "Façade est (Brouel → Trec'h)", startWaypointIndex: 3, endWaypointIndex: 0 },
  ],
};

// ─── [2] Île d'Arz ──────────────────────────────────────────────────────────
// Centroïde résolu via Nominatim (type « island »). Le cahier des charges
// prévoyait un fallback { 47.5833, -2.7833 } ; on conserve cette valeur comme
// repli dans resolveDynamicCentroids() mais la valeur OSM ci-dessous est plus
// précise et sert de défaut déterministe.
const ILE_ARZ_CENTROID = { lat: 47.5922528, lon: -2.8013734 };
export const ILE_ARZ_FALLBACK_CENTROID = { lat: 47.5833, lon: -2.7833 };

const ILE_ARZ = {
  id: 'ile-d-arz',
  name: "Tour de l'Île d'Arz",
  description:
    "Le tour de l'Île d'Arz, la voisine de l'Île-aux-Moines. " +
    'Boucle complète détectée automatiquement (indice d\'enroulement).',
  validationType: 'winding',
  centroid: ILE_ARZ_CENTROID,
  boundingBox: boundingBoxAround(ILE_ARZ_CENTROID, 0.05),
  categories: ALL_CATEGORIES,
  waypoints: [
    // ordre angulaire anti-horaire autour du centroïde : Nénézic (E) → Béluré (NE)
    // → Berno (O) → Liouse (SO). Toutes confirmées sur OSM.
    { id: 'nenezic', name: 'Pointe de Nénézic', lat: 47.5948654, lon: -2.7743205, radiusMeters: 500 },
    { id: 'belure', name: 'Pointe du Béluré', lat: 47.6060993, lon: -2.79321, radiusMeters: 500 },
    { id: 'berno', name: 'Pointe de Berno', lat: 47.5949258, lon: -2.8106563, radiusMeters: 500 },
    { id: 'liouse', name: 'Pointe de Liouse', lat: 47.5784149, lon: -2.8098707, radiusMeters: 500 },
  ],
  sectors: [
    { id: 's1', name: 'Façade nord-est (Nénézic → Béluré)', startWaypointIndex: 0, endWaypointIndex: 1 },
    { id: 's2', name: 'Façade nord-ouest (Béluré → Berno)', startWaypointIndex: 1, endWaypointIndex: 2 },
    { id: 's3', name: 'Façade sud-ouest (Berno → Liouse)', startWaypointIndex: 2, endWaypointIndex: 3 },
    { id: 's4', name: 'Façade sud-est (Liouse → Nénézic)', startWaypointIndex: 3, endWaypointIndex: 0 },
  ],
};

// ─── [3] Tour du Golfe du Morbihan ──────────────────────────────────────────
// Validation par waypoints ordonnés : grande boucle anti-horaire du Golfe,
// départ/arrivée vers Vannes (Conleau), descente de la côte est, passage de
// l'entrée du Golfe (Port-Navalo / Kerpenhir), remontée de la côte ouest.
// 8 waypoints OSM -> 7 secteurs (intervalles). radiusMeters = 300 (cahier des charges).
const TOUR_DU_GOLFE = {
  id: 'tour-du-golfe',
  name: 'Tour du Golfe du Morbihan',
  description:
    'La grande boucle du Golfe du Morbihan à la voile : 8 points de passage de ' +
    'Vannes à l\'entrée du Golfe et retour. Validé par passage ordonné des waypoints.',
  validationType: 'waypoints',
  centroid: { lat: 47.585, lon: -2.86 }, // centre approximatif (carte uniquement)
  boundingBox: { minLat: 47.4, maxLat: 47.8, minLon: -3.1, maxLon: -2.5 },
  categories: ALL_CATEGORIES,
  waypoints: [
    { id: 'conleau', name: 'Conleau (Vannes)', lat: 47.6366421, lon: -2.7753428, radiusMeters: 300 },
    { id: 'boedic', name: 'Île de Boëdic', lat: 47.6156934, lon: -2.78239, radiusMeters: 300 },
    { id: 'belure', name: "Pointe du Béluré (Île d'Arz)", lat: 47.6060993, lon: -2.79321, radiusMeters: 300 },
    { id: 'port-navalo', name: 'Port-Navalo (Arzon)', lat: 47.5460954, lon: -2.9142298, radiusMeters: 300 },
    { id: 'kerpenhir', name: 'Pointe de Kerpenhir (Locmariaquer)', lat: 47.5592287, lon: -2.9342898, radiusMeters: 300 },
    { id: 'gavrinis', name: 'Gavrinis (Larmor-Baden)', lat: 47.5741775, lon: -2.8974787, radiusMeters: 300 },
    { id: 'larmor-baden', name: 'Larmor-Baden', lat: 47.5865525, lon: -2.8947121, radiusMeters: 300 },
    { id: 'trech', name: "Pointe du Trec'h (Île-aux-Moines)", lat: 47.6076482, lon: -2.8385098, radiusMeters: 300 },
  ],
  // un secteur par intervalle entre deux waypoints consécutifs
  sectors: [
    { id: 's1', name: 'Conleau → Boëdic', startWaypointIndex: 0, endWaypointIndex: 1 },
    { id: 's2', name: 'Boëdic → Béluré', startWaypointIndex: 1, endWaypointIndex: 2 },
    { id: 's3', name: 'Béluré → Port-Navalo', startWaypointIndex: 2, endWaypointIndex: 3 },
    { id: 's4', name: 'Port-Navalo → Kerpenhir', startWaypointIndex: 3, endWaypointIndex: 4 },
    { id: 's5', name: 'Kerpenhir → Gavrinis', startWaypointIndex: 4, endWaypointIndex: 5 },
    { id: 's6', name: 'Gavrinis → Larmor-Baden', startWaypointIndex: 5, endWaypointIndex: 6 },
    { id: 's7', name: "Larmor-Baden → Trec'h", startWaypointIndex: 6, endWaypointIndex: 7 },
  ],
};

// ─── Registre ────────────────────────────────────────────────────────────────
export const COURSES = {
  [ILE_AUX_MOINES.id]: ILE_AUX_MOINES,
  [ILE_ARZ.id]: ILE_ARZ,
  [TOUR_DU_GOLFE.id]: TOUR_DU_GOLFE,
};

/** Identifiant du parcours par défaut (compatibilité avec l'existant). */
export const DEFAULT_COURSE_ID = ILE_AUX_MOINES.id;

/** Liste ordonnée des parcours (pour les sélecteurs d'UI / l'API). */
export const COURSE_LIST = [ILE_AUX_MOINES, ILE_ARZ, TOUR_DU_GOLFE];

/** Retourne la config d'un parcours, ou null si l'id est inconnu. */
export function getCourse(courseId) {
  return COURSES[courseId] || null;
}

/** Vrai si l'id correspond à un parcours connu. */
export function isValidCourseId(courseId) {
  return Object.prototype.hasOwnProperty.call(COURSES, courseId);
}

/**
 * Tente de rafraîchir le centroïde de l'Île d'Arz via Nominatim (best-effort).
 * Met à jour COURSES['ile-d-arz'].centroid ET sa boundingBox.
 * À appeler au démarrage du serveur ; n'échoue jamais (repli silencieux).
 */
export async function resolveDynamicCentroids() {
  const course = COURSES[ILE_ARZ.id];
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
      encodeURIComponent("Île d'Arz Morbihan");
    const res = await fetch(url, {
      headers: { 'User-Agent': 'tour-ile-challenge/1.0 (resolve centroid)' },
      signal: AbortSignal.timeout?.(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    const lat = hit ? parseFloat(hit.lat) : NaN;
    const lon = hit ? parseFloat(hit.lon) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      course.centroid = { lat, lon };
      course.boundingBox = boundingBoxAround(course.centroid, 0.05);
      return course.centroid;
    }
    throw new Error('réponse Nominatim inexploitable');
  } catch (err) {
    // Repli : on garde la valeur OSM déterministe déjà en place (ou le fallback
    // historique du cahier des charges si jamais elle manquait).
    if (!course.centroid) {
      course.centroid = { ...ILE_ARZ_FALLBACK_CENTROID };
      course.boundingBox = boundingBoxAround(course.centroid, 0.05);
    }
    return course.centroid;
  }
}

export default { COURSES, COURSE_LIST, DEFAULT_COURSE_ID, getCourse, isValidCourseId, resolveDynamicCentroids };
