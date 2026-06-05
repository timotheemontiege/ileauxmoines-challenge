// ============================================================================
// Miroir TYPÉ de backend/src/config/courses.js — source de vérité côté frontend.
// Garder synchronisé avec le backend. Les coordonnées viennent d'OpenStreetMap.
// ============================================================================

export type ValidationType = 'winding' | 'waypoints';

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
    "La grande boucle du Golfe du Morbihan à la voile : 8 points de passage de Vannes à l'entrée du Golfe et retour.",
  validationType: 'waypoints',
  centroid: { lat: 47.585, lon: -2.86 },
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
