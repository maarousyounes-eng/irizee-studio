-- Nombre de produits dans l'image : une seule fois (défaut) ou plusieurs comme l'inspiration.
alter table public.shoots add column if not exists product_copies text not null default 'single';
