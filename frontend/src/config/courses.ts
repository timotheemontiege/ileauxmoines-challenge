// ============================================================================
// Miroir TYPÉ de backend/src/config/courses.js — source de vérité côté frontend.
// Garder synchronisé avec le backend. Les coordonnées viennent d'OpenStreetMap.
// ============================================================================

export type ValidationType = 'winding' | 'waypoints' | 'outer-loop';

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusMeters: number;
}

export interface Sector {
  id: string;
  name: string;
  startWaypointIndex: number;
  endWaypointIndex: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  validationType: ValidationType;
  centroid: LatLon;
  boundingBox: BoundingBox;
  categories: string[];
  waypoints: Waypoint[];
  sectors: Sector[];
}

const ALL_CATEGORIES = ['wingfoil', 'windsurf', 'kitesurf', 'voile_legere', 'autre'];

const ILE_AUX_MOINES: Course = {
  id: 'ile-aux-moines',
  name: "Tour de l'Île-aux-Moines",
  description:
    "Le tour historique de l'Île-aux-Moines, au cœur du Golfe du Morbihan. Boucle complète détectée automatiquement.",
  validationType: 'winding',
  centroid: { lat: 47.5975, lon: -2.8433 },
  boundingBox: { minLat: 47.4, maxLat: 47.8, minLon: -3.1, maxLon: -2.6 },
  categories: ALL_CATEGORIES,
  waypoints: [
    { id: 'trech', name: "Pointe du Trec'h", lat: 47.6076482, lon: -2.8385098, radiusMeters: 500 },
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

const ILE_ARZ: Course = {
  id: 'ile-d-arz',
  name: "Tour de l'Île d'Arz",
  description:
    "Le tour de l'Île d'Arz, la voisine de l'Île-aux-Moines. Boucle complète détectée automatiquement.",
  validationType: 'winding',
  centroid: { lat: 47.5922528, lon: -2.8013734 },
  boundingBox: { minLat: 47.5422528, maxLat: 47.6422528, minLon: -2.8513734, maxLon: -2.7513734 },
  categories: ALL_CATEGORIES,
  waypoints: [
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

const TOUR_DU_GOLFE: Course = {
  id: 'tour-du-golfe',
  name: 'Tour du Golfe du Morbihan',
  description:
    "La grande boucle du Golfe du Morbihan à la voile : longer les 6 balises par l'EXTÉRIEUR, dans l'ordre, dans le sens et au départ de son choix.",
  validationType: 'outer-loop',
  centroid: { lat: 47.5857, lon: -2.8321 },
  boundingBox: { minLat: 47.4, maxLat: 47.8, minLon: -3.1, maxLon: -2.5 },
  categories: ALL_CATEGORIES,
  // 6 balises dans l'ordre = sommets du polygone P (sens horaire).
  waypoints: [
    { id: 'trech', name: "Pointe du Trec'h (Île-aux-Moines)", lat: 47.6076482, lon: -2.8385098, radiusMeters: 300 },
    { id: 'belure', name: "Pointe du Béluré (Île d'Arz)", lat: 47.6060993, lon: -2.79321, radiusMeters: 300 },
    { id: 'nenezic', name: "Pointe de Nénézic (Île d'Arz)", lat: 47.5948654, lon: -2.7743205, radiusMeters: 300 },
    { id: 'liouse', name: "Pointe de Liouse (Île d'Arz)", lat: 47.5784149, lon: -2.8098707, radiusMeters: 300 },
    { id: 'nioul', name: 'Pointe de Nioul (Île-aux-Moines)', lat: 47.5646531, lon: -2.859824, radiusMeters: 300 },
    { id: 'balise6', name: 'Balise 6 — entrée ouest du Golfe', lat: 47.5627910, lon: -2.9166475, radiusMeters: 300 },
  ],
  // 4 façades (Option A) : Nord=arête 0-1 · Est=1-2-3 · Sud=3-4-5 · Ouest=5-0.
  sectors: [
    { id: 's1', name: "Façade Nord (Trec'h → Béluré)", startWaypointIndex: 0, endWaypointIndex: 1 },
    { id: 's2', name: 'Façade Est (Béluré → Nénézic → Liouse)', startWaypointIndex: 1, endWaypointIndex: 3 },
    { id: 's3', name: 'Façade Sud (Liouse → Nioul → Balise 6)', startWaypointIndex: 3, endWaypointIndex: 5 },
    { id: 's4', name: "Façade Ouest (Balise 6 → Trec'h)", startWaypointIndex: 5, endWaypointIndex: 0 },
  ],
};

export const COURSE_LIST: Course[] = [ILE_AUX_MOINES, ILE_ARZ, TOUR_DU_GOLFE];

export const COURSES: Record<string, Course> = {
  [ILE_AUX_MOINES.id]: ILE_AUX_MOINES,
  [ILE_ARZ.id]: ILE_ARZ,
  [TOUR_DU_GOLFE.id]: TOUR_DU_GOLFE,
};

export const DEFAULT_COURSE_ID = ILE_AUX_MOINES.id;

export function getCourse(courseId: string | null | undefined): Course | null {
  if (!courseId) return null;
  return COURSES[courseId] ?? null;
}

export function isValidCourseId(courseId: string | null | undefined): boolean {
  return !!courseId && Object.prototype.hasOwnProperty.call(COURSES, courseId);
}
