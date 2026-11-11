-- ============================================================
-- 005: 本番運用開始に向けた調整（何度実行しても安全）
--   1. 施設・枠の初期データ（未投入なら入れる）
--   2. スタッフのログインID＋PIN
--   3. v1 移植時に profiles に誤って足した列を削除（staff_pay / staff_facilities を使う）
--   4. 朝夕通し（kind = 'both'）・浮き（kind = 'custom'）は shifts.kind の値で表すため DB 変更なし
-- ============================================================

-- ─── 1. 施設・枠 ─────────────────────────────────────────
insert into facilities (id, name, sort) values
  ('BHJ',   'BOOK HOTEL 神保町',                 1),
  ('BHKK',  'BOOK HOTEL 京都九条',               2),
  ('MAHB',  'MANGA ART HOTEL BAKUROCHO',         3),
  ('MAHT',  'MANGA ART HOTEL TOKYO',             4),
  ('MAHNM', 'MANGA ART HOTEL NAGOYA MARUNOUCHI', 5)
on conflict (id) do update set name = excluded.name;

insert into facility_slots (facility_id, key, label, start_time, end_time, sort) values
  ('BHJ',   'morning', '朝', '08:00', '16:00', 1), ('BHJ',   'evening', '夕', '14:00', '22:00', 2), ('BHJ',   'night', '夜', '22:00', '08:00', 3),
  ('BHKK',  'morning', '朝', '08:00', '16:00', 1), ('BHKK',  'evening', '夕', '14:00', '22:00', 2), ('BHKK',  'night', '夜', '22:00', '08:00', 3),
  ('MAHB',  'morning', '朝', '10:00', '19:00', 1), ('MAHB',  'evening', '夕', '13:00', '22:00', 2), ('MAHB',  'night', '夜', '22:00', '08:00', 3),
  ('MAHT',  'base',    '基本', '10:00', '18:00', 1),
  ('MAHNM', 'morning', '朝', '08:00', '16:00', 1), ('MAHNM', 'evening', '夕', '14:00', '22:00', 2), ('MAHNM', 'night', '夜', '22:00', '08:00', 3)
on conflict (facility_id, key) do nothing;

-- ─── 2. ログインID＋PIN ─────────────────────────────────────
alter table profiles add column if not exists login_id        text;
alter table profiles add column if not exists must_change_pin boolean not null default false;
create unique index if not exists profiles_login_id_key on profiles (login_id) where login_id is not null;

-- ─── 3. 不要列の削除（値は staff_pay / staff_facilities 側で管理） ─
alter table profiles drop column if exists facility;
alter table profiles drop column if exists hourly_wage;
alter table profiles drop column if exists transport_type;
alter table profiles drop column if exists transport_amount;
