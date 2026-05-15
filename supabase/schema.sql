-- Run in Supabase SQL editor.

create extension if not exists "uuid-ossp";

create table if not exists thoughts (
  id uuid primary key default uuid_generate_v4(),
  when_needed text not null,
  mantra text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists thoughts_updated_at_idx on thoughts (updated_at desc);

create table if not exists conflicts (
  id uuid primary key default uuid_generate_v4(),
  thought_a uuid not null references thoughts(id) on delete cascade,
  thought_b uuid not null references thoughts(id) on delete cascade,
  kind text not null check (kind in ('duplicate','conflict')),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  reason text,
  merged_id uuid references thoughts(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint conflicts_pair_unique unique (thought_a, thought_b)
);

create index if not exists conflicts_status_idx on conflicts (status, created_at desc);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists thoughts_updated_at on thoughts;
create trigger thoughts_updated_at before update on thoughts
  for each row execute function set_updated_at();

-- Service role only. No RLS exposure to anon.
alter table thoughts enable row level security;
alter table conflicts enable row level security;
-- No policies = only service_role can read/write. App uses service key server-side.
