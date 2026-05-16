-- Run in Supabase SQL editor (project: todotrails). Idempotent.

create extension if not exists "uuid-ossp";

create table if not exists chatthoughts_thoughts (
  id uuid primary key default uuid_generate_v4(),
  raw text,
  augmented jsonb,
  when_needed text,
  mantra text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrate older shape if it exists.
alter table chatthoughts_thoughts add column if not exists raw text;
alter table chatthoughts_thoughts add column if not exists augmented jsonb;
alter table chatthoughts_thoughts alter column when_needed drop not null;
alter table chatthoughts_thoughts alter column mantra drop not null;

create index if not exists chatthoughts_thoughts_updated_at_idx on chatthoughts_thoughts (updated_at desc);

create table if not exists chatthoughts_conflicts (
  id uuid primary key default uuid_generate_v4(),
  thought_a uuid not null references chatthoughts_thoughts(id) on delete cascade,
  thought_b uuid not null references chatthoughts_thoughts(id) on delete cascade,
  kind text not null check (kind in ('duplicate','conflict')),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  reason text,
  merged_id uuid references chatthoughts_thoughts(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint chatthoughts_conflicts_pair_unique unique (thought_a, thought_b)
);

create index if not exists chatthoughts_conflicts_status_idx on chatthoughts_conflicts (status, created_at desc);

create table if not exists chatthoughts_settings (
  id integer primary key default 1 check (id = 1),
  output_schema jsonb not null,
  updated_at timestamptz not null default now()
);

insert into chatthoughts_settings (id, output_schema)
values (1, '{
  "fields": [
    { "key": "when_needed", "label": "When user will need this thought/mantra", "type": "string" },
    { "key": "short", "label": "Shortened version of that thought", "type": "string" },
    { "key": "areas", "label": "Which parts of life this relates to", "type": "array", "options": ["study", "social life", "wife", "family", "money", "sleep", "mental peace", "bodybuilding", "general health", "career", "creativity"] }
  ]
}'::jsonb)
on conflict (id) do nothing;

create or replace function chatthoughts_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists chatthoughts_thoughts_updated_at on chatthoughts_thoughts;
create trigger chatthoughts_thoughts_updated_at before update on chatthoughts_thoughts
  for each row execute function chatthoughts_set_updated_at();

drop trigger if exists chatthoughts_settings_updated_at on chatthoughts_settings;
create trigger chatthoughts_settings_updated_at before update on chatthoughts_settings
  for each row execute function chatthoughts_set_updated_at();

alter table chatthoughts_thoughts disable row level security;
alter table chatthoughts_conflicts disable row level security;
alter table chatthoughts_settings disable row level security;
