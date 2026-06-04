-- ============================================================================
-- Île-aux-Moines Challenge — schéma initial
-- À exécuter dans Supabase : SQL Editor > coller > Run
-- (ou via la CLI : supabase db push)
-- ============================================================================

-- ─── Table profils (extension de auth.users) ───────────────────────────────
-- Le « users » du cahier des charges = auth.users (géré par Supabase Auth)
-- + cette table profiles pour les données publiques (username, avatar).
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ─── Table sessions (un upload GPX = une session) ──────────────────────────
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  gpx_file_url      text,                          -- chemin/URL dans Supabase Storage
  uploaded_at       timestamptz not null default now(),
  status            text not null default 'pending'
                      check (status in ('pending', 'valid', 'invalid')),
  raw_points_count  integer not null default 0
);

-- ─── Table performances (le meilleur tour extrait d'une session) ───────────
create table if not exists public.performances (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references public.sessions (id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  duration_seconds      integer not null,
  distance_km           double precision not null,
  avg_speed_knots       double precision not null,
  start_time            timestamptz,
  end_time              timestamptz,
  category              text not null
                          check (category in ('wingfoil','windsurf','kitesurf','voile_legere','autre')),
  wind_force_beaufort   integer check (wind_force_beaufort between 0 and 12),
  comment               text,
  validated_at          timestamptz not null default now(),
  gpx_tour_points       jsonb not null default '[]'::jsonb
);

-- ─── Index ─────────────────────────────────────────────────────────────────
create index if not exists idx_perf_category_duration on public.performances (category, duration_seconds);
create index if not exists idx_perf_user             on public.performances (user_id);
create index if not exists idx_perf_validated_at     on public.performances (validated_at desc);
create index if not exists idx_sessions_user         on public.sessions (user_id);

-- ============================================================================
-- Création automatique du profil à l'inscription
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username  text;
  final_username text;
  suffix         integer := 0;
begin
  base_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );
  final_username := base_username;

  -- Garantit l'unicité du username (suffixe numérique si collision).
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, final_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- Lecture publique (classement public) ; écritures via le backend (service_role,
-- qui contourne la RLS). Les policies d'écriture servent de défense en profondeur.
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.sessions     enable row level security;
alter table public.performances enable row level security;

-- profiles
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

-- sessions
drop policy if exists "sessions_select_public" on public.sessions;
create policy "sessions_select_public" on public.sessions
  for select using (true);

drop policy if exists "sessions_insert_self" on public.sessions;
create policy "sessions_insert_self" on public.sessions
  for insert with check (auth.uid() = user_id);

-- performances
drop policy if exists "performances_select_public" on public.performances;
create policy "performances_select_public" on public.performances
  for select using (true);

drop policy if exists "performances_insert_self" on public.performances;
create policy "performances_insert_self" on public.performances
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Supabase Storage : bucket privé pour les fichiers GPX
-- (le backend lit/écrit via service_role ; le front n'y accède jamais directement)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('gpx', 'gpx', false)
on conflict (id) do nothing;

-- ============================================================================
-- RPC : classement (un meilleur temps par rider et par catégorie)
-- p_category : 'all' | 'wingfoil' | 'windsurf' | 'kitesurf' | 'voile_legere' | 'autre'
-- p_period   : 'all' | 'year' (année en cours) | '30d' (30 derniers jours)
-- ============================================================================
create or replace function public.get_leaderboard(
  p_category text default 'all',
  p_period   text default 'all'
)
returns table (
  rank                bigint,
  user_id             uuid,
  username            text,
  avatar_url          text,
  performance_id      uuid,
  session_id          uuid,
  duration_seconds    integer,
  distance_km         double precision,
  avg_speed_knots     double precision,
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
    where (p_category = 'all' or p.category = p_category)
      and (
        p_period = 'all'
        or (p_period = 'year' and p.validated_at >= date_trunc('year', now()))
        or (p_period = '30d'  and p.validated_at >= now() - interval '30 days')
      )
  ),
  best as (
    -- meilleur temps par (rider, catégorie)
    select distinct on (user_id, category) *
    from filtered
    order by user_id, category, duration_seconds asc, validated_at asc
  )
  select
    row_number() over (order by duration_seconds asc, validated_at asc) as rank,
    user_id, username, avatar_url,
    id as performance_id, session_id,
    duration_seconds, distance_km, avg_speed_knots,
    category, wind_force_beaufort, comment, validated_at
  from best
  order by duration_seconds asc, validated_at asc;
$$;

-- ============================================================================
-- RPC : tracés des records pour la carte (mêmes filtres, avec les points)
-- ============================================================================
create or replace function public.get_leaderboard_traces(
  p_category text default 'all',
  p_period   text default 'all',
  p_limit    integer default 30
)
returns table (
  performance_id   uuid,
  user_id          uuid,
  username         text,
  category         text,
  duration_seconds integer,
  gpx_tour_points  jsonb
)
language sql
stable
as $$
  with filtered as (
    select p.*, pr.username
    from public.performances p
    join public.profiles pr on pr.id = p.user_id
    where (p_category = 'all' or p.category = p_category)
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
  select id, user_id, username, category, duration_seconds, gpx_tour_points
  from best
  order by duration_seconds asc
  limit p_limit;
$$;

grant execute on function public.get_leaderboard(text, text)              to anon, authenticated;
grant execute on function public.get_leaderboard_traces(text, text, integer) to anon, authenticated;
