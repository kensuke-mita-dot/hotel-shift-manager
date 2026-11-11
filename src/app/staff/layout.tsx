import { StaffTabs } from '@/components/staff/StaffTabs'

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StaffTabs />
      <div className="max-w-[600px] mx-auto">
        {children}
      </div>
    </>
  )
}
