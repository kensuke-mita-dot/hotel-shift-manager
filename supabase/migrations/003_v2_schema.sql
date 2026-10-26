-- ============================================================
-- 003: v2 スキーマ（複数施設・兼任・施設ごとの枠・公開版・変更履歴）
-- 注意：本番データがない前提で、旧 shift_wishes / shifts / v_monthly_shift_summary を削除します。
-- ============================================================

-- ─── 0. 旧オブジェクトの削除 ───────────────────────────────
drop view  if exists v_monthly_shift_summary;
drop table if exists shift_wishes cascade;
drop table if exists shifts cascade;
drop type  if exists shift_slot;
drop type  if exists wish_type;

-- ─── 1. 型 ─────────────────────────────────────────────
create type request_type as enum ('morning', 'evening', 'both', 'night', 'off', 'custom');
create type shift_source as enum ('staff_request', 'admin', 'ai_draft');
create type shift_status as enum ('draft', 'confirmed');

-- ─── 2. 施設と枠 ─────────────────────────────────────────
create table facilities (
  id    text primary key,
  name  text not null,
  sort  int  not null default 0
);

create table facility_slots (
  id          uuid primary key default uuid_generate_v4(),
  facility_id text not null references facilities(id) on delete cascade,
  key         text not null,            -- morning / evening / night / base
  label       text not null,
  start_time  time not null,
  end_time    time not null,            -- end <= start は翌日終了
  min_staff   int  not null default 1 check (min_staff between 1 and 5),
  sort        int  not null default 0,
  unique (facility_id, key)
);

create table min_overrides (
  facility_id text not null references facilities(id) on delete cascade,
  date        date not null,
  slot_key    text not null,
  min_staff   int  not null check (min_staff between 1 and 5),
  primary key (facility_id, date, slot_key)
);

-- ─── 3. スタッフ ─────────────────────────────────────────
alter table profiles add column if not exists email            text;
alter table profiles add column if not exists is_active        boolean not null default true;
alter table profiles add column if not exists hire_date        date;
alter table profiles add column if not exists cum_days_initial int not null default 0;

create table staff_pay (
  staff_id         uuid primary key references profiles(id) on delete cascade,
  hourly_wage      int  not null default 0,
  transport_type   text not null default 'per_shift' check (transport_type in ('per_shift', 'monthly')),
  transport_amount int  not null default 0,
  updated_at       timestamptz not null default now()
);

create table staff_facilities (
  staff_id    uuid not null references profiles(id) on delete cascade,
  facility_id text not null references facilities(id) on delete cascade,
  is_primary  boolean not null default false,
  primary key (staff_id, facility_id)
);
create unique index uq_staff_primary_facility on staff_facilities (staff_id) where is_primary;

-- ─── 4. 希望 ─────────────────────────────────────────────
create table shift_requests (
  id          uuid primary key default uuid_generate_v4(),
  staff_id    uuid not null references profiles(id) on delete cascade,
  date        date not null,
  type        request_type not null,
  start_time  time,
  end_time    time,
  updated_at  timestamptz not null default now(),
  unique (staff_id, date),
  check ((type = 'custom') = (start_time is not null and end_time is not null))
);
create index idx_requests_date on shift_requests (date);

create table request_submissions (
  staff_id       uuid not null references profiles(id) on delete cascade,
  month          date not null check (extract(day from month) = 1),
  submitted_at   timestamptz,
  extended_until date,
  primary key (staff_id, month)
);

-- ─── 5. シフト（下書き・公開版） ───────────────────────────
create table shifts (
  id          uuid primary key default uuid_generate_v4(),
  facility_id text not null references facilities(id),
  staff_id    uuid not null references profiles(id) on delete cascade,
  date        date not null,
  kind        text not null,                     -- 枠の key または 'custom'
  start_time  time not null,
  end_time    time not null,
  starts_at   timestamp generated always as (date + start_time) stored,
  ends_at     timestamp generated always as (date + end_time + case when end_time <= start_time then interval '1 day' else interval '0' end) stored,
  source      shift_source not null default 'admin',
  status      shift_status not null default 'draft',
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now(),
  unique (staff_id, date, facility_id)
);
create index idx_shifts_fac_date   on shifts (facility_id, date);
create index idx_shifts_staff_time on shifts (staff_id, starts_at);

create table published_shifts (
  id           uuid primary key,                  -- shifts.id と同じ値
  facility_id  text not null references facilities(id),
  staff_id     uuid not null references profiles(id) on delete cascade,
  date         date not null,
  kind         text not null,
  start_time   time not null,
  end_time     time not null,
  starts_at    timestamp generated always as (date + start_time) stored,
  ends_at      timestamp generated always as (date + end_time + case when end_time <= start_time then interval '1 day' else interval '0' end) stored,
  published_at timestamptz not null default now(),
  published_by uuid references profiles(id),
  unique (staff_id, date, facility_id)
);
create index idx_pub_fac_date on published_shifts (facility_id, date);

-- ─── 6. 変更履歴（追記のみ） ─────────────────────────────────
create table history (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  table_name  text not null,
  action      text not null,
  facility_id text,
  staff_id    uuid,
  date        date,
  before      jsonb,
  after       jsonb
);
create index idx_history_at on history (at desc);
create index idx_history_fac on history (facility_id, at desc);

-- ─── 7. ヘルパー関数 ─────────────────────────────────────
create or replace function is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active);
$$;

create or replace function my_facility_ids() returns setof text
language sql security definer set search_path = public stable as $$
  select facility_id from staff_facilities where staff_id = auth.uid();
$$;

create or replace function staff_in_my_facilities(p_staff uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from staff_facilities a join staff_facilities b on a.facility_id = b.facility_id
    where a.staff_id = auth.uid() and b.staff_id = p_staff
  );
$$;

-- 対象月の提出期限：前月15日 23:59:59（日本時間）
create or replace function request_deadline(p_month date) returns timestamptz
language sql immutable as $$
  select ((date_trunc('month', p_month) - interval '1 month' + interval '14 days')::date + time '23:59:59') at time zone 'Asia/Tokyo';
$$;

create or replace function can_edit_requests(p_staff uuid, p_month date) returns boolean
language sql security definer set search_path = public stable as $$
  select now() <= coalesce(
    (select (extended_until + time '23:59:59') at time zone 'Asia/Tokyo'
       from request_submissions where staff_id = p_staff and month = date_trunc('month', p_month)::date and extended_until is not null),
    request_deadline(p_month));
$$;

create or replace function submit_requests(p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_edit_requests(auth.uid(), p_month) then raise exception '提出期限を過ぎています'; end if;
  insert into request_submissions (staff_id, month, submitted_at)
  values (auth.uid(), date_trunc('month', p_month)::date, now())
  on conflict (staff_id, month) do update set submitted_at = excluded.submitted_at;
end; $$;

create or replace function extend_deadline(p_staff uuid, p_month date, p_until date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  insert into request_submissions (staff_id, month, extended_until)
  values (p_staff, date_trunc('month', p_month)::date, p_until)
  on conflict (staff_id, month) do update set extended_until = excluded.extended_until;
end; $$;

-- 施設に所属する人の id と名前（確定シフト表用。時給などは返さない）
create or replace function facility_roster(p_facility text)
returns table (staff_id uuid, full_name text, is_primary boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.full_name, sf.is_primary
  from staff_facilities sf join profiles p on p.id = sf.staff_id
  where sf.facility_id = p_facility and p.is_active
    and (is_admin() or p_facility in (select my_facility_ids()))
  order by sf.is_primary desc, p.full_name;
$$;

-- 下書き → 公開版。施設・月単位で置き換え、差分のあったスタッフを返す
create or replace function publish_shifts(p_facility text, p_month date)
returns table (staff_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not is_admin() then raise exception 'forbidden'; end if;

  create temp table _changed on commit drop as
  select coalesce(s.staff_id, p.staff_id) as staff_id
  from (select * from shifts where facility_id = p_facility and date between v_from and v_to) s
  full join (select * from published_shifts where facility_id = p_facility and date between v_from and v_to) p
    on s.staff_id = p.staff_id and s.date = p.date
  where s.id is null or p.id is null or s.kind <> p.kind or s.start_time <> p.start_time or s.end_time <> p.end_time;

  delete from published_shifts where facility_id = p_facility and date between v_from and v_to;
  insert into published_shifts (id, facility_id, staff_id, date, kind, start_time, end_time, published_by)
  select id, facility_id, staff_id, date, kind, start_time, end_time, auth.uid()
  from shifts where facility_id = p_facility and date between v_from and v_to;
  update shifts set status = 'confirmed' where facility_id = p_facility and date between v_from and v_to;

  insert into history (actor_id, table_name, action, facility_id, after)
  values (auth.uid(), 'published_shifts', 'publish', p_facility,
          jsonb_build_object('month', v_from, 'changed_staff', (select count(distinct c.staff_id) from _changed c)));

  return query select distinct c.staff_id from _changed c;
end; $$;

-- ─── 8. 変更履歴トリガー ───────────────────────────────────
create or replace function log_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into history (actor_id, table_name, action, facility_id, staff_id, date, before, after)
  values (auth.uid(), tg_table_name, lower(tg_op),
          r->>'facility_id', nullif(r->>'staff_id', '')::uuid, nullif(r->>'date', '')::date,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end; $$;

do $$
declare t text;
begin
  foreach t in array array['shifts','shift_requests','request_submissions','min_overrides','facility_slots','staff_pay','staff_facilities'] loop
    execute format('create trigger trg_%1$s_history after insert or update or delete on %1$s for each row execute function log_history()', t);
  end loop;
end $$;

-- 公開時の status 更新を履歴に残しすぎないよう、status だけの変更は記録しない
create or replace function skip_status_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then return null; end if;
  return new;
end; $$;
-- ※ 必要に応じて trg_shifts_history を WHEN 句付きに置き換えてください：
-- drop trigger trg_shifts_history on shifts;
-- create trigger trg_shifts_history after insert or update or delete on shifts for each row
--   when (pg_trigger_depth() = 0) execute function log_history();

create trigger trg_shifts_updated_at before update on shifts for each row execute function set_updated_at();
create trigger trg_requests_updated_at before update on shift_requests for each row execute function set_updated_at();

-- ─── 9. RLS ─────────────────────────────────────────────
alter table facilities          enable row level security;
alter table facility_slots      enable row level security;
alter table min_overrides       enable row level security;
alter table staff_pay           enable row level security;
alter table staff_facilities    enable row level security;
alter table shift_requests      enable row level security;
alter table request_submissions enable row level security;
alter table shifts              enable row level security;
alter table published_shifts    enable row level security;
alter table history             enable row level security;

-- 001 で作った ai_draft_runs は RLS が無効のままなので、ここで有効にする（管理者のみ）
alter table ai_draft_runs enable row level security;
create policy "admin ai runs" on ai_draft_runs for all to authenticated using (is_admin()) with check (is_admin());

-- 施設・枠・最低人数：全員が読める。書くのは管理者
create policy "read facilities"  on facilities     for select to authenticated using (true);
create policy "admin facilities" on facilities     for all    to authenticated using (is_admin()) with check (is_admin());
create policy "read slots"       on facility_slots for select to authenticated using (true);
create policy "admin slots"      on facility_slots for all    to authenticated using (is_admin()) with check (is_admin());
create policy "read min"         on min_overrides  for select to authenticated using (true);
create policy "admin min"        on min_overrides  for all    to authenticated using (is_admin()) with check (is_admin());

-- 給与：管理者のみ
create policy "admin pay" on staff_pay for all to authenticated using (is_admin()) with check (is_admin());

-- 所属
create policy "own facilities"   on staff_facilities for select to authenticated using (staff_id = auth.uid());
create policy "admin facilities_m" on staff_facilities for all to authenticated using (is_admin()) with check (is_admin());

-- 希望：自分の分は期限内だけ書ける
create policy "own requests read"  on shift_requests for select to authenticated using (staff_id = auth.uid());
create policy "own requests write" on shift_requests for all    to authenticated
  using (staff_id = auth.uid() and can_edit_requests(staff_id, date))
  with check (staff_id = auth.uid() and can_edit_requests(staff_id, date));
create policy "admin requests"     on shift_requests for all    to authenticated using (is_admin()) with check (is_admin());

-- 提出状況：自分の分を読むだけ（書き込みは関数経由）
create policy "own submissions"   on request_submissions for select to authenticated using (staff_id = auth.uid());
create policy "admin submissions" on request_submissions for all    to authenticated using (is_admin()) with check (is_admin());

-- 下書き：管理者のみ
create policy "admin shifts" on shifts for all to authenticated using (is_admin()) with check (is_admin());

-- 公開版：所属施設の行と、同じ施設の同僚が他施設で勤務する行を読める
create policy "read published" on published_shifts for select to authenticated
  using (is_admin() or facility_id in (select my_facility_ids()) or staff_in_my_facilities(staff_id));

-- 履歴：管理者が読むだけ
create policy "admin history" on history for select to authenticated using (is_admin());

-- ─── 10. 初期データ ─────────────────────────────────────
insert into facilities (id, name, sort) values
  ('BHJ', 'BHJ', 1), ('BHKK', 'BHKK', 2), ('MAHB', 'MAHB', 3), ('MAHT', 'MAHT', 4), ('MAHNM', 'MAHNM', 5);

insert into facility_slots (facility_id, key, label, start_time, end_time, sort) values
  ('BHJ',   'morning', '朝', '08:00', '16:00', 1), ('BHJ',   'evening', '夕', '14:00', '22:00', 2), ('BHJ',   'night', '夜', '22:00', '08:00', 3),
  ('BHKK',  'morning', '朝', '08:00', '16:00', 1), ('BHKK',  'evening', '夕', '14:00', '22:00', 2), ('BHKK',  'night', '夜', '22:00', '08:00', 3),
  ('MAHB',  'morning', '朝', '10:00', '19:00', 1), ('MAHB',  'evening', '夕', '13:00', '22:00', 2), ('MAHB',  'night', '夜', '22:00', '08:00', 3),
  ('MAHT',  'base',    '基本', '10:00', '18:00', 1),
  ('MAHNM', 'morning', '朝', '08:00', '16:00', 1), ('MAHNM', 'evening', '夕', '14:00', '22:00', 2), ('MAHNM', 'night', '夜', '22:00', '08:00', 3);
