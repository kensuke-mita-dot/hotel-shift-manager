'use client'

import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sendPasswordResetAction } from '@/app/actions/auth'

const inputClass =
  'w-full rounded-btn border border-hs-input-border px-3 py-2 text-base outline-none ' +
  'focus:border-hs-blue focus:ring-2 focus:ring-hs-blue/20 placeholder:text-hs-text-lighter'

export default function ForgotPage() {
  const [state, action] = useFormState(sendPasswordResetAction, {})

  return (
    <div className="min-h-dvh bg-hs-gray-lighter flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-hs-text text-center mb-2">パスワードの再設定</h1>
        <p className="text-sm text-hs-text-sub text-center mb-6">
          管理者のメールアドレスに、再設定用のリンクを送ります。<br />
          スタッフの方（ログインID＋PIN）は、管理者にPINの再発行を依頼してください。
        </p>

        <div className="bg-white rounded-card border border-hs-border shadow-sm p-6">
          {state.sent ? (
            <div className="text-center space-y-3">
              <MailCheck className="w-10 h-10 mx-auto text-hs-blue" />
              <p className="text-sm text-hs-text">
                登録されているメールアドレスであれば、再設定用のリンクを送りました。
                メールのリンクを開くと、新しいパスワードを決める画面になります。
              </p>
              <p className="text-xs text-hs-text-lighter">届かない場合は迷惑メールフォルダも確認してください。</p>
            </div>
          ) : (
            <form action={action} className="space-y-4">
              {state.error && (
                <div className="bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
                  {state.error}
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-hs-text">メールアドレス</label>
                <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
              </div>
              <Submit />
            </form>
          )}
        </div>

        <p className="text-center text-sm mt-6">
          <Link href="/login" className="text-hs-text-sub underline">ログイン画面に戻る</Link>
        </p>
      </div>
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}
      className="w-full min-h-tap bg-hs-blue hover:bg-hs-blue-hover text-white rounded-btn">
      {pending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />送信中...</> : '再設定のリンクを送る'}
    </Button>
  )
}
