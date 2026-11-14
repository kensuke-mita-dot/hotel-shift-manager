'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { changePasswordAction } from '@/app/actions/auth'

const inputClass =
  'w-full rounded-btn border border-hs-input-border px-3 py-2 text-base outline-none ' +
  'focus:border-hs-blue focus:ring-2 focus:ring-hs-blue/20'

export function PasswordForm() {
  const [state, formAction] = useFormState(changePasswordAction, {})

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="bg-hs-danger-bg border border-hs-danger-border rounded-btn px-4 py-3 text-sm text-hs-danger">
          {state.error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-hs-text">新しいパスワード（10文字以上）</label>
        <input id="password" name="password" type="password" minLength={10}
          autoComplete="new-password" required className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-medium text-hs-text">もう一度入力</label>
        <input id="confirm" name="confirm" type="password" minLength={10}
          autoComplete="new-password" required className={inputClass} />
      </div>
      <p className="text-xs text-hs-text-lighter">
        パスワード管理アプリでの自動生成がおすすめです。ほかのサービスと同じものは使わないでください。
      </p>
      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}
      className="w-full min-h-tap bg-hs-blue hover:bg-hs-blue-hover text-white rounded-btn">
      {pending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />変更中...</> : 'パスワードを変更する'}
    </Button>
  )
}
