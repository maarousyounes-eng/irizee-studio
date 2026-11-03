-- Module Ads v2 : campagnes (inspiration ou idée → lot de pubs toutes différentes), variantes, charte de marque.
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  name text not null default '', origin text not null default 'idea', idea text not null default '', keep_change text not null default '',
  inspiration_paths text[] not null default '{}', product_ids uuid[] not null default '{}', photo_paths text[] not null default '{}',
  message text not null default '', offer text not null default '', text_mode text not null default 'ai', engine text not null default 'openai',
  count int not null default 6, deleted_at timestamptz
);
create table if not exists public.ad_variants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  created_at timestamptz not null default now(), idx int not null default 0,
  direction text not null default '', scene text not null default '', text_zone text not null default 'top', text_mode text not null default 'ai',
  hook text not null default '', cta text not null default '', badge text not null default '',
  state text not null default 'generating', error text, path text, thumb_path text,
  formats jsonb not null default '{}'::jsonb, history jsonb not null default '[]'::jsonb, qc jsonb,
  starred boolean not null default false, review_status text not null default 'draft', deleted_at timestamptz
);
create index if not exists ad_variants_campaign_idx on public.ad_variants(campaign_id);
create table if not exists public.brand_kit (
  id int primary key default 1, logo_path text, fonts text not null default 'elegant',
  colors text[] not null default '{#0A0A0B,#FFFFFF,#2B6EE8,#F3EDE4}', updated_at timestamptz not null default now()
);
insert into public.brand_kit (id) values (1) on conflict do nothing;
alter table public.ad_campaigns enable row level security;
alter table public.ad_variants enable row level security;
alter table public.brand_kit enable row level security;
create policy ad_campaigns_staff on public.ad_campaigns for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy ad_variants_staff on public.ad_variants for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy brand_kit_read on public.brand_kit for select to authenticated using (public.is_staff());
create policy brand_kit_write on public.brand_kit for update to authenticated using (public.is_staff()) with check (public.is_staff());
