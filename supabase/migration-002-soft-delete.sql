-- ============================================================
-- MIGRATION 002: Soft delete + case-insensitive username
-- ============================================================
-- Run once in Supabase SQL Editor

-- 1) Add deleted_at column (NULL = active, timestamp = soft-deleted)
alter table public.players
  add column if not exists deleted_at timestamptz;

-- 2) Drop existing unique constraint (was case-sensitive)
alter table public.players drop constraint if exists players_username_key;

-- 3) Add case-insensitive unique constraint via lowercase index
-- (treats 'Doni', 'DONI', 'doni' as the same username)
create unique index if not exists idx_players_username_lower
  on public.players (lower(username));

-- 4) Index for active/deleted filtering
create index if not exists idx_players_deleted_at
  on public.players (deleted_at);
