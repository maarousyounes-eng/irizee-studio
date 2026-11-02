-- Module Ads : visuels publicitaires (Meta, TikTok, Google). Réservé à l'équipe (admin + employés).
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  idea text not null default '',
  source_path text,
  source_image_id uuid,
  angles jsonb not null default '[]'::jsonb,   -- propositions de l'IA (accroche, titre, texte, bouton…)
  angle int not null default 0,
  texts jsonb not null default '{}'::jsonb,    -- textes retenus et modifiés
  template text not null default 'hook',
  fonts text not null default 'elegant',
  palette text not null default 'light',
  focus jsonb not null default '{"x":50,"y":50}'::jsonb,
  review_status text not null default 'draft',
  deleted_at timestamptz
);
alter table public.ads enable row level security;
create policy ads_staff_all on public.ads for all to authenticated using (public.is_staff()) with check (public.is_staff());
