-- ============================================================
-- Hotel Shift Management System — Initial Schema
-- ============================================================

-- ─────────────────────────────────────────────
-- 0. Extensions
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- 1. Enum types
-- ─────────────────────────────────────────────
create type shift_slot as enum ('morning', 'evening', 'night');
-- morning : 08:00–16:00
-- evening : 14:00–22:00
-- night   : 22:00–08:00(翌)

create type wish_type as enum ('morning', 'evening', 'night', 'off');
-- off = 休希望

create type user_role as enum ('staff', 'admin');

-- ─────────────────────────────────────────────
-- 2. profiles（auth.users を拡張）
-- ─────────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text        not null,
  role        user_role   not null default 'staff',
  department  text,                          -- 例: 'front', 'housekeeping'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;

create policy "users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "admins can read all profiles"
  on profiles for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "admins can update all profiles"
  on profiles for update
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────
-- 3. shift_wishes（スタッフの希望入力）
-- ─────────────────────────────────────────────
create table shift_wishes (
  id          uuid        primary key default uuid_generate_v4(),
  staff_id    uuid        not null references profiles(id) on delete cascade,
  wish_date   date        not null,
  wish        wish_type   not null,
  note        text,                          -- 備考（任意）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (staff_id, wish_date)
);

create index idx_shift_wishes_staff_date on shift_wishes (staff_id, wish_date);
create index idx_shift_wishes_date       on shift_wishes (wish_date);

-- RLS
alter table shift_wishes enable row level security;

create policy "staff can manage own wishes"
  on shift_wishes for all
  using (auth.uid() = staff_id)
  with check (auth.uid() = staff_id);

create policy "admins can read all wishes"
  on shift_wishes for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────
-- 4. shifts（確定シフト）
-- ─────────────────────────────────────────────
create table shifts (
  id          uuid        primary key default uuid_generate_v4(),
  staff_id    uuid        not null references profiles(id) on delete cascade,
  shift_date  date        not null,
  slot        shift_slot  not null,
  is_confirmed boolean    not null default false,
  note        text,

  -- AI下書き用メタデータ（Gemini API連携を想定）
  ai_suggested boolean    not null default false,
  ai_model     text,                         -- 例: 'gemini-1.5-pro'
  ai_run_id    uuid,                         -- バッチ生成の追跡用

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (staff_id, shift_date, slot)
);

create index idx_shifts_date      on shifts (shift_date);
create index idx_shifts_staff     on shifts (staff_id, shift_date);
create index idx_shifts_ai_run    on shifts (ai_run_id) where ai_run_id is not null;

-- RLS
alter table shifts enable row level security;

-- スタッフは確定済みシフトのみ閲覧可
create policy "staff can read confirmed shifts"
  on shifts for select
  using (
    is_confirmed = true
  );

-- 管理者は全操作可
create policy "admins can manage all shifts"
  on shifts for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────
-- 5. ai_draft_runs（AI自動生成の実行ログ）
--    将来のGemini API連携を想定
-- ─────────────────────────────────────────────
create table ai_draft_runs (
  id            uuid        primary key default uuid_generate_v4(),
  triggered_by  uuid        not null references profiles(id),
  target_month  date        not null,        -- 対象月の初日（例: 2025-07-01）
  model_name    text        not null,        -- 'gemini-1.5-pro' など
  prompt_tokens int,
  status        text        not null default 'pending',  -- pending|running|done|error
  error_message text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- ─────────────────────────────────────────────
-- 6. ビュー: 管理者向け月次サマリー
-- ─────────────────────────────────────────────
create view v_monthly_shift_summary as
select
  s.shift_date,
  s.slot,
  count(*)                                as assigned_count,
  array_agg(p.full_name order by p.full_name) as staff_names,
  -- NGパターン検出: 夜勤翌日の朝勤割り当て
  exists (
    select 1
    from   shifts prev_s
    where  prev_s.shift_date = s.shift_date - interval '1 day'
      and  prev_s.slot       = 'night'
      and  prev_s.staff_id   = s.staff_id
      and  s.slot            = 'morning'
  )                                       as has_ng_pattern
from   shifts s
join   profiles p on p.id = s.staff_id
group by s.shift_date, s.slot, s.staff_id;

-- ─────────────────────────────────────────────
-- 7. 自動 updated_at トリガー
-- ─────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_shift_wishes_updated_at
  before update on shift_wishes
  for each row execute function set_updated_at();

create trigger trg_shifts_updated_at
  before update on shifts
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- 8. 新規ユーザー登録時に profiles を自動作成
-- ─────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'staff')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
