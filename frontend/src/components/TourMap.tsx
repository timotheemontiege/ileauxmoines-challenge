import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Circle,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

/** Centroïde de l'Île-aux-Moines (centre par défaut). */
export const ISLAND_CENTER: [number, number] = [47.5975, -2.8433];

export interface MapTrace {
  id: string;
  positions: [number, number][];
  color: string;
  label?: string;
}

export interface MapWaypoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusMeters: number;
}

interface Props {
  traces: MapTrace[];
  height?: number | string;
  zoom?: number;
  fit?: boolean;
  center?: [number, number];
  centerLabel?: string;
  waypoints?: MapWaypoint[];
  showWaypointRadius?: boolean;
}

/** Ajuste la vue pour englober traces + waypoints affichés. */
function FitBounds({
  traces,
  waypoints,
  fit,
}: {
  traces: MapTrace[];
  waypoints: MapWaypoint[];
  fit: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!fit) return;
    const all: [number, number][] = [
      ...traces.flatMap((t) => t.positions),
      ...waypoints.map((w) => [w.lat, w.lon] as [number, number]),
    ];
    if (all.length === 0) return;
    const bounds = L.latLngBounds(all as L.LatLngTuple[]);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28] });
  }, [traces, waypoints, fit, map]);
  return null;
}

export default function TourMap({
  traces,
  height = 420,
  zoom = 13,
  fit = true,
  center = ISLAND_CENTER,
  centerLabel = 'Centre du parcours',
  waypoints = [],
  showWaypointRadius = false,
}: Props) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-800"
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CircleMarker
          center={center}
          radius={5}
          pathOptions={{ color: '#f8fafc', fillColor: '#f8fafc', fillOpacity: 1 }}
        >
          <Tooltip>{centerLabel}</Tooltip>
        </CircleMarker>

        {/* Waypoints (bornes de secteur / points de passage) + rayon de validation */}
        {waypoints.map((w, i) => (
          <CircleMarker
            key={w.id}
            center={[w.lat, w.lon]}
            radius={6}
            pathOptions={{ color: '#38bdf8', fillColor: '#0ea5e9', fillOpacity: 0.9 }}
          >
            <Tooltip>
              {i + 1}. {w.name}
            </Tooltip>
          </CircleMarker>
        ))}
        {showWaypointRadius &&
          waypoints.map((w) => (
            <Circle
              key={`r-${w.id}`}
              center={[w.lat, w.lon]}
              radius={w.radiusMeters}
              pathOptions={{
                color: '#38bdf8',
                weight: 1,
                fillColor: '#38bdf8',
                fillOpacity: 0.08,
              }}
            />
          ))}

        {traces.map((trace) => (
          <Polyline
            key={trace.id}
            positions={trace.positions}
            pathOptions={{ color: trace.color, weight: 3, opacity: 0.85 }}
          >
            {trace.label && <Tooltip sticky>{trace.label}</Tooltip>}
          </Polyline>
        ))}

        <FitBounds traces={traces} waypoints={waypoints} fit={fit} />
      </MapContainer>
    </div>
  );
}
