-- ============================================================
-- 009: 時給の「未設定」と「0円」を区別する
--   hourly_wage が NULL ＝ 未設定（勤務した施設の地域の初期時給で計算）
--   hourly_wage が 0    ＝ 0円（管理者など時給の発生しない人）
--   これまでは 0 を未設定として扱っていたため、既存の 0 は NULL（未設定）に移す。
--   0円にしたい人は、移行後にスタッフ画面で改めて 0 を入れる。
-- ============================================================
alter table staff_pay alter column hourly_wage drop not null;
alter table staff_pay alter column hourly_wage drop default;
update staff_pay set hourly_wage = null where hourly_wage = 0;
