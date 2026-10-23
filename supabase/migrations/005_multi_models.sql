-- Plusieurs mannequins par shooting : chaque image reçoit l'un des mannequins choisis.
alter table public.shoots add column if not exists model_ids uuid[] not null default '{}';
alter table public.images add column if not exists model_id uuid references public.models(id) on delete set null;
update public.shoots set model_ids = array[model_id] where model_id is not null and model_ids = '{}';
