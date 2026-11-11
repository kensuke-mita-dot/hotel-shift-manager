'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { changePinAction } from '@/app/actions/auth'

const inputClass =
  'w-full rounded-lg border border-hs-input-border px-3 py-2 text-base tracking-[0.4em] font-mono ' +
  'outline-none focus:border-hs-blue focus:ring-2 focus:ring-hs-blue/20'

export function PinForm() {
  const [state, formAction] = useFormState(changePinAction, { error: undefined })

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="pin" className="block text-sm font-medium text-hs-text">新しいPIN（6桁の数字）</label>
        <input
          id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6}
          autoComplete="new-password" required className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-medium text-hs-text">もう一度入力</label>
        <input
          id="confirm" name="confirm" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6}
          autoComplete="new-password" required className={inputClass}
        />
      </div>
      <p className="text-xs text-hs-text-lighter">誕生日や 111111・123456 のような番号は避けてください。</p>
      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full min-h-tap bg-hs-blue hover:bg-hs-blue-hover text-white" disabled={pending}>
      {pending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />変更中...</> : 'PINを変更する'}
    </Button>
  )
}
