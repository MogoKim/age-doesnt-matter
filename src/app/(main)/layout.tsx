/* eslint-disable @typescript-eslint/no-unused-vars -- [DIAG-11] 임시 진단. DIAG-4 재검증 — MainLayout·client 경계 제거를 10회씩 재측정한다. */
import MainLayout from '@/components/layouts/MainLayout'
import FontSizeProvider from '@/components/common/FontSizeProvider'
import { MainGroupClientTop, MainGroupClientBottom } from '@/components/common/MainGroupClientOnly'

export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <FontSizeProvider>{children}</FontSizeProvider>
}
