-- ============================================================
-- 003: 人件費見込み用のスタッフ設定
--   施設・時給・交通費を profiles に追加する
-- ============================================================

-- email はアプリ側で既に使っているが 001 に無かったため念のため追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- 所属施設（例: 'BHJ', 'MAHT'）。未設定は「施設未設定」として集計
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS facility text;

-- 時給（円）。未設定は 0 円として集計し、画面で警告を出す
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hourly_wage integer NOT NULL DEFAULT 0
  CHECK (hourly_wage >= 0);

-- 交通費：1出勤あたり or 月額固定
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS transport_type text NOT NULL DEFAULT 'per_day'
  CHECK (transport_type IN ('per_day', 'monthly'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS transport_amount integer NOT NULL DEFAULT 0
  CHECK (transport_amount >= 0);
