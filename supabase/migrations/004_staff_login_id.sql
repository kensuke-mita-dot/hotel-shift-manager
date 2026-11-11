-- ============================================================
-- 004: スタッフのログインID＋PIN方式
--   スタッフのメールアドレスは集めない。管理者が登録し、
--   ログインID（例: BHJ01）と6桁PINを発行して手渡しする。
--   Supabase Auth 上は「<ログインID>@staff.hotel-shift.invalid」という
--   送信されないダミーのアドレスで管理する（.invalid は実在しないドメイン）。
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_id_key
  ON public.profiles (login_id) WHERE login_id IS NOT NULL;

-- 初期PIN・再発行PINのままなら true（初回ログイン時に変更を求める）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false;
