import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import { Navbar } from '@/components/layout/Navbar'

export const metadata: Metadata = {
  title: 'HOTEL SHIFT',
  description: 'ホテル向けシフト管理システム',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'HOTEL SHIFT' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Navbar />
        <main>{children}</main>
        {/* 黒地・白文字・2.2秒 */}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: { background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '8px' },
            duration: 2200,
          }}
        />
      </body>
    </html>
  )
}
