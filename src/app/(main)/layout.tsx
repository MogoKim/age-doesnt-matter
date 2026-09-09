/* eslint-disable @typescript-eslint/no-unused-vars -- [DIAG-12] 임시 진단. MainLayout 만 복원해 client 경계 2개와 가른다. 10회씩 측정. */
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
      <MainLayout>{children}</MainLayout>
    </FontSizeProvider>
  )
}
