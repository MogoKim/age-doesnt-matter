import MainLayout from '@/components/layouts/MainLayout'

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MainLayout>{children}</MainLayout>
}
