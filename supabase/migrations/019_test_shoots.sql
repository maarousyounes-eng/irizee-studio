-- Compte et shootings de test : hors des listes de l'équipe (les essais automatiques ne polluent plus l'historique).
alter table public.profiles add column if not exists is_test boolean not null default false;
alter table public.shoots add column if not exists is_test boolean not null default false;
