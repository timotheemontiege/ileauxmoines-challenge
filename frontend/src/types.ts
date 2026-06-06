export type Category = 'wingfoil' | 'windsurf' | 'kitesurf' | 'voile_legere' | 'autre';

export type Period = 'all' | 'year' | '30d';

export interface TracePoint {
  lat: number;
  lon: number;
  t?: string;
}

/** Un secteur mesuré sur un tour (stocké dans performances.sector_times). */
export interface SectorTime {
  sectorId: string;
  name: string;
  durationSeconds: number;
  startTime: string | null;
  endTime: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  performance_id: string;
  session_id: string;
  course_id: string;
  duration_seconds: number;
  distance_km: number;
  avg_speed_knots: number;
  vmax_knots: number | null;
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
  courseId: string;
  category: string;
  period: string;
}

export interface SectorLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  sector_perf_id: string;
  performance_id: string;
  course_id: string;
  sector_id: string;
  sector_name: string;
  duration_seconds: number;
  category: Category;
  achieved_at: string;
}

export interface SectorLeaderboardResponse {
  entries: SectorLeaderboardEntry[];
  courseId: string;
  sectorId: string;
  sectorName: string;
  category: string;
  period: string;
}

export interface TraceRecord {
  performance_id: string;
  user_id: string;
  username: string;
  course_id: string;
  category: Category;
  duration_seconds: number;
  vmax_knots: number | null;
  gpx_tour_points: TracePoint[];
}

export interface Performance {
  id: string;
  session_id: string;
  course_id: string;
  duration_seconds: number;
  distance_km: number;
  avg_speed_knots: number;
  vmax_knots: number | null;
  sector_times: SectorTime[] | null;
  category: Category;
  wind_force_beaufort: number | null;
  comment: string | null;
  start_time: string | null;
  end_time: string | null;
  validated_at: string;
}

/** Détail complet d'une trace (page /trace/:id). */
export interface PerformanceDetail extends Performance {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  gpx_tour_points: TracePoint[];
}

export interface PerformanceDetailResponse {
  performance: PerformanceDetail;
  courseName: string;
}

export interface SessionRow {
  id: string;
  status: 'pending' | 'valid' | 'invalid';
  uploaded_at: string;
  raw_points_count: number;
  course_id: string;
}

/** Record d'un secteur pour un rider (depuis sector_performances). */
export interface SectorRecord {
  id: string;
  performance_id: string;
  course_id: string;
  sector_id: string;
  sector_name: string;
  duration_seconds: number;
  category: Category;
  achieved_at: string;
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
  // records[courseId][category] = meilleure performance
  bestByCourse: Record<string, Record<string, Performance>>;
  // sectorRecords[courseId][sectorId] = meilleur temps de secteur
  sectorRecords: Record<string, Record<string, SectorRecord>>;
  progression: {
    date: string;
    course_id: string;
    category: Category;
    duration_seconds: number;
    avg_speed_knots: number;
    vmax_knots: number | null;
  }[];
}

export interface UploadResponse {
  session: SessionRow;
  performance: Performance | null;
  warnings: string[];
  message: string;
  courseId: string;
  courseName: string;
  analysis: {
    tourDetected: boolean;
    toursDetected: number;
    totalPoints: number;
    sampleIntervalSeconds: number | null;
    lowFrequencyWarning: boolean;
  };
  best?: {
    durationSeconds: number;
    durationLabel: string;
    distanceKm: number;
    avgSpeedKnots: number;
    vmaxKnots: number | null;
    startTime: string;
    endTime: string;
    sectors: SectorTime[];
    points: { lat: number; lon: number }[];
  };
}
