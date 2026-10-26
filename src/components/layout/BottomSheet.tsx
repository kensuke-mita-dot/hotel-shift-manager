'use client'

import { useEffect, useRef } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  /** 小見出しとして表示するサブタイトル */
  subtitle?: string
  title?: string
  children: React.ReactNode
}

/**
 * スマホ: 下から出るボトムシート
 * PC (sm以上): 画面中央のモーダル（最大幅440px）
 * 背景タップで閉じる
 */
export function BottomSheet({ open, onClose, subtitle, title, children }: BottomSheetProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // スクロールロック
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ESC で閉じる
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* 背景 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* シート本体 */}
      <div className="relative z-10 w-full sm:w-[440px] bg-white rounded-t-[12px] sm:rounded-[8px] max-h-[85vh] flex flex-col shadow-xl animate-in slide-in-from-bottom-4 sm:fade-in duration-200">

        {/* ドラッグハンドル（スマホのみ） */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-10 h-[4px] bg-hs-border rounded-full" />
        </div>

        {/* ヘッダー */}
        {(subtitle || title) && (
          <div className="px-4 pt-3 pb-3 border-b border-hs-border flex-shrink-0">
            {subtitle && <p className="text-xs text-hs-text-sub font-medium mb-0.5">{subtitle}</p>}
            {title   && <p className="text-base font-semibold text-hs-text">{title}</p>}
          </div>
        )}

        {/* コンテンツ（スクロール可） */}
        <div className="overflow-y-auto flex-1 p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
