-- Journal de chaque appel Gemini : modèle, usage, coût estimé, résultat.
create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  shoot_id uuid,
  image_id uuid,
  purpose text not null,
  model text not null,
  status text not null,            -- ok | error | timeout
  http_status int,
  duration_ms int,
  input_tokens int,
  output_tokens int,
  images_out int not null default 0,
  size text,
  cost_eur numeric(10,4) not null default 0,
  note text
);
create index if not exists ai_calls_created_idx on public.ai_calls (created_at desc);
create index if not exists ai_calls_image_idx on public.ai_calls (image_id);
alter table public.ai_calls enable row level security;
create policy ai_calls_insert on public.ai_calls for insert to authenticated with check (user_id = auth.uid());
create policy ai_calls_select on public.ai_calls for select to authenticated using (public.is_staff());
