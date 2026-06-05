-- ============================================================================
-- Tour Île Challenge — migration multi-parcours (v2)
-- À exécuter dans Supabase : SQL Editor > coller > Run
-- Idempotent autant que possible (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ─── Colonnes parcours / Vmax / secteurs ────────────────────────────────────
alter table public.sessions
  add column if not exists course_id text not null default 'ile-aux-moines';

alter table public.performances
  add column if not exists course_id    text not null default 'ile-aux-moines',
  add column if not exists vmax_knots   double precision,
  add column if not exists sector_times jsonb;
-- sector_times : [{ "sectorId":"s1","name":"Façade ouest","durationSeconds":312,
--                   "startTime":"...","endTime":"..." }, ...]

create index if not exists idx_perf_course_duration
  on public.performances (course_id, category, duration_seconds);
create index if not exists idx_sessions_course
  on public.sessions (course_id);

-- ─── Table classement par secteur ───────────────────────────────────────────
create table if not exists public.sector_performances (
  id               uuid primary key default gen_random_uuid(),
  performance_id   uuid references public.performances (id) on delete cascade,
  user_id          uuid references public.profiles (id) on delete cascade,
  course_id        text not null,
  sector_id        text not null,
  sector_name      text not null,
  duration_seconds integer not null,
  category         text not null,
  achieved_at      timestamptz not null,
  created_at       timestamptz default now()
);

create index if not exists idx_sector_perf_lookup
  on public.sector_performances (course_id, sector_id, duration_seconds);
create index if not exists idx_sector_perf_user
  on public.sector_performances (user_id);

-- ─── RLS (cohérent avec 0001 : lecture publique, écriture via service_role) ──
alter table public.sector_performances enable row level security;

drop policy if exists "sector_perf_select_public" on public.sector_performances;
create policy "sector_perf_select_public" on public.sector_performances
  for select using (true);

drop policy if exists "sector_perf_insert_self" on public.sector_performances;
create policy "sector_perf_insert_self" on public.sector_performances
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- RPC : classement global — filtré par parcours, Vmax incluse
-- (remplace la version 0001 à 2 arguments)
-- ============================================================================
drop function if exists public.get_leaderboard(text, text);
drop function if exists public.get_leaderboard(text, text, text);

create or replace function public.get_leaderboard(
  p_course_id text default 'ile-aux-moines',
  p_category  text default 'all',
  p_period    text default 'all'
)
returns table (
  rank                bigint,
  user_id             uuid,
  username            text,
  avatar_url          text,
  performance_id      uuid,
  session_id          uuid,
  course_id           text,
  duration_seconds    integer,
  distance_km         double precision,
  avg_speed_knots     double precision,
  vmax_knots          double precision,
  category            text,
  wind_force_beaufort integer,
  comment             text,
  validated_at        timestamptz
)
language sql
stable
as $$
  with filtered as (
    select p.*, pr.username, pr.avatar_url
    from public.performances p
    join public.profiles pr on pr.id = p.user_id
    where p.course_id = p_course_id
      and (p_category = 'all' or p.category = p_category)
      and (
        p_period = 'all'
        or (p_period = 'year' and p.validated_at >= date_trunc('year', now()))
        or (p_period = '30d'  and p.validated_at >= now() - interval '30 days')
      )
  ),
  best as (
    select distinct on (user_id, category) *
    from filtered
    order by user_id, category, duration_seconds asc, validated_at asc
  )
  select
    row_number() over (order by duration_seconds asc, validated_at asc) as rank,
    user_id, username, avatar_url,
    id as performance_id, session_id, course_id,
    duration_seconds, distance_km, avg_speed_knots, vmax_knots,
    category, wind_force_beaufort, comment, validated_at
  from best
  order by duration_seconds asc, validated_at asc;
$$;

-- ============================================================================
-- RPC : tracés des records pour la carte — filtrés par parcours
-- (remplace la version 0001 à 3 arguments)
-- ============================================================================
drop function if exists public.get_leaderboard_traces(text, text, integer);
drop function if exists public.get_leaderboard_traces(text, text, text, integer);

create or replace function public.get_leaderboard_traces(
  p_course_id text default 'ile-aux-moines',
  p_category  text default 'all',
  p_period    text default 'all',
  p_limit     integer default 30
)
returns table (
  performance_id   uuid,
  user_id          uuid,
  username         text,
  course_id        text,
  category         text,
  duration_seconds integer,
  vmax_knots       double precision,
  gpx_tour_points  jsonb
)
language sql
stable
as $$
  with filtered as (
    select p.*, pr.username
    from public.performances p
    join public.profiles pr on pr.id = p.user_id
    where p.course_id = p_course_id
      and (p_category = 'all' or p.category = p_category)
      and (
        p_period = 'all'
        or (p_period = 'year' and p.validated_at >= date_trunc('year', now()))
        or (p_period = '30d'  and p.validated_at >= now() - interval '30 days')
      )
  ),
  best as (
    select distinct on (user_id, category) *
    from filtered
    order by user_id, category, duration_seconds asc, validated_at asc
  )
  select id, user_id, username, course_id, category, duration_seconds, vmax_knots, gpx_tour_points
  from best
  order by duration_seconds asc
  limit p_limit;
$$;

-- ============================================================================
-- RPC : classement par SECTEUR — top 50 (meilleur temps par rider et secteur)
-- ============================================================================
create or replace function public.get_sector_leaderboard(
  p_course_id text,
  p_sector_id text,
  p_category  text default 'all',
  p_period    text default 'all'
)
returns table (
  rank             bigint,
  user_id          uuid,
  username         text,
  avatar_url       text,
  sector_perf_id   uuid,
  performance_id   uuid,
  course_id        text,
  sector_id        text,
  sector_name      text,
  duration_seconds integer,
  category         text,
  achieved_at      timestamptz
)
language sql
stable
as $$
  with filtered as (
    select sp.*, pr.username, pr.avatar_url
    from public.sector_performances sp
    join public.profiles pr on pr.id = sp.user_id
    where sp.course_id = p_course_id
      and sp.sector_id = p_sector_id
      and (p_category = 'all' or sp.category = p_category)
      and (
        p_period = 'all'
        or (p_period = 'year' and sp.achieved_at >= date_trunc('year', now()))
        or (p_period = '30d'  and sp.achieved_at >= now() - interval '30 days')
      )
  ),
  best as (
    select distinct on (user_id, category) *
    from filtered
    order by user_id, category, duration_seconds asc, achieved_at asc
  )
  select
    row_number() over (order by duration_seconds asc, achieved_at asc) as rank,
    user_id, username, avatar_url,
    id as sector_perf_id, performance_id, course_id, sector_id, sector_name,
    duration_seconds, category, achieved_at
  from best
  order by duration_seconds asc, achieved_at asc
  limit 50;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.get_leaderboard(text, text, text)               to anon, authenticated;
grant execute on function public.get_leaderboard_traces(text, text, text, integer) to anon, authenticated;
grant execute on function public.get_sector_leaderboard(text, text, text, text)   to anon, authenticated;
