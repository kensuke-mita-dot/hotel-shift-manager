'use client'

import { useMemo } from 'react'
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DayAssignment, ShiftSlot } from '@/types'
import { SLOT_META } from '@/types'
import { validateDayAssignment } from '@/lib/validation'

interface MonthlyMatrixProps {
  year:        number
  month:       number   // 1-12
  assignments: DayAssignment[]
  onSelectDay: (date: string) => void
}

const SLOTS: ShiftSlot[] = ['morning', 'evening', 'night']

export function MonthlyMatrix({ year, month, assignments, onSelectDay }: MonthlyMatrixProps) {
  const days = useMemo(() => {
    const start = startOfMonth(new Date(year, month - 1))
    const end   = endOfMonth(start)
    return eachDayOfInterval({ start, end })
  }, [year, month])

  const assignmentMap = useMemo(() => {
    const m = new Map<string, DayAssignment>()
    assignments.forEach(a => m.set(a.date, a))
    return m
  }, [assignments])

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse w-full min-w-[900px]">
        <thead>
          <tr>
            <th className="w-10 text-left px-2 py-2 text-xs text-gray-400 font-medium sticky left-0 bg-white z-10">スロット</th>
            {days.map(d => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <th
                  key={d.toISOString()}
                  className={cn(
                    'min-w-[44px] px-1 py-1.5 text-center text-xs font-medium',
                    isWeekend ? 'text-red-400' : 'text-gray-500',
                  )}
                >
                  <div>{d.getDate()}</div>
                  <div className="text-[10px] font-normal opacity-70">
                    {format(d, 'E', { locale: ja })}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map(slot => (
            <tr key={slot} className="border-t border-gray-100">
              <td className="sticky left-0 bg-white z-10 px-2 py-2">
                <div className="flex items-center gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: SLOT_META[slot].color }}
                  />
                  <span className="text-xs text-gray-600">{SLOT_META[slot].label}</span>
                </div>
              </td>
              {days.map(d => {
                const dateStr = format(d, 'yyyy-MM-dd')
                const day = assignmentMap.get(dateStr)
                const count = day ? day[slot].length : 0
                const { ngPatterns } = day ? validateDayAssignment(day) : { ngPatterns: [] }
                const hasNG = slot === 'morning' && ngPatterns.length > 0
                const isEmpty = count === 0

                return (
                  <td
                    key={dateStr}
                    className={cn(
                      'text-center px-1 py-1.5 cursor-pointer transition-colors',
                      isEmpty ? 'bg-red-50' : hasNG ? 'bg-orange-50' : 'hover:bg-gray-50',
                    )}
                    onClick={() => onSelectDay(dateStr)}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={cn(
                        'text-xs font-medium',
                        isEmpty ? 'text-red-500' : hasNG ? 'text-orange-600' : 'text-gray-700',
                      )}>
                        {count}
                      </span>
                      {(isEmpty || hasNG) && (
                        <AlertTriangle className={cn(
                          'w-2.5 h-2.5',
                          isEmpty ? 'text-red-400' : 'text-orange-400',
                        )} />
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 凡例 */}
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100" />
          <span>欠員（0名）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-100" />
          <span>夜→朝NG</span>
        </div>
      </div>
    </div>
  )
}
