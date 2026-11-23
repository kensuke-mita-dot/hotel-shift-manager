'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * 押すと text をクリップボードにコピーするボタン。
 * 金額は「715085」のような数字だけで渡すと、スプレッドシートにそのまま貼れる。
 */
export function CopyButton({ text, label, children, className }: {
  text: string
  /** 読み上げ・ツールチップ用（例：「BHJの合計をコピー」） */
  label: string
  /** 指定するとアイコンの横に文字も出す（例：「表をコピー」） */
  children?: React.ReactNode
  className?: string
}) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      toast.success('コピーしました')
      setTimeout(() => setDone(false), 1500)
    } catch {
      toast.error('コピーできませんでした。文字を選んでコピーしてください')
    }
  }
  const Icon = done ? Check : Copy
  return (
    <button type="button" onClick={copy} title={label} aria-label={label}
      className={cn('inline-flex items-center gap-1 rounded text-hs-text-lighter hover:text-hs-blue hover:bg-hs-blue-bg transition-colors',
        children ? 'h-8 px-2 text-xs border border-hs-border bg-white' : 'h-7 w-7 justify-center', className)}>
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}
