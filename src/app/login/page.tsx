'use client'

import { useFormState } from 'react-dom'
import { useFormStatus } from 'react-dom'
import { loginAction, type AuthState } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const initial: AuthState = { status: 'idle' }

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full mt-2 min-h-tap bg-hs-blue hover:bg-hs-blue-hover rounded-btn text-white"
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          送信中...
        </>
      ) : (
        'ログイン用リンクを送る'
      )}
    </Button>
  )
}

function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initial)
  const searchParams = useSearchParams()
  const isInactive = searchParams.get('error') === 'inactive'

  return (
    <div className="min-h-screen bg-hs-gray-lighter flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* ロゴ */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-hs-blue rounded-[8px] mb-4">
            <span className="text-white text-2xl font-bold">H</span>
          </div>
          <h1 className="text-2xl font-semibold text-hs-text">HOTEL SHIFT</h1>
          <p className="text-sm text-hs-text-sub mt-1">シフト管理システム</p>
        </div>

        <div className="bg-white rounded-card border border-hs-border shadow-sm p-6">

          {/* アカウント停止エラー */}
          {isInactive && (
            <div className="mb-4 bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
              このアカウントは無効になっています。管理者にお問い合わせください。
            </div>
          )}

          {state.status === 'sent' ? (
            /* 送信完了画面 */
            <div className="text-center py-2 space-y-3">
              <div className="text-4xl">✉️</div>
              <p className="text-sm text-hs-text">
                <span className="font-medium">{state.email}</span> にリンクを送りました。
              </p>
              <p className="text-sm text-hs-text-sub">
                メールのリンクを開くとログインできます。
              </p>
              <p className="text-xs text-hs-text-lighter mt-4">
                メールが届かない場合はスパムフォルダをご確認ください。
              </p>
            </div>
          ) : (
            /* メールアドレス入力フォーム */
            <form action={formAction} className="space-y-4">

              {state.status === 'error' && (
                <div className="bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
                  {state.message}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-hs-text">
                  メールアドレス
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-btn border border-hs-input-border px-3 py-2 text-sm
                    outline-none focus:border-hs-blue focus:ring-2 focus:ring-hs-blue/20
                    transition-colors placeholder:text-hs-text-lighter"
                />
              </div>

              <SubmitButton />
            </form>
          )}
        </div>

        <p className="text-center text-xs text-hs-text-lighter mt-6">
          アカウントをお持ちでない方は管理者にお問い合わせください
        </p>
      </div>
    </div>
  )
}
