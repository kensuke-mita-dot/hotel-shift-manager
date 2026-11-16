// src/lib/session.ts
// ログイン中のユーザーと自分のプロフィールを取得する。
// React の cache() で「1回の表示（リクエスト）の中」だけ結果を使い回すので、
// ヘッダー・ページ・権限チェックがそれぞれ呼んでも Supabase への問い合わせは1回で済む。
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import type { UserRole } from '@/types'

export interface MyProfile {
  id: string
  full_name: string
  role: UserRole
  is_active: boolean
  login_id: string | null
  must_change_pin: boolean
}

/** ログイン中のユーザー（未ログインなら null）。トークンは Supabase Auth で検証される */
export const getSessionUser = cache(async () => {
  // ログイン状態はリクエストごとに違うので、環境に関係なく必ず「毎回作るページ」にする
  cookies()
  // Supabase 未設定（ローカルの見た目確認など）は未ログイン扱い
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/** 自分のプロフィール（未ログインなら null） */
export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  const user = await getSessionUser()
  if (!user) return null
  const { data } = await createClient()
    .from('profiles')
    .select('id, full_name, role, is_active, login_id, must_change_pin')
    .eq('id', user.id)
    .single()
  return (data as MyProfile | null) ?? null
})
