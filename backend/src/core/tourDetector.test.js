import { describe, it, expect } from 'vitest';
import {
  detectBestTour,
  detectAllTours,
  analyzeTrack,
  estimateSampleIntervalSeconds,
} from './tourDetector.js';
import { ILE_AUX_MOINES_CENTROID as CENTER } from './constants.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Génère une trace circulaire synthétique autour d'un centre.
 * radiusDeg = 0.01° -> rayon ~1.1 km -> circonférence ~7 km.
 * Avec durationSec = 1800 (30 min) -> ~7.5 nœuds (réaliste, et valide).
 */
function makeCircle({
  center = CENTER,
  radiusDeg = 0.01,
  n = 240,
  durationSec = 1800,
  startMs = Date.UTC(2024, 5, 1, 10, 0, 0),
  clockwise = false,
  startAngle = 0,
  turns = 1,
  jitterDeg = 0,
} = {}) {
  const cosLat = Math.cos(center.lat * DEG_TO_RAD);
  const direction = clockwise ? -1 : 1;
  const points = [];
  for (let k = 0; k <= n; k++) {
    const frac = k / n;
    const theta = startAngle + direction * TWO_PI_TURNS(turns) * frac;
    const noise = jitterDeg ? (Math.sin(k * 12.9898) * 43758.5453) % 1 : 0;
    const jLat = jitterDeg ? (noise - 0.5) * 2 * jitterDeg : 0;
    const jLon = jitterDeg ? (((noise * 7) % 1) - 0.5) * 2 * jitterDeg : 0;
    points.push({
      lat: center.lat + radiusDeg * Math.sin(theta) + jLat,
      lon: center.lon + (radiusDeg * Math.cos(theta)) / cosLat + jLon,
      time: startMs + Math.round(frac * durationSec * 1000),
    });
  }
  return points;
}

function TWO_PI_TURNS(turns) {
  return 2 * Math.PI * turns;
}

/** Faux trajet voiture hors Golfe (à filtrer). */
function makeCarTrip({ n = 100, startMs = Date.UTC(2024, 5, 1, 9, 0, 0) } = {}) {
  const points = [];
  for (let k = 0; k <= n; k++) {
    points.push({
      lat: 47.0 + k * 0.001, // au sud du Golfe (< 47.4)
      lon: -2.3 - k * 0.0005, // à l'est (> -2.6)
      time: startMs + k * 1000,
    });
  }
  return points;
}

describe('tourDetector — winding number', () => {
  it('détecte un tour complet et calcule des métriques cohérentes', () => {
    const tour = detectBestTour(makeCircle({ turns: 1, durationSec: 1800 }));
    expect(tour).not.toBeNull();
    // ~30 min
    expect(tour.durationSeconds).toBeGreaterThanOrEqual(1700);
    expect(tour.durationSeconds).toBeLessThanOrEqual(1900);
    // circonférence ~7 km (un seul tour)
    expect(tour.distanceKm).toBeGreaterThan(6);
    expect(tour.distanceKm).toBeLessThan(8);
    // vitesse plausible
    expect(tour.avgSpeedKnots).toBeGreaterThan(2);
    expect(tour.avgSpeedKnots).toBeLessThan(60);
    // la trace du tour est exportée pour la carte
    expect(tour.points.length).toBeGreaterThan(100);
  });

  it('détecte un tour dans le sens horaire aussi', () => {
    const tour = detectBestTour(makeCircle({ clockwise: true }));
    expect(tour).not.toBeNull();
    expect(tour.distanceKm).toBeGreaterThan(6);
    expect(tour.distanceKm).toBeLessThan(8);
  });

  it("ne détecte PAS de tour sur un demi-tour", () => {
    const tour = detectBestTour(makeCircle({ turns: 0.5 }));
    expect(tour).toBeNull();
    expect(detectAllTours(makeCircle({ turns: 0.5 }))).toHaveLength(0);
  });

  it('détecte 2 tours consécutifs', () => {
    const track = makeCircle({ turns: 2, n: 480, durationSec: 3600 });
    const tours = detectAllTours(track);
    expect(tours).toHaveLength(2);
    // le meilleur tour ne couvre qu'une seule boucle (~7 km, pas 14)
    const best = detectBestTour(track);
    expect(best).not.toBeNull();
    expect(best.distanceKm).toBeLessThan(9);
    expect(best.durationSeconds).toBeLessThan(2100);
  });

  it('détecte le tour malgré du bruit (trajet voiture + jitter GPS)', () => {
    const track = [
      ...makeCarTrip(), // hors zone : doit être filtré
      ...makeCircle({
        turns: 1,
        durationSec: 1800,
        startMs: Date.UTC(2024, 5, 1, 10, 0, 0),
        jitterDeg: 0.0003, // ~30 m de bruit
      }),
    ];
    const result = analyzeTrack(track);
    expect(result.best).not.toBeNull();
    expect(result.best.durationSeconds).toBeGreaterThan(1500);
    expect(result.pointsInZone).toBeLessThan(result.totalPoints); // voiture filtrée
  });

  it('retourne null quand il y a trop peu de points', () => {
    expect(detectBestTour([])).toBeNull();
    expect(detectBestTour([{ lat: 47.6, lon: -2.84, time: 0 }])).toBeNull();
  });

  it('signale une fréquence GPS trop basse (> 2 s)', () => {
    const slow = makeCircle({ n: 200, durationSec: 1800 }); // intervalle ~9 s
    const result = analyzeTrack(slow);
    expect(result.lowFrequencyWarning).toBe(true);
    expect(estimateSampleIntervalSeconds(slow)).toBeGreaterThan(2);

    const fast = makeCircle({ n: 1800, durationSec: 1800 }); // intervalle 1 s
    expect(analyzeTrack(fast).lowFrequencyWarning).toBe(false);
  });
});
