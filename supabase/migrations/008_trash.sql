-- Corbeille : un shooting ou une image supprimé reste restaurable 30 jours.
alter table public.shoots add column if not exists deleted_at timestamptz;
alter table public.images add column if not exists deleted_at timestamptz;
alter table public.images add column if not exists thumb_path text;
