-- Résultats des étapes longues (directions, esquisses, création de campagne) : la page les récupère même si la connexion a coupé la requête
create table if not exists public.ai_jobs (
  id uuid primary key,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete cascade,
  state text not null default 'running',
  result jsonb,
  error text
);
alter table public.ai_jobs enable row level security;
create policy ai_jobs_own on public.ai_jobs for all to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
