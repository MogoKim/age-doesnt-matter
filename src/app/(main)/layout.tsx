/* eslint-disable @typescript-eslint/no-unused-vars -- [DIAG-4] 임시 진단. MainLayout 과 client 경계를 빼고 children 만 렌더해 hydration 원인을 이분 탐색한다. 최종 diff 에서 제거한다. */
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import { MainGroupClientTop, MainGroupClientBottom } from '@/components/common/MainGroupClientOnly'

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // [DIAG-4] MainLayout · MainGroupClientTop · MainGroupClientBottom 제거
  return <FontSizeProvider>{children}</FontSizeProvider>
}
