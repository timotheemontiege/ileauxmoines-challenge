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


# ── Géométrie polygonale (miroir geo.js) — « tour par l'extérieur » ──────────
METERS_PER_DEG = DEG_TO_RAD * EARTH_RADIUS_M  # ≈ 111195 m
OUTER_LOOP_INCURSION_DEPTH_METERS = 250  # profondeur d'incursion tolérée (permissif)


def point_in_polygon(point, polygon):
    """Ray casting ; polygon = [{lat, lon}] non fermé. True si STRICTEMENT dedans."""
    x, y = point["lon"], point["lat"]
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]["lon"], polygon[i]["lat"]
        xj, yj = polygon[j]["lon"], polygon[j]["lat"]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polygon_is_clockwise(polygon):
    twice_area = 0.0
    n = len(polygon)
    for i in range(n):
        a = polygon[i]
        b = polygon[(i + 1) % n]
        twice_area += a["lon"] * b["lat"] - b["lon"] * a["lat"]
    return twice_area < 0


def point_to_segment_meters(p, a, b):
    cos0 = math.cos(p["lat"] * DEG_TO_RAD)
    ax = (a["lon"] - p["lon"]) * cos0 * METERS_PER_DEG
    ay = (a["lat"] - p["lat"]) * METERS_PER_DEG
    bx = (b["lon"] - p["lon"]) * cos0 * METERS_PER_DEG
    by = (b["lat"] - p["lat"]) * METERS_PER_DEG
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    t = (-(ax * dx + ay * dy) / len2) if len2 > 0 else 0.0
    t = max(0.0, min(1.0, t))
    return math.hypot(ax + t * dx, ay + t * dy)


def distance_to_polygon_boundary_meters(point, polygon):
    best = float("inf")
    j = len(polygon) - 1
    for i in range(len(polygon)):
        d = point_to_segment_meters(point, polygon[j], polygon[i])
        if d < best:
            best = d
        j = i
    return best


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
        # speedRaw conservé pour permettre la Vmax Doppler (retiré ensuite).
        "points": [{"lat": p["lat"], "lon": p["lon"], "time": p["time"], "speedRaw": p.get("speedRaw")} for p in pts],
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
# Vmax — cascade Doppler -> position -> nettoyage (miroir tourDetector.js)
# ============================================================================
DOPPLER_MIN_COVERAGE = 0.8   # part de points avec vitesse mesurée -> NIVEAU 1
ACCEL_MAX_MS2 = 6.0          # accélération max plausible (NIVEAU 2)
HAMPEL_WINDOW = 7            # fenêtre du filtre de Hampel (NIVEAU 3)
HAMPEL_NSIGMA = 3
SIGNAL_GAP_SECONDS = 5       # dt au-delà = coupure de signal (NIVEAU 3)
GAP_INVALIDATE_POINTS = 2
VMAX_HARD_CEILING_KNOTS = 50  # garde-fou physique absolu (pas un cap loisir)
VMAX_SANITY_MARGIN_KNOTS = 15
MS_PER_KNOT = 1.0 / MS_TO_KNOTS
NAN = float("nan")


def _median(values):
    s = sorted(values)
    n = len(s)
    if n == 0:
        return NAN
    m = n // 2
    return s[m] if n % 2 else (s[m - 1] + s[m]) / 2.0


def build_speed_series(points, accel_max=ACCEL_MAX_MS2, min_coverage=DOPPLER_MIN_COVERAGE):
    """NIVEAUX 1 & 2 : série de vitesses (m/s), une par point (NaN = invalide)."""
    n = len(points)
    series = [NAN] * n
    measured = sum(1 for p in points
                   if p.get("speedRaw") is not None and math.isfinite(p["speedRaw"]))
    # NIVEAU 1 — Doppler.
    if n > 0 and measured / n >= min_coverage:
        for i, p in enumerate(points):
            sr = p.get("speedRaw")
            if sr is not None and math.isfinite(sr):
                series[i] = sr
        return series, "doppler"
    # NIVEAU 2 — position + filtre d'accélération.
    prev_seg_v = NAN
    for i in range(1, n):
        dt = (points[i]["time"] - points[i - 1]["time"]) / 1000.0
        if not (dt > 0):
            prev_seg_v = NAN
            continue
        v = haversine_meters(points[i - 1], points[i]) / dt
        if math.isfinite(prev_seg_v) and abs(v - prev_seg_v) / dt > accel_max:
            series[i] = NAN
        else:
            series[i] = v
        prev_seg_v = v
    if n > 1 and math.isfinite(series[1]):
        series[0] = series[1]
    return series, "position"


def hampel_filter(series, window_size=HAMPEL_WINDOW, n_sigma=HAMPEL_NSIGMA):
    """NIVEAU 3 — médiane glissante robuste ; comble aussi les trous (NaN)."""
    n = len(series)
    out = list(series)
    k = max(1, window_size // 2)
    for i in range(n):
        win = [series[j] for j in range(max(0, i - k), min(n - 1, i + k) + 1)
               if math.isfinite(series[j])]
        if not win:
            continue
        med = _median(win)
        if not math.isfinite(series[i]):
            out[i] = med
            continue
        mad = _median([abs(v - med) for v in win])
        sigma = 1.4826 * mad
        if sigma > 0 and abs(series[i] - med) > n_sigma * sigma:
            out[i] = med
    return out


def reject_signal_gaps(points, series, gap_seconds=SIGNAL_GAP_SECONDS,
                       invalidate=GAP_INVALIDATE_POINTS):
    """NIVEAU 3 — invalide les vitesses des points suivant une coupure de signal."""
    for i in range(1, len(points)):
        dt = (points[i]["time"] - points[i - 1]["time"]) / 1000.0
        if dt > gap_seconds:
            for k in range(invalidate):
                if i + k < len(series):
                    series[i + k] = NAN
    return series


def compute_vmax_detailed(points, start_index=0, end_index=None):
    if end_index is None:
        end_index = len(points) - 1
    sl = points[start_index:end_index + 1]
    if len(sl) < 2:
        return {"vmaxKnots": 0.0, "source": "position", "cleanCount": 0}
    series, source = build_speed_series(sl)
    cleaned = hampel_filter(series)
    reject_signal_gaps(sl, cleaned)
    ceil = VMAX_HARD_CEILING_KNOTS * MS_PER_KNOT
    vmax = 0.0
    clean_count = 0
    for v in cleaned:
        if math.isfinite(v) and v <= ceil:
            clean_count += 1
            if v > vmax:
                vmax = v
    return {"vmaxKnots": vmax * MS_TO_KNOTS, "source": source, "cleanCount": clean_count}


def compute_vmax_knots(points, start_index=0, end_index=None):
    return compute_vmax_detailed(points, start_index, end_index)["vmaxKnots"]


def is_vmax_suspect(vmax_knots, avg_speed_knots, margin=VMAX_SANITY_MARGIN_KNOTS):
    return (math.isfinite(vmax_knots) and math.isfinite(avg_speed_knots)
            and vmax_knots > avg_speed_knots + margin)


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
    vm = compute_vmax_detailed(pts, start_index, end_index)  # pts portent speedRaw

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
        "avgSpeedKnots": avg, "vmaxKnots": vm["vmaxKnots"],
        "vmaxSource": vm["source"], "vmaxSuspect": is_vmax_suspect(vm["vmaxKnots"], avg),
        "sectors": sectors,
        "points": [{"lat": p["lat"], "lon": p["lon"], "time": p["time"]} for p in pts[start_index:end_index + 1]],
    }
    return {"valid": True, "bestTour": best, "allTours": [best]}


# ============================================================================
# Détection « tour par l'extérieur » (miroir tourDetector.js)
# ============================================================================
def build_balise_visits(pts, balises, polygon):
    raw = []
    cur = None
    for i, p in enumerate(pts):
        b_idx, b_d = -1, float("inf")
        for b, bal in enumerate(balises):
            d = haversine_meters(p, bal)
            if d <= bal["radiusMeters"] and d < b_d:
                b_d, b_idx = d, b
        if b_idx == -1:
            if cur:
                raw.append(cur)
                cur = None
            continue
        if cur and cur["balise"] == b_idx:
            if b_d < cur["bestD"]:
                cur["bestD"], cur["bestI"] = b_d, i
        else:
            if cur:
                raw.append(cur)
            cur = {"balise": b_idx, "bestI": i, "bestD": b_d}
    if cur:
        raw.append(cur)

    # Fusionne les visites consécutives de même balise (dip GPS toléré).
    merged = []
    for v in raw:
        if merged and merged[-1]["balise"] == v["balise"]:
            if v["bestD"] < merged[-1]["bestD"]:
                merged[-1]["bestD"], merged[-1]["bestI"] = v["bestD"], v["bestI"]
        else:
            merged.append(dict(v))

    out = []
    for v in merged:
        p = pts[v["bestI"]]
        out.append({
            "balise": v["balise"], "index": v["bestI"], "time": p["time"],
            "distance": v["bestD"], "outside": not point_in_polygon(p, polygon),
        })
    return out


def closed_loop_direction(seq, n, clockwise_polygon):
    """Tour FERMÉ : n+1 balises, pas constant +1/-1 (mod n), retour au départ."""
    if len(seq) != n + 1:
        return None
    if seq[0] != seq[n]:
        return None  # doit revenir à la balise de départ
    if len(set(seq[:n])) != n:
        return None  # couvre les n balises
    step = ((seq[1] - seq[0]) % n + n) % n
    if step != 1 and step != n - 1:
        return None
    for k in range(1, n + 1):
        if ((seq[k] - seq[k - 1]) % n + n) % n != step:
            return None
    if step == 1:
        return "cw" if clockwise_polygon else "ccw"
    return "ccw" if clockwise_polygon else "cw"


def edge_between(a, b, n):
    if (a + 1) % n == b:
        return a
    if (b + 1) % n == a:
        return b
    return -1


def has_deep_incursion(pts, window, polygon, balises, depth):
    for k in range(len(window) - 1):
        for i in range(window[k]["index"] + 1, window[k + 1]["index"]):
            p = pts[i]
            if not point_in_polygon(p, polygon):
                continue
            if any(haversine_meters(p, b) <= b["radiusMeters"] for b in balises):
                continue
            if distance_to_polygon_boundary_meters(p, polygon) > depth:
                return True
    return False


def build_outer_loop_sectors(course, window, n):
    edge_info = {}
    for k in range(len(window) - 1):
        e = edge_between(window[k]["balise"], window[k + 1]["balise"], n)
        if e < 0:
            continue
        t0 = min(window[k]["time"], window[k + 1]["time"])
        t1 = max(window[k]["time"], window[k + 1]["time"])
        edge_info[e] = {"dur": t1 - t0, "t0": t0, "t1": t1}
    out = []
    for s in course["sectors"]:
        count = ((s["endWaypointIndex"] - s["startWaypointIndex"]) % n + n) % n
        edges = [(s["startWaypointIndex"] + e) % n for e in range(count)]
        if count == 0 or not all(e in edge_info for e in edges):
            out.append(empty_sector(s))
            continue
        total = sum(edge_info[e]["dur"] for e in edges)
        lo = min(edge_info[e]["t0"] for e in edges)
        hi = max(edge_info[e]["t1"] for e in edges)
        out.append({
            "sectorId": s["id"], "name": s.get("name"),
            "durationSeconds": round(total / 1000.0), "startTime": lo, "endTime": hi,
        })
    return out


def detect_by_outer_loop(points, course, opts=None):
    o = dict(DEFAULT_OPTS)
    if opts:
        o.update(opts)
    pts = [p for p in filter_to_zone(points, o["bbox"]) if p.get("time") is not None]
    pts.sort(key=lambda p: p["time"])
    if len(pts) < 2:
        return {"valid": False, "bestTour": None, "allTours": []}

    balises = course["waypoints"]
    n = len(balises)
    if n < 3:
        return {"valid": False, "bestTour": None, "allTours": []}

    polygon = [{"lat": b["lat"], "lon": b["lon"]} for b in balises]
    clockwise = polygon_is_clockwise(polygon)
    depth = o.get("incursionDepthMeters", OUTER_LOOP_INCURSION_DEPTH_METERS)

    visits = build_balise_visits(pts, balises, polygon)
    if len(visits) < n + 1:
        return {"valid": False, "bestTour": None, "allTours": []}

    best = None
    # Fenêtre glissante de n+1 visites = un TOUR FERMÉ (retour à la balise de départ).
    for s in range(0, len(visits) - n):
        window = visits[s:s + n + 1]
        direction = closed_loop_direction([v["balise"] for v in window], n, clockwise)  # (B)
        if not direction:
            continue
        if not all(v["outside"] for v in window):  # (C)
            continue
        if has_deep_incursion(pts, window, polygon, balises, depth):  # (D)
            continue
        start_index = window[0]["index"]
        end_index = window[n]["index"]  # retour à la balise de départ
        if end_index <= start_index:
            continue
        duration = (pts[end_index]["time"] - pts[start_index]["time"]) / 1000.0
        dist_m = sum(haversine_meters(pts[i - 1], pts[i]) for i in range(start_index + 1, end_index + 1))
        avg = (dist_m / duration) * MS_TO_KNOTS if duration > 0 else 0.0
        metrics = {"durationSeconds": duration, "distanceKm": dist_m / 1000.0, "avgSpeedKnots": avg}
        if not is_valid_tour(metrics, o):  # (A) implicite : n visites cycliques trouvées
            continue
        if best is None or metrics["durationSeconds"] < best["durationSeconds"]:
            best = dict(metrics, startIndex=start_index, endIndex=end_index,
                        window=window, direction=direction)

    if not best:
        return {"valid": False, "bestTour": None, "allTours": []}

    vm = compute_vmax_detailed(pts, best["startIndex"], best["endIndex"])
    best_tour = {
        "startIndex": best["startIndex"], "endIndex": best["endIndex"],
        "startTime": pts[best["startIndex"]]["time"], "endTime": pts[best["endIndex"]]["time"],
        "durationSeconds": best["durationSeconds"], "distanceKm": best["distanceKm"],
        "avgSpeedKnots": best["avgSpeedKnots"], "vmaxKnots": vm["vmaxKnots"],
        "vmaxSource": vm["source"], "vmaxSuspect": is_vmax_suspect(vm["vmaxKnots"], best["avgSpeedKnots"]),
        "direction": best["direction"],
        "sectors": build_outer_loop_sectors(course, best["window"], n),
        "points": [{"lat": p["lat"], "lon": p["lon"], "time": p["time"]}
                   for p in pts[best["startIndex"]:best["endIndex"] + 1]],
    }
    return {"valid": True, "bestTour": best_tour, "allTours": [best_tour]}


def detect_tour(points, course):
    if course["validationType"] == "outer-loop":
        return detect_by_outer_loop(points, course)
    if course["validationType"] == "waypoints":
        return detect_by_waypoints(points, course)
    best = detect_best_tour(points, {"center": course["centroid"], "bbox": course["boundingBox"]})
    if not best:
        return {"valid": False, "bestTour": None, "allTours": []}
    vm = compute_vmax_detailed(best["points"], 0, len(best["points"]) - 1)
    best["vmaxKnots"] = vm["vmaxKnots"]
    best["vmaxSource"] = vm["source"]
    best["vmaxSuspect"] = is_vmax_suspect(vm["vmaxKnots"], best["avgSpeedKnots"])
    best["sectors"] = build_winding_sectors(course, best["points"])
    for p in best["points"]:
        p.pop("speedRaw", None)  # allège la polyligne renvoyée
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


def with_doppler(track, speed_mps):
    """Attache une vitesse MESURÉE (Doppler) à chaque point d'une trace."""
    return [dict(p, speedRaw=speed_mps) for p in track]


KN = 1.0 / MS_TO_KNOTS  # 1 nœud en m/s


def make_hex_course():
    """Parcours hexagonal synthétique : 6 balises = sommets de P (sens horaire)."""
    center = {"lat": 47.6, "lon": -2.85}
    R = 0.02  # ~2,2 km de rayon
    cos_lat = math.cos(center["lat"] * DEG_TO_RAD)
    verts = []
    for k in range(6):
        ang = (90 - k * 60) * DEG_TO_RAD  # sommets listés en sens horaire
        verts.append({
            "lat": center["lat"] + R * math.sin(ang),
            "lon": center["lon"] + (R * math.cos(ang)) / cos_lat,
        })
    return {
        "center": center, "cosLat": cos_lat,
        "validationType": "outer-loop", "centroid": center,
        "boundingBox": {"minLat": 47.4, "maxLat": 47.8, "minLon": -3.1, "maxLon": -2.6},
        "waypoints": [
            {"id": f"b{i + 1}", "name": f"b{i + 1}", "lat": v["lat"], "lon": v["lon"], "radiusMeters": 200}
            for i, v in enumerate(verts)
        ],
        "sectors": [
            {"id": "s1", "name": "Nord", "startWaypointIndex": 0, "endWaypointIndex": 1},
            {"id": "s2", "name": "Est", "startWaypointIndex": 1, "endWaypointIndex": 3},
            {"id": "s3", "name": "Sud", "startWaypointIndex": 3, "endWaypointIndex": 5},
            {"id": "s4", "name": "Ouest", "startWaypointIndex": 5, "endWaypointIndex": 0},
        ],
    }


def push_out(center, cos_lat, v, offset_deg):
    """Pousse un sommet radialement vers l'EXTÉRIEUR depuis le centre."""
    dy = v["lat"] - center["lat"]
    dx = (v["lon"] - center["lon"]) * cos_lat
    length = math.hypot(dx, dy) or 1.0
    return {
        "lat": v["lat"] + (dy / length) * offset_deg,
        "lon": v["lon"] + ((dx / length) * offset_deg) / cos_lat,
    }


def sample_path(anchors, speed_mps=3.0, sample_s=3.0, start_ms=1_700_000_000_000):
    pts = [{"lat": anchors[0]["lat"], "lon": anchors[0]["lon"], "time": start_ms}]
    t = start_ms
    for s in range(len(anchors) - 1):
        a, b = anchors[s], anchors[s + 1]
        steps = max(1, round(haversine_meters(a, b) / (speed_mps * sample_s)))
        for i in range(1, steps + 1):
            f = i / steps
            t += int(sample_s * 1000)
            pts.append({"lat": a["lat"] + (b["lat"] - a["lat"]) * f,
                        "lon": a["lon"] + (b["lon"] - a["lon"]) * f, "time": t})
    return pts


def make_outer_track(course, order, cut_through_leg_at=-1):
    """Longe les balises de 'order' par l'extérieur (approche ~110 m DEHORS de P)."""
    center, cos_lat, wps = course["center"], course["cosLat"], course["waypoints"]
    stops = [push_out(center, cos_lat, wps[i], 0.001) for i in order]
    anchors = []
    for s in range(len(stops)):
        anchors.append(stops[s])
        if s == cut_through_leg_at and s + 1 < len(stops):
            anchors.append(center)  # coupe par le centre (incursion franche dans P)
    return sample_path(anchors)


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
    # --- NIVEAU 1 : Doppler ---------------------------------------------------
    def test_doppler_prioritaire(self):
        # Positions ~6 nds, mais Doppler mesuré = 12 nds sur TOUS les points.
        # Vmax doit valoir le champ mesuré (12), PAS le calcul position (6).
        track = with_doppler(make_linear_speed_track([(6 * KN, 30, 1.0)]), 12 * KN)
        detailed = compute_vmax_detailed(track)
        self.assertEqual(detailed["source"], "doppler")
        self.assertAlmostEqual(detailed["vmaxKnots"], 12.0, delta=0.2)

    def test_sans_vitesse_niveau2(self):
        # Trace sans champ vitesse -> bascule en NIVEAU 2 (calcul par position).
        track = make_linear_speed_track([(10 * KN, 20, 1.0)])
        detailed = compute_vmax_detailed(track)
        self.assertEqual(detailed["source"], "position")
        self.assertAlmostEqual(detailed["vmaxKnots"], 10.0, delta=2.0)

    # --- NIVEAU 2 : filtre d'accélération ------------------------------------
    def test_saut_gps_isole_accel(self):
        # Saut GPS isolé : 1 point décalé de ~20 m en 1 s (~38 nds apparents)
        # au milieu d'une trace stable à 10 nds. Le filtre d'accélération
        # rejette l'aller ET le retour -> Vmax reste ~10 nds.
        cos_lat = math.cos(47.6 * DEG_TO_RAD)
        m_per_deg_lon = 111320.0 * cos_lat
        track = make_linear_speed_track([(10 * KN, 30, 1.0)])
        i_mid = len(track) // 2
        track[i_mid] = {**track[i_mid], "lon": track[i_mid]["lon"] + 20.0 / m_per_deg_lon}
        vmax = compute_vmax_knots(track)
        self.assertGreater(vmax, 8)
        self.assertLess(vmax, 14)  # saut éliminé (pas gonflé à ~38 nds)

    def test_pic_isole_elimine(self):
        # Pic instantané > 90 nds (point téléporté ~1 s en avant) : rejeté.
        track = make_linear_speed_track([(5 * KN, 20, 1.0)])
        spike = dict(track[5])
        spike["time"] = track[5]["time"] + 50  # +0.05 s
        spike["lon"] = track[6]["lon"]          # position d'1 s plus loin
        track.insert(6, spike)
        track.sort(key=lambda p: p["time"])
        self.assertLess(compute_vmax_knots(track), 8)

    def test_pic_2s_conserve(self):
        # Rafale RÉELLE de 20 nds tenue 3 s : doit être conservée (≠ artefact).
        track = make_linear_speed_track([(5 * KN, 10, 1.0), (20 * KN, 3, 0.5), (5 * KN, 10, 1.0)])
        vmax = compute_vmax_knots(track)
        self.assertGreater(vmax, 18)
        self.assertLess(vmax, 22)

    def test_saut_300m_rejete(self):
        # Téléportation de ~300 m (~583 nds) : rejetée (accel + garde-fou).
        track = make_linear_speed_track([(5 * KN, 20, 1.0)])
        teleport = dict(track[10])
        teleport["lon"] = track[10]["lon"] + 0.004  # ~300 m de côté
        track.insert(11, teleport)
        track.sort(key=lambda p: p["time"])
        self.assertLess(compute_vmax_knots(track), 8)

    # --- NIVEAU 3 : Hampel + coupures de signal ------------------------------
    def test_derive_multipoints_hampel(self):
        # Dérive : 4 points consécutifs décalés de ~15 m. Le filtre
        # d'accélération + Hampel empêchent toute Vmax gonflée.
        track = make_linear_speed_track([(10 * KN, 40, 1.0)])
        i0 = len(track) // 2
        for d in range(4):
            track[i0 + d] = {**track[i0 + d], "lat": track[i0 + d]["lat"] + 15.0 / 111320.0}
        vmax = compute_vmax_knots(track)
        self.assertGreater(vmax, 8)
        self.assertLess(vmax, 16)

    def test_coupure_signal(self):
        # Coupure de 8 s puis point décalé de ~200 m (balise ressortie de l'eau).
        # Le saut sur dt=9 s a une accélération faible (passe le filtre accel),
        # mais rejectSignalGaps invalide la vitesse parasite.
        cos_lat = math.cos(47.6 * DEG_TO_RAD)
        m_per_deg_lon = 111320.0 * cos_lat
        track = make_linear_speed_track([(10 * KN, 30, 1.0)])
        i = len(track) // 2
        for k in range(i, len(track)):
            track[k] = dict(track[k], time=track[k]["time"] + 8000)  # trou de 8 s
        track[i] = dict(track[i], lon=track[i]["lon"] + 200.0 / m_per_deg_lon)
        vmax = compute_vmax_knots(track)
        self.assertGreater(vmax, 8)
        self.assertLess(vmax, 14)  # parasite (~44 nds) invalidé

    # --- Garde-fou & cohérence -----------------------------------------------
    def test_garde_fou_physique(self):
        # Plus de plafond "loisir" à 40 nds : 35 nds soutenus sont CONSERVÉS...
        fast = make_linear_speed_track([(35 * KN, 20, 1.0)])
        self.assertGreater(compute_vmax_knots(fast), 30)
        # ...mais le garde-fou physique absolu (50 nds) rejette l'impossible (60 nds).
        impossible = make_linear_speed_track([(60 * KN, 20, 1.0)])
        self.assertEqual(compute_vmax_knots(impossible), 0.0)

    def test_blip_1s_supprime(self):
        # Pic isolé de 40 nds tenu 1 s (5->40->5 ≈ 36 m/s², impossible) :
        # le filtre d'accélération l'élimine (avant : seulement "atténué").
        track = make_linear_speed_track([(5 * KN, 8, 1.0), (40 * KN, 1, 1.0), (5 * KN, 8, 1.0)])
        self.assertLess(compute_vmax_knots(track), 10)

    def test_vmax_suspecte_flag(self):
        # Sanity check : Vmax très au-dessus de la vmoy -> drapeau suspect.
        self.assertTrue(is_vmax_suspect(40.0, 10.0))
        self.assertFalse(is_vmax_suspect(22.0, 14.0))


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


class TestOuterLoop(unittest.TestCase):
    """Tour par l'extérieur (Tour du Golfe) — detect_by_outer_loop."""

    def setUp(self):
        self.course = make_hex_course()

    def test_tour_complet_1_6_cw(self):
        res = detect_by_outer_loop(make_outer_track(self.course, [0, 1, 2, 3, 4, 5, 0]), self.course)
        self.assertTrue(res["valid"])
        self.assertEqual(res["bestTour"]["direction"], "cw")
        self.assertGreater(res["bestTour"]["durationSeconds"], 180)
        # Boucle fermée : les 4 façades sont TOUTES mesurées.
        self.assertTrue(all(s["durationSeconds"] is not None for s in res["bestTour"]["sectors"]))

    def test_tour_complet_6_1_ccw(self):
        res = detect_by_outer_loop(make_outer_track(self.course, [5, 4, 3, 2, 1, 0, 5]), self.course)
        self.assertTrue(res["valid"])
        self.assertEqual(res["bestTour"]["direction"], "ccw")
        self.assertTrue(all(s["durationSeconds"] is not None for s in res["bestTour"]["sectors"]))

    def test_depart_milieu_cyclique(self):
        res = detect_by_outer_loop(make_outer_track(self.course, [2, 3, 4, 5, 0, 1, 2]), self.course)
        self.assertTrue(res["valid"])
        self.assertEqual(res["bestTour"]["direction"], "cw")

    def test_coupe_a_travers_rejete(self):
        res = detect_by_outer_loop(
            make_outer_track(self.course, [0, 1, 2, 3, 4, 5, 0], cut_through_leg_at=1), self.course)
        self.assertFalse(res["valid"])

    def test_balise_manquee_rejete(self):
        res = detect_by_outer_loop(make_outer_track(self.course, [0, 1, 2, 3, 4]), self.course)
        self.assertFalse(res["valid"])

    def test_desordre_rejete(self):
        res = detect_by_outer_loop(make_outer_track(self.course, [0, 2, 1, 3, 4, 5, 0]), self.course)
        self.assertFalse(res["valid"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
