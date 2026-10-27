'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { loginAction, verifyOtpAction, type AuthState } from '@/app/actions/auth'
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

function SubmitButton({ label }: { label: string }) {
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
        label
      )}
    </Button>
  )
}

function LoginForm() {
  const [emailState, emailAction] = useFormState(loginAction, initial)
  const [otpState, otpAction] = useFormState(verifyOtpAction, initial)
  const searchParams = useSearchParams()
  const isInactive = searchParams.get('error') === 'inactive'

  // メール送信後の状態
  const sent = emailState.status === 'sent'
  const sentEmail = sent ? emailState.email : ''

  // OTP 検証中のエラー
  const otpError = otpState.status === 'error' ? otpState.message : null

  return (
    <div className="min-h-dvh bg-hs-gray-lighter flex items-center justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+80px)]">
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

          {!sent ? (
            /* ── メールアドレス入力フォーム ── */
            <form action={emailAction} className="space-y-4">

              {emailState.status === 'error' && (
                <div className="bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
                  {emailState.message}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-hs-text">
                  メールアドレス
                </label>
                <p className="text-xs text-hs-text-lighter">
                  アカウントをお持ちでない方は管理者にお問い合わせください
                </p>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-btn border border-hs-input-border px-3 py-2 text-base
                    outline-none focus:border-hs-blue focus:ring-2 focus:ring-hs-blue/20
                    transition-colors placeholder:text-hs-text-lighter"
                />
              </div>

              <SubmitButton label="ログイン用リンクを送る" />
            </form>

          ) : (
            /* ── メール送信後：リンク案内 ＋ 6桁コード入力 ── */
            <div className="space-y-5">

              {/* 送信完了メッセージ */}
              <div className="text-center py-2 space-y-2">
                <div className="text-4xl">✉️</div>
                <p className="text-sm text-hs-text">
                  <span className="font-medium">{sentEmail}</span> にメールを送りました。
                </p>
                <p className="text-sm text-hs-text-sub">
                  メール内のリンクを開くか、下の欄に6桁のコードを入力してください。
                </p>
              </div>

              {/* 遅延案内 */}
              <p className="text-xs text-center text-hs-text-lighter leading-relaxed">
                メールが届くまで1〜2分かかることがあります。<br />
                迷惑メールのフォルダも確認してください。
              </p>

              {/* 6桁コード入力フォーム */}
              <form action={otpAction} className="space-y-3">
                <input type="hidden" name="email" value={sentEmail} />

                {otpError && (
                  <div className="bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
                    {otpError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="token" className="block text-sm font-medium text-hs-text">
                    6桁のコード
                  </label>
                  <input
                    id="token"
                    name="token"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    className="w-full rounded-btn border border-hs-input-border px-3 py-2 text-base text-center
                      tracking-[0.3em] font-mono outline-none focus:border-hs-blue focus:ring-2
                      focus:ring-hs-blue/20 transition-colors placeholder:text-hs-text-lighter"
                  />
                </div>

                <SubmitButton label="コードでログイン" />
              </form>

              {/* 別のメールで送り直す */}
              <p className="text-center text-xs text-hs-text-lighter">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="underline hover:text-hs-text transition-colors"
                >
                  別のメールアドレスで試す
                </button>
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
