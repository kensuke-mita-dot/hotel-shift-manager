'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { loginAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Loader2, Hotel } from 'lucide-react'

const initialState = { error: undefined }

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* ロゴ */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-2xl mb-4">
            <Hotel className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">シフト管理</h1>
          <p className="text-sm text-gray-500 mt-1">ホテル向けシフト管理システム</p>
        </div>

        {/* フォーム */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <form action={formAction} className="space-y-4">

            {/* エラー表示 */}
            {state.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {state.error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10
                  transition-colors placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                パスワード
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                  outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10
                  transition-colors placeholder:text-gray-400"
              />
            </div>

            <SubmitButton />
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          アカウントをお持ちでない方は管理者にお問い合わせください
        </p>
      </div>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      className="w-full mt-2"
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ログイン中...
        </>
      ) : (
        'ログイン'
      )}
    </Button>
  )
}
