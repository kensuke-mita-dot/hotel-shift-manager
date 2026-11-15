-- ============================================================
-- 006: 希望を1日に複数入れられるようにする（例：朝と夜のどちらでも可）
--   1人・1日・1件 → 1人・1日・種類ごとに1件
--   「休」とほかの希望の同時指定はアプリ側で防ぐ
-- ============================================================
alter table shift_requests drop constraint if exists shift_requests_staff_id_date_key;
create unique index if not exists uq_requests_staff_date_type on shift_requests (staff_id, date, type);
create index if not exists idx_requests_staff_date on shift_requests (staff_id, date);
