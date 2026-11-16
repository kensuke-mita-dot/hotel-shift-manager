import { Loader2 } from 'lucide-react'

/**
 * ページ切り替え中の表示（loading.tsx から使う）。
 * タブを押した瞬間にこれが出て、データが揃いしだい本来の画面に置き換わる。
 */
export function PageLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-hs-text-sub">
        <Loader2 className="w-4 h-4 animate-spin" />
        読み込み中…
      </div>
      <div className="h-10 w-48 rounded-btn bg-hs-gray-light" />
      <div className="h-64 rounded-card border border-hs-border bg-white" />
    </div>
  )
}
