'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { UserPlus, Trash2, Loader2, ShieldCheck, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { inviteStaff, updateRole, removeStaff } from '@/app/actions/staff'
import type { StaffMember } from '@/app/actions/staff'
import type { UserRole } from '@/types'

const AVATAR_COLORS = [
  '#9FE1CB','#B5D4F4','#F5C4B3','#CECBF6',
  '#FAC775','#F4C0D1','#C0DD97','#D3D1C7',
]
const avatarColor = (id: string) =>
  AVATAR_COLORS[parseInt(id.replace(/\D/g,'').slice(-4) || '0', 10) % AVATAR_COLORS.length]
const initials = (name: string) => {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)
}

interface Props { initialStaff: StaffMember[]; currentUserId: string }

export function StaffClient({ initialStaff, currentUserId }: Props) {
  const [staff,      setStaff]      = useState(initialStaff)
  const [showInvite, setShowInvite] = useState(false)
  const [email,      setEmail]      = useState('')
  const [fullName,   setFullName]   = useState('')
  const [isPending,  startTransition] = useTransition()
  const [inviting,   setInviting]   = useState(false)

  // ─── 招待 ───────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !fullName) return
    setInviting(true)
    const result = await inviteStaff(email.trim(), fullName.trim())
    setInviting(false)
    if (result.error) {
      toast.error(`招待に失敗しました: ${result.error}`)
      return
    }
    toast.success(`${fullName} に招待メールを送信しました`)
    setEmail('')
    setFullName('')
    setShowInvite(false)
    // 一覧をリフレッシュ
    startTransition(async () => {
      const { fetchStaff } = await import('@/app/actions/staff')
      const res = await fetchStaff()
      if (res.staff) setStaff(res.staff)
    })
  }

  // ─── ロール変更 ─────────────────────────────────────────────
  const handleRoleToggle = (member: StaffMember) => {
    const newRole: UserRole = member.role === 'staff' ? 'admin' : 'staff'
    const label = newRole === 'admin' ? '管理者' : 'スタッフ'
    startTransition(async () => {
      const result = await updateRole(member.id, newRole)
      if (result.error) {
        toast.error(`ロール変更に失敗: ${result.error}`)
        return
      }
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, role: newRole } : s))
      toast.success(`${member.fullName} のロールを${label}に変更しました`)
    })
  }

  // ─── 削除 ───────────────────────────────────────────────────
  const handleRemove = (member: StaffMember) => {
    if (!confirm(`${member.fullName} を削除しますか？この操作は取り消せません。`)) return
    startTransition(async () => {
      const result = await removeStaff(member.id)
      if (result.error) {
        toast.error(`削除に失敗: ${result.error}`)
        return
      }
      setStaff(prev => prev.filter(s => s.id !== member.id))
      toast.success(`${member.fullName} を削除しました`)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">スタッフ管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">{staff.length}名登録中</p>
          </div>
          <Button onClick={() => setShowInvite(v => !v)}>
            <UserPlus className="w-4 h-4 mr-2" />
            スタッフを招待
          </Button>
        </div>

        {/* 招待フォーム */}
        {showInvite && (
          <form
            onSubmit={handleInvite}
            className="bg-white border border-blue-200 rounded-xl p-5 mb-5 space-y-3"
          >
            <p className="text-sm font-medium text-gray-800">新しいスタッフを招待</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">氏名</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="田中 花子"
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">メールアドレス</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tanaka@example.com"
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />送信中...</> : '招待メールを送る'}
              </Button>
            </div>
          </form>
        )}

        {/* スタッフ一覧 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">スタッフ</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">メール</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ロール</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">登録日</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {staff.map(member => (
                <tr key={member.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0"
                        style={{ background: avatarColor(member.id), color: '#444' }}
                      >
                        {initials(member.fullName)}
                      </div>
                      <span className="font-medium text-gray-800">{member.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{member.email}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => member.id !== currentUserId && handleRoleToggle(member)}
                      disabled={member.id === currentUserId || isPending}
                      title={member.id === currentUserId ? '自分のロールは変更できません' : 'クリックで切り替え'}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors
                        ${member.role === 'admin'
                          ? 'bg-gray-900 text-white hover:bg-gray-700'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}
                        ${member.id === currentUserId ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                    >
                      {member.role === 'admin'
                        ? <><ShieldCheck className="w-3 h-3" />管理者</>
                        : <><User className="w-3 h-3" />スタッフ</>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(member.createdAt), 'yyyy/MM/dd', { locale: ja })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {member.id !== currentUserId && (
                      <button
                        onClick={() => handleRemove(member)}
                        disabled={isPending}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                    スタッフが登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
