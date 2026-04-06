'use client'

import { useRef } from 'react'
import { WISH_LABEL, SLOT_META } from '@/types'
import type { StaffWithWish, ShiftSlot, WishType } from '@/types'

interface StaffPoolProps {
  staff:   StaffWithWish[]
  onDrop:  (staff: StaffWithWish, from: ShiftSlot | 'pool', to: 'pool') => void
}

const AVATAR_COLORS = [
  '#9FE1CB','#B5D4F4','#F5C4B3','#CECBF6',
  '#FAC775','#F4C0D1','#C0DD97','#D3D1C7',
]
const avatarColor = (id: string) => AVATAR_COLORS[parseInt(id.replace(/\D/g, '')) % AVATAR_COLORS.length]
const initials = (name: string) => {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)
}

const WISH_BORDER_STYLE: Record<WishType, string> = {
  morning: 'border-l-2 border-l-amber-400',
  evening: 'border-l-2 border-l-blue-400',
  night:   'border-l-2 border-l-purple-400',
  off:     'border-l-2 border-l-gray-200 opacity-60',
}

export function StaffPool({ staff, onDrop }: StaffPoolProps) {
  const poolRef = useRef<HTMLDivElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    poolRef.current?.classList.add('bg-gray-50')
  }
  const handleDragLeave = () => poolRef.current?.classList.remove('bg-gray-50')
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    poolRef.current?.classList.remove('bg-gray-50')
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    const { staff: s, fromSlot } = JSON.parse(raw) as { staff: StaffWithWish; fromSlot: ShiftSlot | 'pool' }
    if (fromSlot === 'pool') return
    onDrop(s, fromSlot, 'pool')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">未配置スタッフ</span>
        <span className="text-xs text-gray-400">{staff.length}名</span>
      </div>

      <div
        ref={poolRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="p-2 space-y-1 min-h-[60px] transition-colors"
      >
        {staff.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">全員配置済み</p>
        )}
        {staff.map(s => (
          <PoolItem key={s.staffId} staff={s} />
        ))}
      </div>
    </div>
  )
}

function PoolItem({ staff }: { staff: StaffWithWish }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ staff, fromSlot: 'pool' }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing
        hover:bg-gray-50 select-none transition-colors ${WISH_BORDER_STYLE[staff.wish]}`}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
        style={{ background: avatarColor(staff.staffId), color: '#444' }}
      >
        {initials(staff.fullName)}
      </div>
      <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{staff.fullName}</span>
      <span className="text-[11px] text-gray-400 flex-shrink-0">{WISH_LABEL[staff.wish]}</span>
    </div>
  )
}
