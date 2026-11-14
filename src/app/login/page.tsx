'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { loginAction, type AuthState } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

const initial: AuthState = {}

const inputClass =
  'w-full rounded-btn border border-hs-input-border px-3 py-2 text-base outline-none ' +
  'focus:border-hs-blue focus:ring-2 focus:ring-hs-blue/20 transition-colors placeholder:text-hs-text-lighter'

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
      {pending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />ログイン中...</> : 'ログイン'}
    </Button>
  )
}

function LoginForm() {
  const [state, action] = useFormState(loginAction, initial)
  const searchParams = useSearchParams()
  const isInactive = searchParams.get('error') === 'inactive'

  return (
    <div className="min-h-dvh bg-hs-gray-lighter flex items-center justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+80px)]">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-hs-blue rounded-[8px] mb-4">
            <span className="text-white text-2xl font-bold">H</span>
          </div>
          <h1 className="text-2xl font-semibold text-hs-text">HOTEL SHIFT</h1>
          <p className="text-sm text-hs-text-sub mt-1">シフト管理システム</p>
        </div>

        <div className="bg-white rounded-card border border-hs-border shadow-sm p-6">
          <form action={action} className="space-y-4">

            {isInactive && !state.error && (
              <div className="bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
                このアカウントは停止されています。管理者にお問い合わせください。
              </div>
            )}
            {state.error && (
              <div className="bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
                {state.error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="identifier" className="block text-sm font-medium text-hs-text">ログインID</label>
              <input
                id="identifier" name="identifier" type="text"
                autoComplete="username" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                required placeholder="例：BHJ01" className={inputClass}
              />
              <p className="text-xs text-hs-text-lighter">管理者はメールアドレスを入力</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-hs-text">PIN（6桁）</label>
              <input
                id="password" name="password" type="password"
                autoComplete="current-password" required placeholder="••••••" className={inputClass}
              />
              <p className="text-xs text-hs-text-lighter">管理者はパスワードを入力</p>
            </div>

            <SubmitButton />
          </form>
        </div>

        <p className="text-center text-xs text-hs-text-lighter mt-6">
          ログインIDやPINがわからないときは、管理者に再発行を依頼してください
        </p>
        <p className="text-center text-xs mt-2">
          <Link href="/login/forgot" className="text-hs-text-sub underline">管理者の方：パスワードを忘れた場合</Link>
        </p>
      </div>
    </div>
  )
}
