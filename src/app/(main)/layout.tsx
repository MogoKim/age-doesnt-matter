/* eslint-disable @typescript-eslint/no-unused-vars -- [DIAG-5] 임시 진단. MainLayout 만 복원해 client 경계 2개와 분리한다. 최종 diff 에서 제거한다. */
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import { MainGroupClientTop, MainGroupClientBottom } from '@/components/common/MainGroupClientOnly'

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // [DIAG-5] MainLayout 만 복원. MainGroupClientTop/Bottom 은 여전히 제거 상태.
  return (
    <FontSizeProvider>
      <MainLayout>{children}</MainLayout>
    </FontSizeProvider>
  )
}
