-- ============================================================
-- 007: 時間指定の希望を1日に2つまで（例：08:00-13:00 と 14:30-22:00）
--   一意制約を (staff, date, type) → (staff, date, type, start_time) に。
--   朝・夕などは start_time が空なので、NULLS NOT DISTINCT で引き続き1日1件。
--   2つまで・時間の重なりなしはアプリ側でチェック。
-- ============================================================
drop index if exists uq_requests_staff_date_type;
create unique index if not exists uq_requests_staff_date_type_start
  on shift_requests (staff_id, date, type, start_time) nulls not distinct;
