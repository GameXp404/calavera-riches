-- ============================================================
-- CALAVERA RICHES — Initial Schema
-- Run this once in Supabase SQL Editor for project calavera-riches
-- ============================================================

-- 1) PLAYERS: per-user game state (replaces calavera_<user>_player localStorage)
create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  username     text unique not null check (char_length(username) between 1 and 24),
  password_hash text not null,
  balance      bigint not null default 1000000 check (balance >= 0),
  bet_idx      smallint default 0,
  turbo        smallint default 0 check (turbo between 0 and 5),
  ante_bet     boolean default false,
  spins        bigint default 0,
  total_bet    bigint default 0,
  total_win    bigint default 0,
  biggest_win  bigint default 0,
  frozen       boolean default false,
  pending_bonus_amount bigint default 0,
  pending_bonus_tier   text,
  last_login   timestamptz,
  last_spin    timestamptz,
  registered_at timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_players_username on public.players (lower(username));
create index if not exists idx_players_last_login on public.players (last_login desc);

-- 2) BIG_WINS: history log of MEGA/EPIC/LEGENDARY/JACKPOT wins
create table if not exists public.big_wins (
  id           bigserial primary key,
  username     text not null,
  tier         text not null,           -- 'MEGA' | 'EPIC' | 'LEGENDARY' | 'JACKPOT-MINI' etc
  amount       bigint not null,
  bet          bigint default 0,
  multiplier   numeric(10, 2) default 0,
  occurred_at  timestamptz default now()
);

create index if not exists idx_big_wins_occurred on public.big_wins (occurred_at desc);
create index if not exists idx_big_wins_user on public.big_wins (username);

-- 3) JACKPOT: progressive jackpot state (single-row, 4 tiers)
create table if not exists public.jackpot (
  id           text primary key default 'default',
  enabled      boolean default false,
  -- 4 tiers stored inline (seed + contribPct + pool)
  mini_seed    bigint default 500000,
  mini_pct     numeric(5, 2) default 0.5,
  mini_pool    bigint default 500000,
  minor_seed   bigint default 2500000,
  minor_pct    numeric(5, 2) default 1.0,
  minor_pool   bigint default 2500000,
  major_seed   bigint default 10000000,
  major_pct    numeric(5, 2) default 1.5,
  major_pool   bigint default 10000000,
  grand_seed   bigint default 50000000,
  grand_pct    numeric(5, 2) default 2.0,
  grand_pool   bigint default 50000000,
  last_triggered jsonb,
  updated_at   timestamptz default now()
);

insert into public.jackpot (id) values ('default') on conflict (id) do nothing;

-- 4) SETTINGS: global key/value (maintenance flag, difficulty, broadcast)
create table if not exists public.settings (
  key          text primary key,
  value        jsonb not null,
  updated_at   timestamptz default now()
);

insert into public.settings (key, value) values
  ('maintenance', 'false'::jsonb),
  ('difficulty', '"normal"'::jsonb),
  ('broadcast', 'null'::jsonb)
on conflict (key) do nothing;

-- 5) TRANSACTIONS (for future payment integration — Midtrans/Xendit)
create table if not exists public.transactions (
  id           bigserial primary key,
  username     text not null,
  type         text not null,          -- 'topup' | 'spin' | 'bonus' | 'jackpot' | 'admin_set'
  amount       bigint not null,        -- positive=credit, negative=debit
  balance_after bigint not null,
  meta         jsonb,                   -- payment_id, payment_method, admin_user, etc
  occurred_at  timestamptz default now()
);

create index if not exists idx_tx_user on public.transactions (username, occurred_at desc);
create index if not exists idx_tx_type on public.transactions (type, occurred_at desc);

-- ============================================================
-- updated_at trigger (auto-set on row update)
-- ============================================================
create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_players_updated on public.players;
create trigger trg_players_updated before update on public.players
for each row execute function public.set_updated_at();

drop trigger if exists trg_jackpot_updated on public.jackpot;
create trigger trg_jackpot_updated before update on public.jackpot
for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings
for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- For Phase 1: enable RLS but ALLOW service_role full access (default).
-- Anon users will have NO access to public.players directly — all reads/writes
-- must go through Vercel Serverless Functions which use service_role key.
-- ============================================================
alter table public.players enable row level security;
alter table public.big_wins enable row level security;
alter table public.jackpot enable row level security;
alter table public.settings enable row level security;
alter table public.transactions enable row level security;

-- No policies = no anon access. Service role bypasses RLS always.
-- (Phase 2+: add user-scoped policies when we use Supabase Auth.)
