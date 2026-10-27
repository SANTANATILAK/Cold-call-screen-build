-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto;

create table if not exists calls (
  id            uuid primary key default gen_random_uuid(),
  prospect_name text not null,
  company       text,
  caller_name   text,
  current_stage int  not null default 1 check (current_stage between 1 and 8),
  status        text not null default 'open' check (status in ('open', 'closed')),
  outcome       text check (outcome in ('meeting_booked', 'callback', 'not_interested', 'wrong_person', 'ended_early')),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create table if not exists stage_results (
  id             uuid primary key default gen_random_uuid(),
  call_id        uuid not null references calls(id) on delete cascade,
  stage          int  not null check (stage between 1 and 8),
  tap_choice     text,
  prospect_words text,
  created_at     timestamptz not null default now(),
  unique (call_id, stage)
);

create index if not exists calls_created_idx on calls (created_at desc);
create index if not exists stage_results_call_idx on stage_results (call_id);

-- The backend uses the service key, which bypasses RLS.
-- RLS is enabled so the anon key cannot read or write these tables directly.
alter table calls enable row level security;
alter table stage_results enable row level security;
