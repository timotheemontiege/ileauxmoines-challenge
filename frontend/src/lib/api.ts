import type {
  LeaderboardResponse,
  ProfileResponse,
  TraceRecord,
  UploadResponse,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function handle<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // réponse non-JSON
  }
  if (!res.ok) {
    const message =
      (body as { error?: string })?.error || `Erreur ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export interface LeaderboardQuery {
  category?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export async function getLeaderboard(
  query: LeaderboardQuery = {},
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.period) params.set('period', query.period);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const res = await fetch(`${API_URL}/api/leaderboard?${params.toString()}`);
  return handle<LeaderboardResponse>(res);
}

export async function getLeaderboardTraces(query: {
  category?: string;
  period?: string;
  limit?: number;
}): Promise<TraceRecord[]> {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.period) params.set('period', query.period);
  if (query.limit) params.set('limit', String(query.limit));
  const res = await fetch(
    `${API_URL}/api/leaderboard/traces?${params.toString()}`,
  );
  const data = await handle<{ traces: TraceRecord[] }>(res);
  return data.traces;
}

export async function getProfile(username: string): Promise<ProfileResponse> {
  const res = await fetch(
    `${API_URL}/api/profile/${encodeURIComponent(username)}`,
  );
  return handle<ProfileResponse>(res);
}

export interface UploadParams {
  file: File;
  category: string;
  windForce?: number | null;
  comment?: string;
  token: string;
}

export async function uploadSession({
  file,
  category,
  windForce,
  comment,
  token,
}: UploadParams): Promise<UploadResponse> {
  const form = new FormData();
  form.append('gpx', file);
  form.append('category', category);
  if (windForce != null && !Number.isNaN(windForce)) {
    form.append('wind_force_beaufort', String(windForce));
  }
  if (comment) form.append('comment', comment);

  const res = await fetch(`${API_URL}/api/sessions/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return handle<UploadResponse>(res);
}
