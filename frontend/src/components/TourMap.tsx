import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

/** Centroïde de l'Île-aux-Moines (point de référence du winding number). */
export const ISLAND_CENTER: [number, number] = [47.5975, -2.8433];

export interface MapTrace {
  id: string;
  positions: [number, number][];
  color: string;
  label?: string;
}

interface Props {
  traces: MapTrace[];
  height?: number | string;
  zoom?: number;
  fit?: boolean;
}

/** Ajuste la vue pour englober toutes les traces affichées. */
function FitBounds({ traces, fit }: { traces: MapTrace[]; fit: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!fit) return;
    const all = traces.flatMap((t) => t.positions);
    if (all.length === 0) return;
    const bounds = L.latLngBounds(all as L.LatLngTuple[]);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
  }, [traces, fit, map]);
  return null;
}

export default function TourMap({
  traces,
  height = 420,
  zoom = 13,
  fit = true,
}: Props) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-800"
      style={{ height }}
    >
      <MapContainer
        center={ISLAND_CENTER}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CircleMarker
          center={ISLAND_CENTER}
          radius={5}
          pathOptions={{ color: '#f8fafc', fillColor: '#f8fafc', fillOpacity: 1 }}
        >
          <Tooltip>Île-aux-Moines</Tooltip>
        </CircleMarker>

        {traces.map((trace) => (
          <Polyline
            key={trace.id}
            positions={trace.positions}
            pathOptions={{ color: trace.color, weight: 3, opacity: 0.85 }}
          >
            {trace.label && <Tooltip sticky>{trace.label}</Tooltip>}
          </Polyline>
        ))}

        <FitBounds traces={traces} fit={fit} />
      </MapContainer>
    </div>
  );
}
