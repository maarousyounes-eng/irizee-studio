-- Déclinaisons de pubs : chaque variante garde le lien vers la pub d'origine et les chiffres
-- qui ont motivé la déclinaison (envoyés par Irizée Brand).
alter table public.ad_designs add column if not exists parent_id uuid references public.ad_designs(id) on delete set null;
alter table public.ad_designs add column if not exists decline_context jsonb;
create index if not exists ad_designs_parent_id_idx on public.ad_designs(parent_id);
