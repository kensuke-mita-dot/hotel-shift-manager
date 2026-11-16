import { redirect } from 'next/navigation'
import { getMyProfile } from '@/lib/session'
import { PinForm } from './PinForm'

export default async function PinPage() {
  const profile = await getMyProfile()
  if (!profile) redirect('/login')

  const mustChange = profile?.must_change_pin ?? false

  return (
    <div className="p-4">
      <div className="max-w-sm mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-hs-text">PINの変更</h1>
          <p className="text-sm text-hs-text-sub mt-1">
            {mustChange
              ? '最初に、受け取ったPINを自分だけが知っている6桁の番号に変えてください。'
              : 'ログインに使う6桁のPINを変更します。'}
          </p>
          {profile?.login_id && (
            <p className="text-sm text-hs-text-sub mt-2">
              あなたのログインID：<span className="font-mono font-medium text-hs-text">{profile.login_id}</span>
            </p>
          )}
        </div>
        <div className="bg-white rounded-card border border-hs-border p-6">
          <PinForm />
        </div>
      </div>
    </div>
  )
}
