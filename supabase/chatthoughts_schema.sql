create extension if not exists pgcrypto;

create schema if not exists chatthoughts;

create table if not exists chatthoughts.thoughts (
  id uuid primary key default gen_random_uuid(),
  need_when text not null check (char_length(need_when) <= 1000),
  mantra text not null check (char_length(mantra) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chatthoughts.thought_conflicts (
  id uuid primary key default gen_random_uuid(),
  existing_thought_id uuid references chatthoughts.thoughts(id) on delete set null,
  existing_need_when text,
  existing_mantra text,
  candidate_need_when text not null check (char_length(candidate_need_when) <= 1000),
  candidate_mantra text not null check (char_length(candidate_mantra) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_need_when text,
  resolved_mantra text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function chatthoughts.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists thoughts_set_updated_at on chatthoughts.thoughts;
create trigger thoughts_set_updated_at
before update on chatthoughts.thoughts
for each row execute function chatthoughts.set_updated_at();

drop trigger if exists thought_conflicts_set_updated_at on chatthoughts.thought_conflicts;
create trigger thought_conflicts_set_updated_at
before update on chatthoughts.thought_conflicts
for each row execute function chatthoughts.set_updated_at();

alter table chatthoughts.thoughts enable row level security;
alter table chatthoughts.thought_conflicts enable row level security;

grant usage on schema chatthoughts to anon, authenticated, service_role;
grant all on all tables in schema chatthoughts to anon, authenticated, service_role;
grant all on all routines in schema chatthoughts to anon, authenticated, service_role;
grant all on all sequences in schema chatthoughts to anon, authenticated, service_role;
alter default privileges for role postgres in schema chatthoughts grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema chatthoughts grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema chatthoughts grant all on sequences to anon, authenticated, service_role;

drop policy if exists thoughts_server_access on chatthoughts.thoughts;
create policy thoughts_server_access
on chatthoughts.thoughts
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists thought_conflicts_server_access on chatthoughts.thought_conflicts;
create policy thought_conflicts_server_access
on chatthoughts.thought_conflicts
for all
to anon, authenticated
using (true)
with check (true);

create index if not exists thoughts_updated_at_idx on chatthoughts.thoughts(updated_at desc);
create index if not exists thought_conflicts_status_updated_at_idx on chatthoughts.thought_conflicts(status, updated_at desc);

alter role authenticator set pgrst.db_schemas = 'public, chatthoughts';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
