export type Category = 'wingfoil' | 'windsurf' | 'kitesurf' | 'voile_legere' | 'autre';

export type Period = 'all' | 'year' | '30d';

export interface TracePoint {
  lat: number;
  lon: number;
  t?: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  performance_id: string;
  session_id: string;
  duration_seconds: number;
  distance_km: number;
  avg_speed_knots: number;
  category: Category;
  wind_force_beaufort: number | null;
  comment: string | null;
  validated_at: string;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  category: string;
  period: string;
}

export interface TraceRecord {
  performance_id: string;
  user_id: string;
  username: string;
  category: Category;
  duration_seconds: number;
  gpx_tour_points: TracePoint[];
}

export interface Performance {
  id: string;
  session_id: string;
  duration_seconds: number;
  distance_km: number;
  avg_speed_knots: number;
  category: Category;
  wind_force_beaufort: number | null;
  comment: string | null;
  start_time: string | null;
  end_time: string | null;
  validated_at: string;
}

export interface SessionRow {
  id: string;
  status: 'pending' | 'valid' | 'invalid';
  uploaded_at: string;
  raw_points_count: number;
}

export interface ProfileResponse {
  profile: {
    id: string;
    username: string;
    avatar_url: string | null;
    created_at: string;
  };
  sessions: SessionRow[];
  performances: Performance[];
  bestByCategory: Record<string, Performance>;
  progression: {
    date: string;
    category: Category;
    duration_seconds: number;
    avg_speed_knots: number;
  }[];
}

export interface UploadResponse {
  session: SessionRow;
  performance: Performance | null;
  warnings: string[];
  message: string;
  analysis: {
    tourDetected: boolean;
    toursDetected: number;
    totalPoints: number;
    pointsInZone: number;
    sampleIntervalSeconds: number | null;
    lowFrequencyWarning: boolean;
  };
  best?: {
    durationSeconds: number;
    durationLabel: string;
    distanceKm: number;
    avgSpeedKnots: number;
    startTime: string;
    endTime: string;
    points: { lat: number; lon: number }[];
  };
}
