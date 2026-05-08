import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getAdminSession } from '@/lib/admin-auth'

const AdminSidebar = dynamic(() => import('@/components/admin/AdminSidebar'), {
  loading: () => <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 bg-zinc-100 animate-pulse" />,
})
const AdminHeader = dynamic(() => import('@/components/admin/AdminHeader'), {
  loading: () => <div className="h-16 bg-zinc-100 animate-pulse" />,
})

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AdminSidebar nickname={session.nickname} />

      <div className="lg:pl-60">
        <AdminHeader />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
