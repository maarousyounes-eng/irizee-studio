-- Photo de référence réaliste du produit : son aspect réel (vraie photo ou proposition IA choisie par le client).
-- Le packshot (souvent une image de synthèse) donne le design ; cette photo donne la matière et le rendu.
alter table public.products add column if not exists real_photo_path text;
alter table public.products add column if not exists ref_candidates jsonb not null default '[]'::jsonb;
