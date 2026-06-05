#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tests du détecteur de tour — PORTAGE PYTHON de backend/src/core/tourDetector.js.

Node n'étant pas installé sur la machine de dev, la logique JS est reportée
fidèlement ici en Python 3 (stdlib uniquement) et testée avec unittest.

Lancer :  python -m unittest backend/tests/test_tour_detector.py
   ou   :  python backend/tests/test_tour_detector.py
   ou   :  pytest backend/tests/test_tour_detector.py
"""

import math
import unittest

# ============================================================================
# Constantes (miroir de constants.js / courses.js)
# ============================================================================
DEG_TO_RAD = math.pi / 180.0
TWO_PI = 2 * math.pi
EARTH_RADIUS_M = 6371008.8
MS_TO_KNOTS = 1.9438444924406

ILE_AUX_MOINES_CENTROID = {"lat": 47.5975, "lon": -2.8433}
GOLFE_BBOX = {"minLat": 47.4, "maxLat": 47.8, "minLon": -3.1, "maxLon": -2.6}

DEFAULT_OPTS = {
    "center": ILE_AUX_MOINES_CENTROID,
    "bbox": GOLFE_BBOX,
    "angleTolerance": 0.15,
    "minDurationSeconds": 180,
    "minSpeedKnots": 2,
    "maxSpeedKnots": 60,
}

MIN_VMAX_WINDOW_SECONDS = 2

# Configuration de l'Île-aux-Moines (bornes de secteur = pointes, ordre angulaire)
IAM_COURSE = {
    "validationType": "winding",
    "centroid": ILE_AUX_MOINES_CENTROID,
    "boundingBox": GOLFE_BBOX,
    "waypoints": [
        {"id": "trech", "lat": 47.6076482, "lon": -2.8385098, "radiusMeters": 500},
        {"id": "ouest", "lat": 47.599, "lon": -2.8525, "radiusMeters": 500},
        {"id": "nioul", "lat": 47.5646531, "lon": -2.859824, "radiusMeters": 500},
        {"id": "brouel", "lat": 47.5907711, "lon": -2.8276682, "radiusMeters": 500},
    ],
    "sectors": [
        {"id": "s1", "name": "Façade ouest", "startWaypointIndex": 0, "endWaypointIndex": 1},
        {"id": "s2", "name": "Façade sud-ouest", "startWaypointIndex": 1, "endWaypointIndex": 2},
        {"id": "s3", "name": "Façade sud-est", "startWaypointIndex": 2, "endWaypointIndex": 3},
        {"id": "s4", "name": "Façade est", "startWaypointIndex": 3, "endWaypointIndex": 0},
    ],
}

# Petit parcours synthétique « waypoints » (carré ~2 km de côté, bien séparé)
SQUARE_COURSE = {
    "validationType": "waypoints",
    "centroid": {"lat": 47.60, "lon": -2.85},
    "boundingBox": GOLFE_BBOX,
    "waypoints": [
        {"id": "w0", "lat": 47.580, "lon": -2.880, "radiusMeters": 150},
        {"id": "w1", "lat": 47.580, "lon": -2.820, "radiusMeters": 150},
        {"id": "w2", "lat": 47.620, "lon": -2.820, "radiusMeters": 150},
        {"id": "w3", "lat": 47.620, "lon": -2.880, "radiusMeters": 150},
    ],
    "sectors": [
        {"id": "s1", "name": "w0->w1", "startWaypointIndex": 0, "endWaypointIndex": 1},
        {"id": "s2", "name": "w1->w2", "startWaypointIndex": 1, "endWaypointIndex": 2},
        {"id": "s3", "name": "w2->w3", "startWaypointIndex": 2, "endWaypointIndex": 3},
    ],
}


# ============================================================================
# Géométrie (miroir geo.js)
# ============================================================================
def haversine_meters(a, b):
    lat1 = a["lat"] * DEG_TO_RAD
    lat2 = b["lat"] * DEG_TO_RAD
    d_lat = (b["lat"] - a["lat"]) * DEG_TO_RAD
    d_lon = (b["lon"] - a["lon"]) * DEG_TO_RAD
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


# ============================================================================
# Détection par indice d'enroulement (miroir tourDetector.js)
# ============================================================================
def filter_to_zone(points, bbox):
    return [
        p for p in points
        if bbox["minLat"] <= p["lat"] <= bbox["maxLat"]
        and bbox["minLon"] <= p["lon"] <= bbox["maxLon"]
    ]


def cumulative_angles(points, center):
    cos_lat = math.cos(center["lat"] * DEG_TO_RAD)
    angles = [0.0] * len(points)
    cumulative = 0.0
    previous = 0.0
    for i, p in enumerate(points):
        dy = p["lat"] - center["lat"]
        dx = (p["lon"] - center["lon"]) * cos_lat
        theta = math.atan2(dy, dx)
        if i > 0:
            delta = theta - previous
            cumulative += math.atan2(math.sin(delta), math.cos(delta))
        angles[i] = cumulative
        previous = theta
    return angles


def build_context(points, opts):
    in_zone = [p for p in filter_to_zone(points, opts["bbox"]) if p.get("time") is not None]
    in_zone.sort(key=lambda p: p["time"])
    n = len(in_zone)
    angles = cumulative_angles(in_zone, opts["center"])
    cum_dist = [0.0] * n
    for i in range(1, n):
        cum_dist[i] = cum_dist[i - 1] + haversine_meters(in_zone[i - 1], in_zone[i])
    return {"points": in_zone, "n": n, "angles": angles, "cumDist": cum_dist}


def window_metrics(ctx, i, j):
    duration = (ctx["points"][j]["time"] - ctx["points"][i]["time"]) / 1000.0
    dist_m = ctx["cumDist"][j] - ctx["cumDist"][i]
    avg = (dist_m / duration) * MS_TO_KNOTS if duration > 0 else 0.0
    return {"durationSeconds": duration, "distanceKm": dist_m / 1000.0, "avgSpeedKnots": avg}


def is_valid_tour(m, opts):
    return (
        m["durationSeconds"] >= opts["minDurationSeconds"]
        and m["avgSpeedKnots"] >= opts["minSpeedKnots"]
        and m["avgSpeedKnots"] <= opts["maxSpeedKnots"]
    )


def build_tour(ctx, i, j, m):
    pts = ctx["points"][i:j + 1]
    return {
        "startIndex": i,
        "endIndex": j,
        "startTime": ctx["points"][i]["time"],
        "endTime": ctx["points"][j]["time"],
        "durationSeconds": m["durationSeconds"],
        "distanceKm": m["distanceKm"],
        "avgSpeedKnots": m["avgSpeedKnots"],
        "points": [{"lat": p["lat"], "lon": p["lon"], "time": p["time"]} for p in pts],
    }


def detect_best_tour(points, opts=None):
    o = dict(DEFAULT_OPTS)
    if opts:
        o.update(opts)
    ctx = build_context(points, o)
    if ctx["n"] < 3:
        return None
    threshold = TWO_PI - o["angleTolerance"]
    best = None
    best_ij = None
    for i in range(ctx["n"]):
        for j in range(i + 1, ctx["n"]):
            if abs(ctx["angles"][j] - ctx["angles"][i]) >= threshold:
                m = window_metrics(ctx, i, j)
                if is_valid_tour(m, o) and (best is None or m["durationSeconds"] < best["durationSeconds"]):
                    best = m
                    best_ij = (i, j)
                break
    return build_tour(ctx, best_ij[0], best_ij[1], best) if best_ij else None


def detect_all_tours(points, opts=None):
    o = dict(DEFAULT_OPTS)
    if opts:
        o.update(opts)
    ctx = build_context(points, o)
    if ctx["n"] < 3:
        return []
    threshold = TWO_PI - o["angleTolerance"]
    tours = []
    start = 0
    for j in range(1, ctx["n"]):
        if abs(ctx["angles"][j] - ctx["angles"][start]) >= threshold:
            m = window_metrics(ctx, start, j)
            if is_valid_tour(m, o):
                tours.append(build_tour(ctx, start, j, m))
            start = j
    return tours


# ============================================================================
# Vmax (fenêtre glissante >= 2 s)
# ============================================================================
def compute_vmax_knots(points, start_index=0, end_index=None, min_window=MIN_VMAX_WINDOW_SECONDS):
    if end_index is None:
        end_index = len(points) - 1
    vmax = 0.0
    j = start_index
    for i in range(start_index, end_index + 1):
        if j < i:
            j = i
        while j < end_index and (points[j]["time"] - points[i]["time"]) / 1000.0 < min_window:
            j += 1
        dt = (points[j]["time"] - points[i]["time"]) / 1000.0
        if dt >= min_window:
            knots = (haversine_meters(points[i], points[j]) / dt) * MS_TO_KNOTS
            if knots > vmax:
                vmax = knots
    return vmax


# ============================================================================
# Secteurs « winding »
# ============================================================================
def empty_sector(s):
    return {"sectorId": s["id"], "name": s.get("name"), "durationSeconds": None,
            "startTime": None, "endTime": None}


def build_winding_sectors(course, tour_points):
    wps = course["waypoints"]
    if len(tour_points) < 2 or not wps:
        return [empty_sector(s) for s in course["sectors"]]

    approach = []
    for wp in wps:
        best_d = float("inf")
        best_i = -1
        for i, p in enumerate(tour_points):
            d = haversine_meters(p, wp)
            if d < best_d:
                best_d = d
                best_i = i
        approach.append({"index": best_i, "time": tour_points[best_i]["time"] if best_i >= 0 else None})

    start_t = tour_points[0]["time"]
    end_t = tour_points[-1]["time"]

    ordered = sorted(
        [dict(a, wpIndex=k) for k, a in enumerate(approach) if a["index"] >= 0],
        key=lambda a: a["index"],
    )

    arc_ms = {}
    L = len(ordered)
    for i in range(L):
        cur = ordered[i]
        nxt = ordered[(i + 1) % L]
        if i + 1 < L:
            dur = nxt["time"] - cur["time"]
        else:
            dur = (end_t - cur["time"]) + (nxt["time"] - start_t)
        arc_ms[(cur["wpIndex"], nxt["wpIndex"])] = dur
        arc_ms[(nxt["wpIndex"], cur["wpIndex"])] = dur

    out = []
    for s in course["sectors"]:
        a = approach[s["startWaypointIndex"]]
        b = approach[s["endWaypointIndex"]]
        dur = arc_ms.get((s["startWaypointIndex"], s["endWaypointIndex"]))
        if a["index"] < 0 or b["index"] < 0 or dur is None:
            out.append(empty_sector(s))
            continue
        out.append({
            "sectorId": s["id"],
            "name": s.get("name"),
            "durationSeconds": round(dur / 1000.0),
            "startTime": min(a["time"], b["time"]),
            "endTime": max(a["time"], b["time"]),
        })
    return out


# ============================================================================
# Détection par waypoints ordonnés
# ============================================================================
def find_ordered_passages(points, waypoints):
    passages = []
    cursor = 0
    for w, wp in enumerate(waypoints):
        i = cursor
        while i < len(points) and haversine_meters(points[i], wp) > wp["radiusMeters"]:
            i += 1
        if i >= len(points):
            return {"passages": passages, "complete": False, "missingIndex": w}
        best_i = i
        best_d = haversine_meters(points[i], wp)
        j = i
        while j < len(points) and haversine_meters(points[j], wp) <= wp["radiusMeters"]:
            d = haversine_meters(points[j], wp)
            if d < best_d:
                best_d = d
                best_i = j
            j += 1
        passages.append({"wpIndex": w, "index": best_i, "time": points[best_i]["time"]})
        cursor = j
    return {"passages": passages, "complete": True}


def detect_by_waypoints(points, course, opts=None):
    o = dict(DEFAULT_OPTS)
    if opts:
        o.update(opts)
    pts = [p for p in filter_to_zone(points, o["bbox"]) if p.get("time") is not None]
    pts.sort(key=lambda p: p["time"])
    if len(pts) < 2:
        return {"valid": False, "bestTour": None, "allTours": []}

    res = find_ordered_passages(pts, course["waypoints"])
    if not res["complete"]:
        return {"valid": False, "bestTour": None, "allTours": []}

    passages = res["passages"]
    start_index = passages[0]["index"]
    end_index = passages[-1]["index"]
    if end_index <= start_index:
        return {"valid": False, "bestTour": None, "allTours": []}

    start_time = pts[start_index]["time"]
    end_time = pts[end_index]["time"]
    duration = (end_time - start_time) / 1000.0
    dist_m = sum(haversine_meters(pts[i - 1], pts[i]) for i in range(start_index + 1, end_index + 1))
    avg = (dist_m / duration) * MS_TO_KNOTS if duration > 0 else 0.0
    vmax = compute_vmax_knots(pts, start_index, end_index)

    sectors = []
    for s in course["sectors"]:
        a = passages[s["startWaypointIndex"]] if s["startWaypointIndex"] < len(passages) else None
        b = passages[s["endWaypointIndex"]] if s["endWaypointIndex"] < len(passages) else None
        if a is None or b is None:
            sectors.append(empty_sector(s))
        else:
            sectors.append({
                "sectorId": s["id"], "name": s.get("name"),
                "durationSeconds": round((b["time"] - a["time"]) / 1000.0),
                "startTime": a["time"], "endTime": b["time"],
            })

    best = {
        "startIndex": start_index, "endIndex": end_index,
        "startTime": start_time, "endTime": end_time,
        "durationSeconds": duration, "distanceKm": dist_m / 1000.0,
        "avgSpeedKnots": avg, "vmaxKnots": vmax, "sectors": sectors,
        "points": [{"lat": p["lat"], "lon": p["lon"], "time": p["time"]} for p in pts[start_index:end_index + 1]],
    }
    return {"valid": True, "bestTour": best, "allTours": [best]}


def detect_tour(points, course):
    if course["validationType"] == "waypoints":
        return detect_by_waypoints(points, course)
    best = detect_best_tour(points, {"center": course["centroid"], "bbox": course["boundingBox"]})
    if not best:
        return {"valid": False, "bestTour": None, "allTours": []}
    best["vmaxKnots"] = compute_vmax_knots(best["points"], 0, len(best["points"]) - 1)
    best["sectors"] = build_winding_sectors(course, best["points"])
    return {"valid": True, "bestTour": best, "allTours": [best]}


# ============================================================================
# Générateurs de traces synthétiques
# ============================================================================
def make_circle(center=ILE_AUX_MOINES_CENTROID, radius_deg=0.012, n=240,
                duration_sec=1800, start_ms=1_700_000_000_000, clockwise=False,
                start_angle=0.0, turns=1.0, jitter_deg=0.0):
    cos_lat = math.cos(center["lat"] * DEG_TO_RAD)
    direction = -1 if clockwise else 1
    pts = []
    for k in range(n + 1):
        frac = k / n
        theta = start_angle + direction * TWO_PI * turns * frac
        noise = ((math.sin(k * 12.9898) * 43758.5453) % 1) if jitter_deg else 0.0
        j_lat = (noise - 0.5) * 2 * jitter_deg if jitter_deg else 0.0
        j_lon = (((noise * 7) % 1) - 0.5) * 2 * jitter_deg if jitter_deg else 0.0
        pts.append({
            "lat": center["lat"] + radius_deg * math.sin(theta) + j_lat,
            "lon": center["lon"] + (radius_deg * math.cos(theta)) / cos_lat + j_lon,
            "time": start_ms + round(frac * duration_sec * 1000),
        })
    return pts


def make_car_trip(n=100, start_ms=1_699_990_000_000):
    # Hors zone (sud-est du Golfe) : doit être filtré.
    return [{"lat": 47.0 + k * 0.001, "lon": -2.3 - k * 0.0005, "time": start_ms + k * 1000}
            for k in range(n + 1)]


def make_path(anchors, speed_mps=2.6, sample_s=1.0, start_ms=1_700_000_000_000):
    """Trace échantillonnée le long des segments reliant les points 'anchors'."""
    pts = []
    t_ms = start_ms
    if not anchors:
        return pts
    pts.append({"lat": anchors[0]["lat"], "lon": anchors[0]["lon"], "time": t_ms})
    for a, b in zip(anchors, anchors[1:]):
        dist = haversine_meters(a, b)
        steps = max(1, int(dist / (speed_mps * sample_s)))
        for s in range(1, steps + 1):
            f = s / steps
            t_ms += int(sample_s * 1000)
            pts.append({
                "lat": a["lat"] + (b["lat"] - a["lat"]) * f,
                "lon": a["lon"] + (b["lon"] - a["lon"]) * f,
                "time": t_ms,
            })
    return pts


def make_linear_speed_track(segments, start_ms=1_700_000_000_000, lat=47.60, lon0=-2.86):
    """
    Trace est-ouest avec des segments (vitesse m/s, durée s, pas s).
    Retourne points {lat, lon, time}. Sert aux tests Vmax.
    """
    cos_lat = math.cos(lat * DEG_TO_RAD)
    m_per_deg_lon = 111320.0 * cos_lat
    pts = [{"lat": lat, "lon": lon0, "time": start_ms}]
    t_ms = start_ms
    lon = lon0
    for speed, dur, step in segments:
        elapsed = 0.0
        while elapsed < dur - 1e-9:
            dt = min(step, dur - elapsed)
            lon += (speed * dt) / m_per_deg_lon
            t_ms += int(round(dt * 1000))
            elapsed += dt
            pts.append({"lat": lat, "lon": lon, "time": t_ms})
    return pts


KN = 1.0 / MS_TO_KNOTS  # 1 nœud en m/s


# ============================================================================
# Tests
# ============================================================================
class TestWinding(unittest.TestCase):
    def test_tour_complet(self):
        tour = detect_best_tour(make_circle(turns=1, duration_sec=1800))
        self.assertIsNotNone(tour)
        self.assertTrue(1700 <= tour["durationSeconds"] <= 1900)
        self.assertGreater(tour["avgSpeedKnots"], 2)
        self.assertLess(tour["avgSpeedKnots"], 60)

    def test_sens_horaire(self):
        self.assertIsNotNone(detect_best_tour(make_circle(clockwise=True)))

    def test_demi_tour_invalide(self):
        self.assertIsNone(detect_best_tour(make_circle(turns=0.5)))
        self.assertEqual(detect_all_tours(make_circle(turns=0.5)), [])

    def test_deux_tours(self):
        track = make_circle(turns=2, n=480, duration_sec=3600)
        self.assertEqual(len(detect_all_tours(track)), 2)
        best = detect_best_tour(track)
        self.assertIsNotNone(best)
        self.assertLess(best["durationSeconds"], 2100)  # une seule boucle

    def test_bruit_voiture_et_jitter(self):
        track = make_car_trip() + make_circle(turns=1, duration_sec=1800, jitter_deg=0.0003)
        res = detect_tour(track, IAM_COURSE)
        self.assertTrue(res["valid"])
        self.assertGreater(res["bestTour"]["durationSeconds"], 1500)

    def test_trop_peu_de_points(self):
        self.assertIsNone(detect_best_tour([]))
        self.assertIsNone(detect_best_tour([{"lat": 47.6, "lon": -2.84, "time": 0}]))


class TestVmax(unittest.TestCase):
    def test_pic_isole_elimine(self):
        # 5 nœuds réguliers, 1 Hz, pendant 20 s.
        track = make_linear_speed_track([(5 * KN, 20, 1.0)])
        # Injecte un artefact : un point 0.05 s après l'index 5, déjà ~1 s en avant.
        spike = dict(track[5])
        spike["time"] = track[5]["time"] + 50  # +0.05 s
        spike["lon"] = track[6]["lon"]          # position d'1 s plus loin
        track.insert(6, spike)
        track.sort(key=lambda p: p["time"])
        vmax = compute_vmax_knots(track)
        # La vitesse instantanée du pic dépasse 90 nœuds ; la fenêtre 2 s la gomme.
        self.assertLess(vmax, 8)

    def test_pic_2s_conserve(self):
        # 5 nœuds, puis rafale 20 nœuds tenue 3 s, puis 5 nœuds.
        track = make_linear_speed_track([(5 * KN, 10, 1.0), (20 * KN, 3, 0.5), (5 * KN, 10, 1.0)])
        vmax = compute_vmax_knots(track)
        self.assertGreater(vmax, 18)
        self.assertLess(vmax, 22)

    def test_blip_1s_attenue(self):
        # Un pic de 40 nœuds tenu 1 s est un déplacement réel, mais la fenêtre
        # glissante de 2 s l'atténue nettement sous sa valeur instantanée (40 nds).
        track = make_linear_speed_track([(5 * KN, 8, 1.0), (40 * KN, 1, 1.0), (5 * KN, 8, 1.0)])
        vmax = compute_vmax_knots(track)
        self.assertLess(vmax, 30)   # atténué : bien en dessous des 40 nds instantanés
        self.assertGreater(vmax, 15)  # mais pas totalement effacé (mouvement réel)


class TestWaypoints(unittest.TestCase):
    def _anchors(self, indices):
        return [SQUARE_COURSE["waypoints"][i] for i in indices]

    def test_tous_dans_l_ordre(self):
        track = make_path(self._anchors([0, 1, 2, 3]))
        res = detect_by_waypoints(track, SQUARE_COURSE)
        self.assertTrue(res["valid"])
        self.assertEqual(len(res["bestTour"]["sectors"]), 3)
        for s in res["bestTour"]["sectors"]:
            self.assertGreater(s["durationSeconds"], 0)

    def test_waypoint_manque(self):
        # On ne passe jamais par w3.
        track = make_path(self._anchors([0, 1, 2]))
        res = detect_by_waypoints(track, SQUARE_COURSE)
        self.assertFalse(res["valid"])

    def test_waypoints_desordre(self):
        # w1 visité avant w0 -> ordre invalide.
        track = make_path(self._anchors([1, 0, 2, 3]))
        res = detect_by_waypoints(track, SQUARE_COURSE)
        self.assertFalse(res["valid"])

    def test_demi_tour_tolere(self):
        # Détour : on repasse w0 après l'avoir validé, sans invalider le tour.
        track = make_path(self._anchors([0, 1, 0, 1, 2, 3]))
        res = detect_by_waypoints(track, SQUARE_COURSE)
        self.assertTrue(res["valid"])


class TestSecteurs(unittest.TestCase):
    def test_decoupe_winding_correcte(self):
        track = make_circle(turns=1, duration_sec=1800, n=720)
        res = detect_tour(track, IAM_COURSE)
        self.assertTrue(res["valid"])
        sectors = res["bestTour"]["sectors"]
        self.assertEqual(len(sectors), 4)
        for s in sectors:
            self.assertIsNotNone(s["durationSeconds"])
            self.assertGreater(s["durationSeconds"], 0)
        # La somme des secteurs couvre la durée totale du tour.
        total = res["bestTour"]["durationSeconds"]
        self.assertAlmostEqual(sum(s["durationSeconds"] for s in sectors), round(total), delta=3)

    def test_decoupe_waypoints_correcte(self):
        track = make_path([SQUARE_COURSE["waypoints"][i] for i in (0, 1, 2, 3)])
        res = detect_by_waypoints(track, SQUARE_COURSE)
        sectors = res["bestTour"]["sectors"]
        self.assertEqual(len(sectors), 3)
        self.assertAlmostEqual(
            sum(s["durationSeconds"] for s in sectors),
            round(res["bestTour"]["durationSeconds"]),
            delta=3,
        )

    def test_secteur_manquant_si_tour_incomplet(self):
        # Tour incomplet (waypoint manquant) -> pas de découpe en secteurs.
        track = make_path([SQUARE_COURSE["waypoints"][i] for i in (0, 1, 2)])
        res = detect_by_waypoints(track, SQUARE_COURSE)
        self.assertFalse(res["valid"])
        self.assertIsNone(res["bestTour"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
