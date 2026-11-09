-- Fiche produit : couleur / texture du soin une fois sorti du tube ou appliqué, et photo de la texture
alter table public.products add column if not exists applied_look text not null default '';
alter table public.products add column if not exists texture_path text;
