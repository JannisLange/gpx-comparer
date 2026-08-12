create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_filename text not null,
  recorded_at timestamptz not null,
  direction text not null default 'other' check (direction in ('work_to_home', 'home_to_work', 'other')),
  route_name text,
  bike_setup text,
  notes text,
  distance_m double precision not null check (distance_m >= 0),
  elapsed_time_s double precision not null check (elapsed_time_s > 0),
  moving_time_s double precision not null check (moving_time_s >= 0),
  stopped_time_s double precision not null check (stopped_time_s >= 0),
  average_speed_mps double precision not null check (average_speed_mps >= 0),
  moving_average_mps double precision not null check (moving_average_mps >= 0),
  max_speed_mps double precision not null check (max_speed_mps >= 0),
  elevation_gain_m double precision not null default 0 check (elevation_gain_m >= 0),
  point_count integer not null check (point_count >= 2),
  processing_version integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists trips_recorded_at_idx on public.trips (recorded_at desc);
create index if not exists trips_direction_idx on public.trips (direction, recorded_at desc);

alter table public.trips enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gpx-files', 'gpx-files', false, 4194304, array['application/gpx+xml', 'application/xml', 'text/xml', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.trips is 'Derived commute metrics. Original GPX files live in the private gpx-files Storage bucket.';
