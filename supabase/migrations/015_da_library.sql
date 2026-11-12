-- DA de marque (ce qu'on adore / ce qu'on refuse) et bibliothèque d'inspirations
alter table public.brand_kit add column if not exists da_love text not null default '';
alter table public.brand_kit add column if not exists da_hate text not null default '';
create table if not exists public.inspiration_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  path text not null,
  analysis text not null default '',
  summary text not null default ''
);
alter table public.inspiration_library enable row level security;
create policy inspiration_library_staff on public.inspiration_library for all to authenticated using (public.is_staff()) with check (public.is_staff());
