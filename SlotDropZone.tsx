'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'
import { SLOT_META, WISH_LABEL } from '@/types'
import type { StaffWithWish, ShiftSlot, WishType } from '@/types'
import { cn } from '@/lib/utils'

interface SlotDropZoneProps {
  slot:    ShiftSlot
  staff:   StaffWithWish[]
  onDrop:  (staff: StaffWithWish, from: ShiftSlot | 'pool', to: ShiftSlot | 'pool') => void
  isEmpty: boolean
}

const AVATAR_COLORS = [
  '#9FE1CB','#B5D4F4','#F5C4B3','#CECBF6',
  '#FAC775','#F4C0D1','#C0DD97','#D3D1C7',
]

function avatarColor(staffId: string) {
  const n = parseInt(staffId.replace(/\D/g, '')) || 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? parts[0].charAt(0) + parts[1].charAt(0)
    : name.slice(0, 2)
}

const WISH_BORDER: Record<WishType, string> = {
  morning: 'border-l-2 border-l-amber-400',
  evening: 'border-l-2 border-l-blue-400',
  night:   'border-l-2 border-l-purple-400',
  off:     '',
}

export function SlotDropZone({ slot, staff, onDrop, isEmpty }: SlotDropZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    zoneRef.current?.classList.add('bg-blue-50')
  }
  const handleDragLeave = () => {
    zoneRef.current?.classList.remove('bg-blue-50')
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    zoneRef.current?.classList.remove('bg-blue-50')

    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    const { staff: s, fromSlot } = JSON.parse(raw) as {
      staff: StaffWithWish
      fromSlot: ShiftSlot | 'pool'
    }
    onDrop(s, fromSlot, slot)
  }

  return (
    <div
      ref={zoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'min-h-[72px] p-2 flex flex-wrap gap-2 content-start transition-colors',
        isEmpty && 'bg-red-50',
      )}
    >
      {staff.map(s => {
        const isNG = slot === 'morning' && s.prevSlot === 'night'
        return (
          <StaffChip
            key={s.staffId}
            staff={s}
            fromSlot={slot}
            isNG={isNG}
            onRemove={() => onDrop(s, slot, 'pool')}
          />
        )
      })}
    </div>
  )
}

// ─── チップ ────────────────────────────────────────────────
interface StaffChipProps {
  staff:    StaffWithWish
  fromSlot: ShiftSlot | 'pool'
  isNG:     boolean
  onRemove: () => void
}

function StaffChip({ staff, fromSlot, isNG, onRemove }: StaffChipProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ staff, fromSlot }),
    )
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      title={isNG ? '夜勤明けの朝勤アサインはNGです' : WISH_LABEL[staff.wish]}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2 py-1 cursor-grab active:cursor-grabbing',
        'border text-sm select-none transition-opacity hover:opacity-90',
        isNG
          ? 'bg-red-50 border-red-300 text-red-700'
          : 'bg-gray-50 border-gray-200 text-gray-800',
      )}
    >
      {/* アバター */}
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
        style={{ background: avatarColor(staff.staffId), color: '#444' }}
      >
        {initials(staff.fullName)}
      </div>
      <span>{staff.fullName}</span>
      {isNG && <span className="text-[10px] font-medium text-red-500 ml-0.5">NG</span>}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="ml-0.5 w-4 h-4 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-400"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}
