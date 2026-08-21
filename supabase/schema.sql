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
create index if not exists chatthoughts_conflicts_thought_b_idx on chatthoughts_conflicts (thought_b);
create index if not exists chatthoughts_conflicts_merged_id_idx on chatthoughts_conflicts (merged_id);

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
  ],
  "conflict_prompt": "Find existing thoughts that are duplicates (near-identical purpose and advice) or conflicts (same situation, contradictory advice). Ignore small wording differences. Return an empty list when there is no meaningful duplicate or contradiction."
}'::jsonb)
on conflict (id) do nothing;

create table if not exists chatthoughts_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  kind text not null default 'new' check (kind in ('existing','new')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chatthoughts_categories_name_idx on chatthoughts_categories (name);

create table if not exists chatthoughts_thought_labels (
  thought_id uuid primary key references chatthoughts_thoughts(id) on delete cascade,
  title text not null,
  tags text[] not null default '{}',
  categorized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chatthoughts_thought_categories (
  thought_id uuid not null references chatthoughts_thoughts(id) on delete cascade,
  category_id uuid not null references chatthoughts_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thought_id, category_id)
);

create index if not exists chatthoughts_thought_categories_category_idx
  on chatthoughts_thought_categories (category_id);

create table if not exists chatthoughts_sacrifice_cards (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid references chatthoughts_sacrifice_cards(id) on delete cascade,
  kind text not null check (kind in ('vardaan','sacrifice')),
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatthoughts_sacrifice_cards_parent_check check (
    (kind = 'vardaan' and parent_id is null)
    or (kind = 'sacrifice' and parent_id is not null)
  )
);

create index if not exists chatthoughts_sacrifice_cards_kind_updated_at_idx
  on chatthoughts_sacrifice_cards (kind, updated_at desc);
create index if not exists chatthoughts_sacrifice_cards_parent_idx
  on chatthoughts_sacrifice_cards (parent_id, updated_at desc);

create or replace function chatthoughts_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql set search_path = public;

drop trigger if exists chatthoughts_thoughts_updated_at on chatthoughts_thoughts;
create trigger chatthoughts_thoughts_updated_at before update on chatthoughts_thoughts
  for each row execute function chatthoughts_set_updated_at();

drop trigger if exists chatthoughts_settings_updated_at on chatthoughts_settings;
create trigger chatthoughts_settings_updated_at before update on chatthoughts_settings
  for each row execute function chatthoughts_set_updated_at();

drop trigger if exists chatthoughts_categories_updated_at on chatthoughts_categories;
create trigger chatthoughts_categories_updated_at before update on chatthoughts_categories
  for each row execute function chatthoughts_set_updated_at();

drop trigger if exists chatthoughts_thought_labels_updated_at on chatthoughts_thought_labels;
create trigger chatthoughts_thought_labels_updated_at before update on chatthoughts_thought_labels
  for each row execute function chatthoughts_set_updated_at();

drop trigger if exists chatthoughts_sacrifice_cards_updated_at on chatthoughts_sacrifice_cards;
create trigger chatthoughts_sacrifice_cards_updated_at before update on chatthoughts_sacrifice_cards
  for each row execute function chatthoughts_set_updated_at();

-- The app gates access through Next.js passcode middleware and may use either
-- the service-role key or anon key from server routes. Keep RLS disabled here
-- so server-side Supabase reads do not silently return empty lists.
alter table chatthoughts_thoughts disable row level security;
alter table chatthoughts_conflicts disable row level security;
alter table chatthoughts_settings disable row level security;
alter table chatthoughts_categories disable row level security;
alter table chatthoughts_thought_labels disable row level security;
alter table chatthoughts_thought_categories disable row level security;
alter table chatthoughts_sacrifice_cards disable row level security;

grant all on table chatthoughts_sacrifice_cards to anon, authenticated, service_role;

-- Observation / Strategy Updates. Conflict analysis is intentionally not
-- persisted: pending reviews are compared with the latest rules on demand.
create table if not exists chatthoughts_observation_thoughts (
  id uuid primary key default uuid_generate_v4(),
  channel text not null check (channel in ('Study','GameDev','Relaxation/Sleep','Gym','English','General')),
  raw text not null,
  summary text,
  points jsonb not null default '[]'::jsonb,
  other_points jsonb not null default '[]'::jsonb,
  added_point_indexes jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','awaiting_decision','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chatthoughts_observation_thoughts add column if not exists added_point_indexes jsonb not null default '[]'::jsonb;
alter table chatthoughts_observation_thoughts add column if not exists summary text;
alter table chatthoughts_observation_thoughts add column if not exists other_points jsonb not null default '[]'::jsonb;

create table if not exists chatthoughts_rules (
  id uuid primary key default uuid_generate_v4(),
  channel text not null check (channel in ('Study','GameDev','Relaxation/Sleep','Gym','English','General')),
  text text not null,
  current_version integer not null default 1,
  source_thought_id uuid references chatthoughts_observation_thoughts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chatthoughts_rule_versions (
  id uuid primary key default uuid_generate_v4(),
  rule_id uuid not null references chatthoughts_rules(id) on delete cascade,
  version integer not null,
  text text not null,
  source_thought_id uuid references chatthoughts_observation_thoughts(id) on delete set null,
  change_kind text not null check (change_kind in ('created','replaced','kept')),
  created_at timestamptz not null default now(),
  unique (rule_id, version)
);

create index if not exists chatthoughts_observation_thoughts_channel_idx on chatthoughts_observation_thoughts (channel, created_at desc);
create index if not exists chatthoughts_rules_channel_idx on chatthoughts_rules (channel, created_at);
create index if not exists chatthoughts_rule_versions_rule_idx on chatthoughts_rule_versions (rule_id, version desc);

-- Expand existing installations to accept General.
alter table chatthoughts_observation_thoughts drop constraint if exists chatthoughts_observation_thoughts_channel_check;
alter table chatthoughts_observation_thoughts add constraint chatthoughts_observation_thoughts_channel_check
  check (channel in ('Study','GameDev','Relaxation/Sleep','Gym','English','General'));
alter table chatthoughts_rules drop constraint if exists chatthoughts_rules_channel_check;
alter table chatthoughts_rules add constraint chatthoughts_rules_channel_check
  check (channel in ('Study','GameDev','Relaxation/Sleep','Gym','English','General'));

drop trigger if exists chatthoughts_observation_thoughts_updated_at on chatthoughts_observation_thoughts;
create trigger chatthoughts_observation_thoughts_updated_at before update on chatthoughts_observation_thoughts
  for each row execute function chatthoughts_set_updated_at();
drop trigger if exists chatthoughts_rules_updated_at on chatthoughts_rules;
create trigger chatthoughts_rules_updated_at before update on chatthoughts_rules
  for each row execute function chatthoughts_set_updated_at();

alter table chatthoughts_observation_thoughts disable row level security;
alter table chatthoughts_rules disable row level security;
alter table chatthoughts_rule_versions disable row level security;
grant all on table chatthoughts_observation_thoughts, chatthoughts_rules, chatthoughts_rule_versions to anon, authenticated, service_role;
