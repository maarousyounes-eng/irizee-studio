-- Visuels sans produit (gros plan peau, texture, ambiance…), utiles pour les pubs.
alter table public.shoots add column if not exists no_product boolean not null default false;
