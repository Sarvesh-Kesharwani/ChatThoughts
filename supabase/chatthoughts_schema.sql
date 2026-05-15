create extension if not exists pgcrypto;

create table if not exists public.thoughts (
  id uuid primary key default gen_random_uuid(),
  need_when text not null check (char_length(need_when) <= 1000),
  mantra text not null check (char_length(mantra) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.thought_conflicts (
  id uuid primary key default gen_random_uuid(),
  existing_thought_id uuid references public.thoughts(id) on delete set null,
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists thoughts_set_updated_at on public.thoughts;
create trigger thoughts_set_updated_at
before update on public.thoughts
for each row execute function public.set_updated_at();

drop trigger if exists thought_conflicts_set_updated_at on public.thought_conflicts;
create trigger thought_conflicts_set_updated_at
before update on public.thought_conflicts
for each row execute function public.set_updated_at();

alter table public.thoughts enable row level security;
alter table public.thought_conflicts enable row level security;

revoke all on table public.thoughts from anon, authenticated;
revoke all on table public.thought_conflicts from anon, authenticated;
grant select, insert, update, delete on table public.thoughts to service_role;
grant select, insert, update, delete on table public.thought_conflicts to service_role;

create index if not exists thoughts_updated_at_idx on public.thoughts(updated_at desc);
create index if not exists thought_conflicts_status_updated_at_idx on public.thought_conflicts(status, updated_at desc);
