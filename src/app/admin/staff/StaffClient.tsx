'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck, User } from 'lucide-react'
import { toast } from 'sonner'
import {
  inviteStaff,
  extendDeadline,
  setStaffActive,
  setIsStaff,
  updateRole,
  fetchStaffList,
  type StaffListItem,
} from '@/app/actions/staff'
import type { Facility, UserRole } from '@/types'

const AVATAR_COLORS = [
  '#9FE1CB', '#B5D4F4', '#F5C4B3', '#CECBF6',
  '#FAC775', '#F4C0D1', '#C0DD97', '#D3D1C7',
]
const avatarColor = (id: string) =>
  AVATAR_COLORS[parseInt(id.replace(/\D/g, '').slice(-4) || '0', 10) % AVATAR_COLORS.length]
const initials = (name: string) => {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)
}

function fmtDatetime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDateShort(dateStr: string) {
  const [, m, day] = dateStr.split('-').map(Number)
  return `${m}/${day}`
}

function defaultExtendDate() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0]
}

interface Props {
  initialStaff: StaffListItem[]
  currentUserId: string
  facilities: Facility[]
}

export function StaffClient({ initialStaff, currentUserId, facilities }: Props) {
  const [staff, setStaff] = useState(initialStaff)
  const [filterFacility, setFilterFacility] = useState<string>('all')
  const [showInvite, setShowInvite] = useState(false)
  const [isPending, startTransition] = useTransition()

  // 招待フォーム
  const [invName, setInvName] = useState('')
  const [invEmail, setInvEmail] = useState('')
  const [invFacilities, setInvFacilities] = useState<string[]>([])
  const [invPrimary, setInvPrimary] = useState('')
  const [inviting, setInviting] = useState(false)

  // 期限延長
  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [extendDate, setExtendDate] = useState(defaultExtendDate())

  async function refresh() {
    const result = await fetchStaffList()
    if (result.staff) setStaff(result.staff)
  }

  const filtered = filterFacility === 'all'
    ? staff
    : staff.filter(s => s.facilities.some(f => f.facilityId === filterFacility))

  const unsubmittedCount = filtered.filter(s => s.isActive && !s.submittedAt).length

  // ─── 招待 ───────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invName || !invEmail) return
    if (invFacilities.length === 0) { toast.error('所属施設を選択してください'); return }
    if (!invPrimary) { toast.error('主な所属を選択してください'); return }
    setInviting(true)
    const result = await inviteStaff(invEmail, invName, invFacilities, invPrimary)
    setInviting(false)
    if (result.error) { toast.error(`招待失敗: ${result.error}`); return }
    toast.success(`${invName} に招待メールを送信しました`)
    setInvName(''); setInvEmail(''); setInvFacilities([]); setInvPrimary('')
    setShowInvite(false)
    refresh()
  }

  // ─── 期限延長 ──────────────────────────────────────────────────
  const handleExtend = (staffId: string, name: string) => {
    startTransition(async () => {
      const result = await extendDeadline(staffId, extendDate)
      if (result.error) { toast.error(result.error); return }
      const [, m, day] = extendDate.split('-').map(Number)
      toast.success(`${name}さんの期限を ${m}/${day} まで延長しました`)
      setExtendingId(null)
      refresh()
    })
  }

  const handleCancelExtend = (staffId: string, name: string) => {
    startTransition(async () => {
      const result = await extendDeadline(staffId, null)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${name}さんの延長を取り消しました`)
      refresh()
    })
  }

  // ─── is_staff トグル（管理者がシフトに入るか）─────────────────
  const handleToggleIsStaff = (member: StaffListItem) => {
    const next = !member.isStaff
    startTransition(async () => {
      const result = await setIsStaff(member.id, next)
      if (result.error) { toast.error(result.error); return }
      toast.success(next
        ? `${member.fullName} をシフト対象に設定しました`
        : `${member.fullName} をシフト対象から外しました`)
      refresh()
    })
  }

  // ─── 停止 / 復帰 ────────────────────────────────────────────────
  const handleToggleActive = (member: StaffListItem) => {
    const label = member.isActive ? '停止' : '復帰'
    if (!confirm(`${member.fullName} を${label}にしますか？`)) return
    startTransition(async () => {
      const result = await setStaffActive(member.id, !member.isActive)
      if (result.error) { toast.error(result.error); return }
      toast.success(`${member.fullName} を${label}しました`)
      refresh()
    })
  }

  // ─── ロール変更 ─────────────────────────────────────────────────
  const handleRoleToggle = (member: StaffListItem) => {
    const newRole: UserRole = member.role === 'staff' ? 'admin' : 'staff'
    const label = newRole === 'admin' ? '管理者' : 'スタッフ'
    if (!confirm(`${member.fullName} のロールを「${label}」に変更しますか？`)) return
    startTransition(async () => {
      const result = await updateRole(member.id, newRole)
      if (result.error) { toast.error(`ロール変更に失敗: ${result.error}`); return }
      toast.success(`${member.fullName} のロールを${label}に変更しました`)
      refresh()
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── ヘッダー ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">スタッフ管理</h1>
            <div className="flex items-center gap-3 mt-1 text-sm">
              <span className="text-gray-500">{staff.length}名登録中</span>
              {unsubmittedCount > 0 && (
                <span className="font-medium text-red-600">未提出 {unsubmittedCount}名</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowInvite(v => !v)}
            className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + スタッフを招待
          </button>
        </div>

        {/* ── 招待フォーム ── */}
        {showInvite && (
          <form
            onSubmit={handleInvite}
            className="bg-white border border-blue-200 rounded-xl p-5 space-y-4"
          >
            <p className="text-sm font-medium text-gray-800">新しいスタッフを招待</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">氏名 *</label>
                <input
                  type="text"
                  value={invName}
                  onChange={e => setInvName(e.target.value)}
                  placeholder="田中 花子"
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">メールアドレス *</label>
                <input
                  type="email"
                  value={invEmail}
                  onChange={e => setInvEmail(e.target.value)}
                  placeholder="tanaka@example.com"
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-2 block">所属施設（複数選択可）*</label>
              <div className="flex flex-wrap gap-3">
                {facilities.map(f => (
                  <label key={f.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invFacilities.includes(f.id)}
                      onChange={e => {
                        setInvFacilities(prev =>
                          e.target.checked ? [...prev, f.id] : prev.filter(id => id !== f.id)
                        )
                        if (!e.target.checked && invPrimary === f.id) setInvPrimary('')
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">{f.id}</span>
                  </label>
                ))}
              </div>
            </div>

            {invFacilities.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 mb-2 block">主な所属 *</label>
                <div className="flex flex-wrap gap-3">
                  {invFacilities.map(fid => (
                    <label key={fid} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="primary"
                        value={fid}
                        checked={invPrimary === fid}
                        onChange={() => setInvPrimary(fid)}
                        className="border-gray-300"
                      />
                      <span className="text-sm text-gray-700">{fid}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowInvite(false)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {inviting ? '送信中...' : '招待メールを送る'}
              </button>
            </div>
          </form>
        )}

        {/* ── 施設フィルター ── */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterFacility('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${filterFacility === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
          >
            全施設
          </button>
          {facilities.map(f => (
            <button
              key={f.id}
              onClick={() => setFilterFacility(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${filterFacility === f.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
            >
              {f.id}
            </button>
          ))}
        </div>

        {/* ── スタッフ一覧 ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">名前</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">所属施設</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">12月の提出状況</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">期限延長</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(member => (
                <tr
                  key={member.id}
                  className={`border-b border-gray-50 transition-colors
                    ${!member.isActive ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}
                >
                  {/* 名前 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0"
                        style={{ background: avatarColor(member.id), color: '#444' }}
                      >
                        {initials(member.fullName)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">{member.fullName}</div>
                        <div className="text-xs text-gray-400">{member.email}</div>
                        {!member.isActive && (
                          <div className="text-xs text-red-400 mt-0.5">停止中</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 所属施設 */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {member.facilities.map(f => (
                        <span
                          key={f.facilityId}
                          className={`px-1.5 py-0.5 rounded text-xs font-medium
                            ${f.isPrimary
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'}`}
                        >
                          {f.facilityId}{f.isPrimary ? '（主）' : ''}
                        </span>
                      ))}
                      {member.facilities.length === 0 && (
                        <span className="text-gray-400 text-xs">未設定</span>
                      )}
                    </div>
                  </td>

                  {/* 提出状況 */}
                  <td className="px-4 py-3 text-xs">
                    {member.submittedAt ? (
                      <span className="text-green-700 font-medium">
                        ✓ 提出済 {fmtDatetime(member.submittedAt)}
                      </span>
                    ) : member.extendedUntil ? (
                      <span className="text-orange-600">未提出（延長中）</span>
                    ) : (
                      <span className="text-red-600 font-medium">未提出</span>
                    )}
                  </td>

                  {/* 期限延長 */}
                  <td className="px-4 py-3">
                    {extendingId === member.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={extendDate}
                          onChange={e => setExtendDate(e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => handleExtend(member.id, member.fullName)}
                          disabled={isPending}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                        >
                          決定
                        </button>
                        <button
                          onClick={() => setExtendingId(null)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {member.extendedUntil && (
                          <span className="text-orange-600 text-xs">
                            {fmtDateShort(member.extendedUntil)}まで
                          </span>
                        )}
                        {member.extendedUntil ? (
                          <button
                            onClick={() => handleCancelExtend(member.id, member.fullName)}
                            disabled={isPending}
                            className="text-xs text-gray-400 underline hover:text-red-500 disabled:opacity-50"
                          >
                            取り消す
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setExtendingId(member.id)
                              setExtendDate(defaultExtendDate())
                            }}
                            disabled={isPending || !member.isActive}
                            className="text-xs text-blue-600 underline hover:text-blue-800 disabled:opacity-30"
                          >
                            延長
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 操作 */}
                  <td className="px-4 py-3 text-right">
                    {member.id !== currentUserId && (
                      <div className="flex items-center justify-end gap-2">
                        {/* 管理者のみ：シフトに入るトグル */}
                        {member.role === 'admin' && (
                          <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                            <input
                              type="checkbox"
                              checked={member.isStaff}
                              disabled={isPending}
                              onChange={() => handleToggleIsStaff(member)}
                              className="rounded border-gray-300 w-3.5 h-3.5"
                            />
                            <span>シフト入る</span>
                          </label>
                        )}
                        <button
                          onClick={() => handleRoleToggle(member)}
                          disabled={isPending}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors
                            ${member.role === 'admin'
                              ? 'bg-gray-900 text-white hover:bg-gray-700'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                        >
                          {member.role === 'admin'
                            ? <><ShieldCheck className="w-3 h-3" />管理者</>
                            : <><User className="w-3 h-3" />スタッフ</>}
                        </button>
                        <button
                          onClick={() => handleToggleActive(member)}
                          disabled={isPending}
                          className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50
                            ${member.isActive
                              ? 'border-red-200 text-red-500 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                        >
                          {member.isActive ? '停止' : '復帰'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                    スタッフが見つかりません
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
