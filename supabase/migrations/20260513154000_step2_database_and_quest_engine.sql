-- Step 2: Database & Quest Engine
create extension if not exists pgcrypto;

-- Enums
create type public.quest_rarity as enum (
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'special'
);

create type public.user_quest_status as enum ('active', 'completed');

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  bio text,
  avatar_url text,
  total_xp integer not null default 0 check (total_xp >= 0),
  rank text not null default 'Novice',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Quests
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  rarity public.quest_rarity not null default 'common',
  xp_reward integer not null check (xp_reward >= 0),
  location_lat numeric(9, 6),
  location_long numeric(9, 6),
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- User Quests
create table if not exists public.user_quests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  status public.user_quest_status not null default 'active',
  proof_image_url text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, quest_id)
);

create index if not exists idx_user_quests_status on public.user_quests (status);
create index if not exists idx_user_quests_created_at on public.user_quests (created_at desc);

-- Leaderboards
create or replace view public.leaderboard_global as
select
  p.id as user_id,
  p.username,
  p.avatar_url,
  p.rank,
  p.total_xp,
  row_number() over (order by p.total_xp desc, p.username asc) as global_position
from public.profiles p;

create or replace view public.leaderboard_monthly as
select
  uq.user_id,
  p.username,
  p.avatar_url,
  coalesce(sum(q.xp_reward), 0)::integer as month_xp,
  row_number() over (
    order by coalesce(sum(q.xp_reward), 0) desc, p.username asc
  ) as monthly_position
from public.user_quests uq
join public.quests q on q.id = uq.quest_id
join public.profiles p on p.id = uq.user_id
where uq.status = 'completed'
  and uq.completed_at >= date_trunc('month', now())
group by uq.user_id, p.username, p.avatar_url;

-- Friends leaderboard logic (pass current user's friend IDs)
create or replace function public.get_friends_leaderboard(friend_ids uuid[])
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  total_xp integer,
  friend_position bigint
)
language sql
stable
as $$
  select
    p.id,
    p.username,
    p.avatar_url,
    p.total_xp,
    row_number() over (order by p.total_xp desc, p.username asc) as friend_position
  from public.profiles p
  where p.id = any(friend_ids)
  order by p.total_xp desc, p.username asc;
$$;
