create table if not exists public.mojo_usage_intervals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  session_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0 and duration_seconds <= 86400),
  timezone text not null,
  local_date date not null,
  local_hour integer not null check (local_hour >= 0 and local_hour <= 23),
  created_at timestamptz not null default now()
);

create index if not exists mojo_usage_intervals_started_at_idx
  on public.mojo_usage_intervals (started_at desc);

create index if not exists mojo_usage_intervals_local_time_idx
  on public.mojo_usage_intervals (local_date, local_hour);

alter table public.mojo_usage_intervals enable row level security;

drop policy if exists "Allow anonymous Mojo analytics interval inserts" on public.mojo_usage_intervals;
create policy "Allow anonymous Mojo analytics interval inserts"
  on public.mojo_usage_intervals
  for insert
  to anon
  with check (true);

drop policy if exists "Disallow client reads of Mojo analytics intervals" on public.mojo_usage_intervals;
create policy "Disallow client reads of Mojo analytics intervals"
  on public.mojo_usage_intervals
  for select
  to anon
  using (false);
