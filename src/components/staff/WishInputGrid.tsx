'use client'

import { useState, useTransition, useCallback } from 'react'
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { saveWishes } from '@/app/actions/wishes'
import { WISH_LABEL, SLOT_META } from '@/types'
import type { WishType, ShiftSlot } from '@/types'

const WISH_OPTIONS: WishType[] = ['morning', 'evening', 'night', 'off']

const WISH_STYLE: Record<WishType, string> = {
  morning: 'bg-amber-100 text-amber-800 border-amber-300 font-medium',
  evening: 'bg-blue-100 text-blue-800 border-blue-300 font-medium',
  night:   'bg-purple-100 text-purple-800 border-purple-300 font-medium',
  off:     'bg-gray-100 text-gray-500 border-gray-200',
}

interface WishInputGridProps {
  year:         number
  month:        number
  staffId:      string
  initialWishes: Record<string, WishType>
}

export function WishInputGrid({ year, month, staffId, initialWishes }: WishInputGridProps) {
  const days = eachDayOfInterval({
    start: startOfMonth(new Date(year, month - 1)),
    end:   endOfMonth(new Date(year, month - 1)),
  })

  // 初期値：Supabaseから取得した hopes をベースに、未設定日は 'off'
  const [wishes, setWishes] = useState<Record<string, WishType>>(() => {
    const base = Object.fromEntries(days.map(d => [format(d, 'yyyy-MM-dd'), 'off' as WishType]))
    return { ...base, ...initialWishes }
  })

  const [isPending, startTransition] = useTransition()
  const [isSaving, setIsSaving] = useState(false)

  const setWish = (date: string, wish: WishType) =>
    setWishes(prev => ({ ...prev, [date]: wish }))

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await saveWishes(staffId, wishes)
      if (result.error) {
        toast.error(`保存に失敗しました: ${result.error}`)
      } else {
        toast.success(`${year}年${month}月の希望を保存しました`)
        startTransition(() => {})  // Server Componentを再レンダリング
      }
    } catch (e) {
      toast.error('保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }, [staffId, wishes, year, month, startTransition])

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {year}年{month}月の希望入力
        </h2>
        <Button onClick={handleSave} disabled={isSaving || isPending}>
          {isSaving ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />保存する</>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        {days.map(d => {
          const dateStr   = format(d, 'yyyy-MM-dd')
          const wish      = wishes[dateStr]
          const isWeekend = d.getDay() === 0 || d.getDay() === 6

          return (
            <div
              key={dateStr}
              className="flex items-center gap-3 py-2 border-b border-gray-100"
            >
              <div className={cn(
                'w-20 text-sm flex-shrink-0',
                isWeekend ? 'text-red-500 font-medium' : 'text-gray-600',
              )}>
                {format(d, 'M/d（E）', { locale: ja })}
              </div>

              <div className="flex gap-2 flex-wrap">
                {WISH_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setWish(dateStr, opt)}
                    disabled={isSaving || isPending}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs border transition-all',
                      wish === opt
                        ? WISH_STYLE[opt]
                        : 'border-gray-200 text-gray-400 hover:border-gray-300',
                    )}
                  >
                    {WISH_LABEL[opt]}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
