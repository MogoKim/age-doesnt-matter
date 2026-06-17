import type { Metadata } from 'next'
import { AdminInternalFlag } from '@/components/admin/AdminInternalFlag'

export const metadata: Metadata = {
  title: {
    default: '어드민 | 우나어',
    template: '%s | 우나어 어드민',
  },
  robots: { index: false, follow: false },
}

// 어드민 글씨크기 격리 — 시니어 글씨크기 토글(html[data-font-size])이 admin에 안 먹게
//   --text-* 변수를 NORMAL 고정값으로 재정의(인라인 style이 html[data-font-size] override).
//   admin은 창업자 PC 전용이라 글씨 확대 실효 없음 + 레이아웃 안정. (값은 globals :root NORMAL과 동일)
const ADMIN_FONT_NORMAL = {
  '--text-caption': '0.9375rem', // 15px
  '--text-sm': '1rem', // 16px
  '--text-body': '1.125rem', // 18px
  '--text-title': '1.25rem', // 20px
  '--text-heading': '1.5rem', // 24px
  '--text-display': '1.75rem', // 28px
} as React.CSSProperties

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={ADMIN_FONT_NORMAL}>
      <AdminInternalFlag />
      {children}
    </div>
  )
}
