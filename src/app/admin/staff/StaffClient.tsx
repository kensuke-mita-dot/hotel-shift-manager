'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { UserPlus, Trash2, Loader2, ShieldCheck, User, Pencil, KeyRound, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Fragment } from 'react'
import { createStaff, resetPin, updateRole, removeStaff, updatePaySettings, fetchStaff } from '@/app/actions/staff'
import type { StaffMember, PaySettings } from '@/app/actions/staff'
import { FACILITIES } from '@/types'
import type { UserRole } from '@/types'
import { yen } from '@/lib/utils'

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
  const [showAdd,    setShowAdd]    = useState(false)
  const [fullName,   setFullName]   = useState('')
  const [facility,   setFacility]   = useState('')
  const [isPending,  startTransition] = useTransition()
  const [adding,     setAdding]     = useState(false)
  /** 発行直後のログイン情報（画面を離れると二度と表示されない） */
  const [issued,     setIssued]     = useState<{ name: string; loginId: string; pin: string; isReset: boolean } | null>(null)
  const [editingId,  setEditingId]  = useState<string | null>(null)

  // ─── 施設・時給・交通費の保存 ───────────────────────────────
  const handleSavePay = async (member: StaffMember, settings: PaySettings) => {
    const result = await updatePaySettings(member.id, settings)
    if (result.error) {
      toast.error(`保存に失敗: ${result.error}`)
      return false
    }
    setStaff(prev => prev.map(s => s.id === member.id ? { ...s, ...settings } : s))
    toast.success(`${member.fullName} の設定を保存しました`)
    setEditingId(null)
    return true
  }

  // ─── スタッフ追加 ───────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) return
    setAdding(true)
    const result = await createStaff(fullName.trim(), facility || null)
    setAdding(false)
    if (result.error || !result.loginId || !result.pin) {
      toast.error(`追加に失敗しました: ${result.error ?? '不明なエラー'}`)
      return
    }
    setIssued({ name: fullName.trim(), loginId: result.loginId, pin: result.pin, isReset: false })
    setFullName('')
    setShowAdd(false)
    startTransition(async () => {
      const res = await fetchStaff()
      if (!res.error) setStaff(res.staff)
    })
  }

  // ─── PIN再発行 ─────────────────────────────────────────────
  const handleResetPin = (member: StaffMember) => {
    if (!member.loginId) return
    if (!confirm(`${member.fullName} のPINを再発行しますか？今のPINは使えなくなります。`)) return
    startTransition(async () => {
      const result = await resetPin(member.id)
      if (result.error || !result.pin) {
        toast.error(`再発行に失敗: ${result.error ?? '不明なエラー'}`)
        return
      }
      setIssued({ name: member.fullName, loginId: member.loginId!, pin: result.pin, isReset: true })
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, mustChangePin: true } : s))
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
      <div className="max-w-5xl mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">スタッフ管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">{staff.length}名登録中</p>
          </div>
          <Button onClick={() => setShowAdd(v => !v)}>
            <UserPlus className="w-4 h-4 mr-2" />
            スタッフを追加
          </Button>
        </div>

        {/* 発行したログイン情報 */}
        {issued && (
          <IssuedCard issued={issued} onClose={() => setIssued(null)} />
        )}

        {/* 追加フォーム */}
        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="bg-white border border-blue-200 rounded-xl p-5 mb-5 space-y-3"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">新しいスタッフを追加</p>
              <p className="text-xs text-gray-500 mt-0.5">
                メールアドレスは不要です。追加するとログインIDと初期PINが表示されるので、本人に渡してください。
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
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
                <label className="text-xs text-gray-500 mb-1 block">施設（ログインIDの頭文字になります）</label>
                <select
                  value={facility}
                  onChange={e => setFacility(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">未設定（STF〜）</option>
                  {FACILITIES.map(f => (
                    <option key={f.code} value={f.code}>{f.code}（{f.name}）</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={adding}>
                {adding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />追加中...</> : '追加してIDを発行'}
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
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ログイン</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ロール</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">施設・時給・交通費</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">登録日</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {staff.map(member => (
                <Fragment key={member.id}>
                <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
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
                  <td className="px-4 py-3">
                    {member.loginId ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-800">{member.loginId}</span>
                        {member.mustChangePin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700" title="初期PIN・再発行PINのまま">
                            PIN未変更
                          </span>
                        )}
                        <button
                          onClick={() => handleResetPin(member)}
                          disabled={isPending}
                          className="text-gray-400 hover:text-gray-800"
                          title="PINを再発行"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs">{member.email || '—'}</span>
                    )}
                  </td>
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
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditingId(id => id === member.id ? null : member.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                      title="施設・時給・交通費を編集"
                    >
                      <span>{member.facility ?? '施設未設定'}</span>
                      <span className="text-gray-300">·</span>
                      <span className={member.hourlyWage === 0 ? 'text-amber-600' : ''}>
                        {member.hourlyWage === 0 ? '時給未設定' : `${yen(member.hourlyWage)}/h`}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>
                        {member.transportAmount === 0
                          ? '交通費なし'
                          : `${member.transportType === 'monthly' ? '月' : '1出勤'}${yen(member.transportAmount)}`}
                      </span>
                      <Pencil className="w-3 h-3 text-gray-400" />
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
                {editingId === member.id && (
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <td colSpan={6} className="px-4 py-3">
                      <PayEditor
                        member={member}
                        onCancel={() => setEditingId(null)}
                        onSave={settings => handleSavePay(member, settings)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
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

// ─── 施設・時給・交通費の編集フォーム ─────────────────────────
function PayEditor({
  member, onCancel, onSave,
}: {
  member:   StaffMember
  onCancel: () => void
  onSave:   (s: PaySettings) => Promise<boolean>
}) {
  const [facility,  setFacility]  = useState(member.facility ?? '')
  const [wage,      setWage]      = useState(member.hourlyWage ? String(member.hourlyWage) : '')
  const [tType,     setTType]     = useState(member.transportType)
  const [tAmount,   setTAmount]   = useState(member.transportAmount ? String(member.transportAmount) : '')
  const [saving,    setSaving]    = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave({
      facility:        facility || null,
      hourlyWage:      Number(wage || 0),
      transportType:   tType,
      transportAmount: Number(tAmount || 0),
    })
    setSaving(false)
  }

  const input = 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900'

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">施設</label>
        <select value={facility} onChange={e => setFacility(e.target.value)} className={input}>
          <option value="">未設定</option>
          {FACILITIES.map(f => (
            <option key={f.code} value={f.code}>{f.code}（{f.name}）</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">時給（円）</label>
        <input
          type="number" min={0} step={1} inputMode="numeric"
          value={wage} onChange={e => setWage(e.target.value)}
          placeholder="1200" className={`${input} w-28`}
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">交通費</label>
        <div className="flex gap-2">
          <select value={tType} onChange={e => setTType(e.target.value as PaySettings['transportType'])} className={input}>
            <option value="per_day">1出勤あたり</option>
            <option value="monthly">月額</option>
          </select>
          <input
            type="number" min={0} step={1} inputMode="numeric"
            value={tAmount} onChange={e => setTAmount(e.target.value)}
            placeholder="0" className={`${input} w-28`}
          />
        </div>
      </div>
      <div className="flex gap-2 ml-auto">
        <Button type="button" variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button type="submit" disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</> : '保存'}
        </Button>
      </div>
    </form>
  )
}

// ─── 発行したログイン情報（この画面でしか表示しない） ────────────
function IssuedCard({
  issued, onClose,
}: {
  issued:  { name: string; loginId: string; pin: string; isReset: boolean }
  onClose: () => void
}) {
  const text = `${issued.name}さん\nシフト管理のログイン情報です。\nログインID：${issued.loginId}\n${issued.isReset ? '新しい' : '初期'}PIN：${issued.pin}\n最初のログインでPINを自分の番号に変更してください。`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('コピーしました')
    } catch {
      toast.error('コピーできませんでした。手で控えてください')
    }
  }

  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl p-5 mb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {issued.name} さんの{issued.isReset ? 'PINを再発行しました' : 'ログイン情報を発行しました'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            PINはこの画面を閉じると二度と表示されません。本人に渡すまで控えておいてください。
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700" title="閉じる">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-8 mt-4">
        <div>
          <p className="text-xs text-gray-500">ログインID</p>
          <p className="text-2xl font-mono font-semibold tracking-wider text-gray-900">{issued.loginId}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">{issued.isReset ? '新しいPIN' : '初期PIN'}</p>
          <p className="text-2xl font-mono font-semibold tracking-[0.3em] text-gray-900">{issued.pin}</p>
        </div>
      </div>
      <Button variant="outline" className="mt-4" onClick={copy}>
        <Copy className="w-4 h-4 mr-2" />
        LINEなどに貼れる文面をコピー
      </Button>
    </div>
  )
}
