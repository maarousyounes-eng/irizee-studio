-- Types de visuel dans Shooting (photo, réseaux, pub, carrousel, avant/après, libre) + mannequins ensemble
alter table public.shoots add column if not exists visual_type text not null default 'photo';
alter table public.shoots add column if not exists type_params jsonb not null default '{}'::jsonb;
alter table public.shoots add column if not exists model_mode text not null default 'split';

-- Ads : éditeur de textes posés sur des visuels existants (l'image n'est jamais modifiée)
create table if not exists public.ad_designs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  name text not null default '',
  fmt text not null default '4:5',
  items jsonb not null default '[]'::jsonb,   -- [{ key, image_id, path, els: [...] }]
  deleted_at timestamptz
);
alter table public.ad_designs enable row level security;
create policy ad_designs_staff on public.ad_designs for all to authenticated using (public.is_staff()) with check (public.is_staff());
