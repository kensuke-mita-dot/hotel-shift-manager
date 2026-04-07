'use client'

import { useState, useCallback, useTransition } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Save, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

import { SlotDropZone } from '@/components/admin/SlotDropZone'
import { StaffPool }    from '@/components/admin/StaffPool'
import { validateDayAssignment } from '@/lib/validation'
import { fetchDayData, saveShifts } from '@/app/actions/shifts'
import { SLOT_META } from '@/types'
import type { DayAssignment, StaffWithWish, ShiftSlot } from '@/types'

interface Props {
  initialDate:       string
  initialPool:       StaffWithWish[]
  initialAssignment: DayAssignment
}

export function DailyAdjustClient({ initialDate, initialPool, initialAssignment }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date(initialDate))
  const [assignment,  setAssignment]  = useState<DayAssignment>(initialAssignment)
  const [pool,        setPool]        = useState<StaffWithWish[]>(initialPool)
  const [isPending,   startTransition] = useTransition()
  const [isSaving,    setIsSaving]    = useState(false)

  // ─── 日付変更：Supabaseから再取得 ──────────────────────────
  const changeDate = (dir: 1 | -1) => {
    const next = dir === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1)
    setCurrentDate(next)

    // 楽観的にリセット
    const dateStr = format(next, 'yyyy-MM-dd')
    setAssignment({ date: dateStr, morning: [], evening: [], night: [] })
    setPool([])

    startTransition(async () => {
      const result = await fetchDayData(dateStr)
      if (result.error) {
        toast.error(`データ取得エラー: ${result.error}`)
        return
      }
      setAssignment(result.assignment)
      setPool(result.pool)
    })
  }

  // ─── ドロップ処理 ───────────────────────────────────────────
  const handleDrop = useCallback((
    staff:    StaffWithWish,
    fromSlot: ShiftSlot | 'pool',
    toSlot:   ShiftSlot | 'pool',
  ) => {
    if (fromSlot === toSlot) return

    setAssignment(prev => {
      const next = { ...prev }
      if (fromSlot !== 'pool') {
        next[fromSlot] = next[fromSlot].filter(s => s.staffId !== staff.staffId)
      }
      if (toSlot !== 'pool') {
        next[toSlot] = [...next[toSlot], staff]
      }
      return next
    })

    setPool(prev => {
      if (fromSlot === 'pool' && toSlot !== 'pool') {
        return prev.filter(s => s.staffId !== staff.staffId)
      }
      if (fromSlot !== 'pool' && toSlot === 'pool') {
        return [...prev, staff]
      }
      return prev
    })
  }, [])

  // ─── 保存 ───────────────────────────────────────────────────
  const handleSave = async () => {
    const validation = validateDayAssignment(assignment)
    if (!validation.isValid) {
      const msgs = [
        validation.hasEmptySlot && '空きスロットがあります',
        ...validation.ngPatterns.map(p => `${p.staffName}：夜勤明け朝勤NG`),
      ].filter(Boolean).join(' / ')
      toast.warning(msgs, { duration: 5000 })
      return
    }

    setIsSaving(true)
    const result = await saveShifts(assignment)
    setIsSaving(false)

    if (result.error) {
      toast.error(`保存に失敗しました: ${result.error}`)
      return
    }
    toast.success(`${format(currentDate, 'M月d日', { locale: ja })}のシフトを保存しました`)
  }

  const validation = validateDayAssignment(assignment)
  const isLoading  = isPending

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">日次シフト調整</h1>
            <p className="text-sm text-gray-500 mt-0.5">スタッフをスロットへドラッグしてアサイン</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeDate(-1)} disabled={isLoading}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-base font-medium min-w-[140px] text-center flex items-center justify-center gap-1.5">
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              {format(currentDate, 'M月d日（E）', { locale: ja })}
            </span>
            <Button variant="outline" size="icon" onClick={() => changeDate(1)} disabled={isLoading}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* メインレイアウト */}
        <div className="grid grid-cols-[1fr_220px] gap-4">

          {/* スロットカラム */}
          <div className="space-y-3">
            {(['morning', 'evening', 'night'] as ShiftSlot[]).map(slot => {
              const meta    = SLOT_META[slot]
              const staff   = assignment[slot]
              const isEmpty = staff.length === 0

              return (
                <div
                  key={slot}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: meta.color }}
                    />
                    <span className="text-sm font-medium text-gray-800">{meta.label}</span>
                    <span className="text-xs text-gray-400 ml-1">{meta.time}</span>
                    <Badge
                      variant={isEmpty ? 'destructive' : 'secondary'}
                      className="ml-auto text-xs"
                    >
                      {staff.length}名
                    </Badge>
                  </div>

                  <SlotDropZone
                    slot={slot}
                    staff={staff}
                    onDrop={handleDrop}
                    isEmpty={isEmpty}
                  />
                </div>
              )
            })}

            {/* 警告エリア */}
            {!validation.isValid && (
              <div className="space-y-2">
                {validation.hasEmptySlot && (
                  <WarningBanner text="空きスロットがあります（各スロット最低1名必要）" />
                )}
                {validation.ngPatterns.map(p => (
                  <WarningBanner
                    key={p.staffName}
                    text={`${p.staffName}：夜勤明けの朝勤アサインはNGです`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* スタッフプール */}
          <div className="space-y-3">
            <StaffPool staff={pool} onDrop={handleDrop} />

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={!validation.isValid || isSaving || isLoading}
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />この日のシフトを保存</>
              )}
            </Button>

            {/* 凡例 */}
            <div className="text-xs text-gray-400 space-y-1 pt-2">
              <p className="font-medium text-gray-500 mb-1.5">希望カラー</p>
              {(['morning', 'evening', 'night', 'off'] as const).map(w => (
                <div key={w} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: w === 'off' ? '#ccc' : SLOT_META[w as ShiftSlot]?.color }}
                  />
                  <span>
                    {w === 'morning' ? '朝希望' : w === 'evening' ? '夕希望' : w === 'night' ? '夜希望' : '休希望'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function WarningBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      {text}
    </div>
  )
}
