import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import { MainGroupClientTop, MainGroupClientBottom } from '@/components/common/MainGroupClientOnly'

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <FontSizeProvider>
      <MainGroupClientTop />
      <MainLayout>{children}</MainLayout>
      <MainGroupClientBottom />
    </FontSizeProvider>
  )
}
