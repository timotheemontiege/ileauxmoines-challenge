// Parsing GPX (XML) -> tableau de points { lat, lon, ele, time }.
// Le parsing est fait UNIQUEMENT côté backend (jamais côté client).

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // On force ces conteneurs à être des tableaux pour un parcours uniforme,
  // même quand il n'y a qu'un seul élément.
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept', 'wpt'].includes(name),
});

function toNumber(value) {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

// fast-xml-parser renvoie soit une valeur scalaire, soit un objet { '#text': ... }
// quand la balise porte aussi des attributs. On extrait le texte dans tous les cas.
function textOf(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value['#text'] ?? null;
  return value;
}

function parsePoint(pt) {
  const lat = toNumber(pt['@_lat']);
  const lon = toNumber(pt['@_lon']);
  if (lat === null || lon === null) return null;

  let time = null;
  const rawTime = textOf(pt.time);
  if (rawTime != null) {
    const parsed = Date.parse(rawTime);
    if (Number.isFinite(parsed)) time = parsed; // epoch en millisecondes
  }

  const ele = toNumber(textOf(pt.ele));

  return { lat, lon, ele, time };
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse un document GPX (string XML) en tableau de points.
 * Privilégie les <trkpt> ; retombe sur <rtept> puis <wpt> si aucun track.
 *
 * @param {string} xml contenu du fichier .gpx
 * @returns {Array<{lat:number, lon:number, ele:number|null, time:number|null}>}
 */
export function parseGpx(xml) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error('Fichier GPX vide ou illisible');
  }

  let doc;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    throw new Error(`Fichier GPX malformé : ${err.message}`);
  }

  const gpx = doc.gpx;
  if (!gpx) {
    throw new Error('Fichier GPX invalide : balise <gpx> manquante');
  }

  const points = [];

  for (const trk of toArray(gpx.trk)) {
    for (const seg of toArray(trk.trkseg)) {
      for (const pt of toArray(seg.trkpt)) {
        const parsed = parsePoint(pt);
        if (parsed) points.push(parsed);
      }
    }
  }

  // Fallbacks pour les fichiers exportés en route ou en waypoints.
  if (points.length === 0) {
    for (const rte of toArray(gpx.rte)) {
      for (const pt of toArray(rte.rtept)) {
        const parsed = parsePoint(pt);
        if (parsed) points.push(parsed);
      }
    }
  }
  if (points.length === 0) {
    for (const pt of toArray(gpx.wpt)) {
      const parsed = parsePoint(pt);
      if (parsed) points.push(parsed);
    }
  }

  return points;
}

export default parseGpx;
