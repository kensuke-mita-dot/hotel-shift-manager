-- ============================================================
-- 002: RLS無限再帰を修正
-- profiles の admin ポリシーが profiles 自身を参照して
-- 無限再帰が起きる問題を SECURITY DEFINER 関数で解消する
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. ロール取得用 SECURITY DEFINER 関数
--    RLS をバイパスして安全にロールを返す
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────
-- 2. 再帰を起こしていた既存ポリシーを削除
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admins can read all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "admins can update all profiles" ON public.profiles;

-- ─────────────────────────────────────────────
-- 3. 再帰しない新ポリシー（関数を使う）
-- ─────────────────────────────────────────────
CREATE POLICY "admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- ─────────────────────────────────────────────
-- shift_wishes / shifts の admin ポリシーも同様に修正
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "admins can read all wishes"    ON public.shift_wishes;
DROP POLICY IF EXISTS "admins can manage all shifts"  ON public.shifts;

CREATE POLICY "admins can read all wishes"
  ON public.shift_wishes FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "admins can manage all shifts"
  ON public.shifts FOR ALL
  USING (public.get_my_role() = 'admin');
