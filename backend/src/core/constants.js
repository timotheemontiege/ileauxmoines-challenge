// Constantes géographiques et métier partagées par tout le backend.

/**
 * Centroïde de l'Île-aux-Moines (Golfe du Morbihan).
 * Point de référence fixe utilisé comme centre du « winding number ».
 */
export const ILE_AUX_MOINES_CENTROID = { lat: 47.5975, lon: -2.8433 };

/**
 * Bounding box du Golfe du Morbihan.
 * Tout point GPS hors de cette zone est considéré comme du bruit
 * (trajet voiture, GPS oublié allumé, etc.) et filtré avant analyse.
 */
export const GOLFE_BBOX = {
  minLat: 47.4,
  maxLat: 47.8,
  minLon: -3.1,
  maxLon: -2.6,
};

/** Catégories de matériel autorisées pour une performance. */
export const CATEGORIES = ['wingfoil', 'windsurf', 'kitesurf', 'voile_legere', 'autre'];

// ── Validation « tour par l'extérieur » (Tour du Golfe) ─────────────────────
// Le rider doit longer les 6 balises (sommets du polygone P) dans l'ordre
// cyclique, dans un sens libre (cw|ccw), départ libre, en restant DEHORS de P
// et sans couper à travers P.

/** Rayon d'approche par défaut d'une balise (m) si non précisé par balise. */
export const OUTER_LOOP_DEFAULT_RADIUS_METERS = 300;

/**
 * Profondeur (m) à l'intérieur du polygone P au-delà de laquelle un point — qui
 * n'est PAS dans le rayon d'une balise — compte comme une vraie incursion
 * (« la trace coupe à travers P ») et invalide le tour.
 * 250 m = réglage PERMISSIF : tolère d'arrondir une balise un peu en dedans et
 * le bruit GPS côtier ; ne rejette que les franches traversées du Golfe.
 */
export const OUTER_LOOP_INCURSION_DEPTH_METERS = 250;

/** Paramètres par défaut de l'algorithme de détection de tour. */
export const DEFAULT_DETECTION_OPTIONS = {
  center: ILE_AUX_MOINES_CENTROID,
  bbox: GOLFE_BBOX,
  // Un tour complet vaut 2π. On tolère 0.15 rad (~8.6°) pour absorber
  // le bruit GPS près du point de bouclage.
  angleTolerance: 0.15,
  minDurationSeconds: 180, // au moins 3 minutes
  minSpeedKnots: 2, // en dessous : à la dérive / à l'arrêt
  maxSpeedKnots: 60, // au dessus : glitch GPS / trajet motorisé
};
