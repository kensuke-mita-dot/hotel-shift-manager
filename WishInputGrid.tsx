'use client'

import { useState } from 'react'
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
  year:    number
  month:   number
  staffId: string
}

export function WishInputGrid({ year, month, staffId }: WishInputGridProps) {
  const days = eachDayOfInterval({
    start: startOfMonth(new Date(year, month - 1)),
    end:   endOfMonth(new Date(year, month - 1)),
  })

  const [wishes, setWishes] = useState<Record<string, WishType>>(() =>
    Object.fromEntries(days.map(d => [format(d, 'yyyy-MM-dd'), 'off']))
  )

  const setWish = (date: string, wish: WishType) =>
    setWishes(prev => ({ ...prev, [date]: wish }))

  const handleSave = async () => {
    // TODO: Supabase upsert
    // const rows = Object.entries(wishes).map(([wish_date, wish]) => ({
    //   staff_id: staffId, wish_date, wish
    // }))
    // await supabase.from('shift_wishes').upsert(rows, { onConflict: 'staff_id,wish_date' })
    toast.success('希望を保存しました')
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {year}年{month}月の希望入力
        </h2>
        <Button onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          保存する
        </Button>
      </div>

      <div className="space-y-2">
        {days.map(d => {
          const dateStr = format(d, 'yyyy-MM-dd')
          const wish    = wishes[dateStr]
          const isWeekend = d.getDay() === 0 || d.getDay() === 6

          return (
            <div
              key={dateStr}
              className="flex items-center gap-3 py-2 border-b border-gray-100"
            >
              <div className={cn(
                'w-20 text-sm',
                isWeekend ? 'text-red-500 font-medium' : 'text-gray-600',
              )}>
                {format(d, 'M/d（E）', { locale: ja })}
              </div>

              <div className="flex gap-2">
                {WISH_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setWish(dateStr, opt)}
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
