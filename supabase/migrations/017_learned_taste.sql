-- Apprentissage : ce que la plateforme a appris des images approuvées, refusées, jetées et des demandes de correction
alter table public.brand_kit add column if not exists learned_love text[] not null default '{}';
alter table public.brand_kit add column if not exists learned_hate text[] not null default '{}';
alter table public.brand_kit add column if not exists learned_at timestamptz;
