import { AdminTabs } from '@/components/admin/AdminTabs'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminTabs />
      <div className="max-w-[1680px] mx-auto">
        {children}
      </div>
    </>
  )
}
