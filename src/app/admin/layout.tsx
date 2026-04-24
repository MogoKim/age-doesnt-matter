import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: '어드민 | 우나어',
    template: '%s | 우나어 어드민',
  },
  robots: { index: false, follow: false },
}

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
