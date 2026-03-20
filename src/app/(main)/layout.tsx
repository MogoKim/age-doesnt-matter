import { auth } from '@/lib/auth'
import MainLayout from '@/components/layouts/MainLayout'

export default async function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const nickname = session?.user?.nickname

  return (
    <MainLayout isLoggedIn={isLoggedIn} nickname={nickname}>
      {children}
    </MainLayout>
  )
}
