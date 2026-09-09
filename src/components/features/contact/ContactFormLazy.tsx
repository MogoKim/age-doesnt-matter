'use client'

import dynamic from 'next/dynamic'

/**
 * `ContactForm` 지연 로딩 client 경계 — Next 16 전환(2026-09-09).
 * Server Component(`/contact`)에서 `ssr: false` 를 쓸 수 없어 선언만 옮겼다.
 * skeleton 과 props 는 그대로다.
 */
const ContactForm = dynamic(
  () => import('@/components/features/contact/ContactForm'),
  { loading: () => <div className="h-48 animate-pulse rounded bg-muted" />, ssr: false },
)

export default function ContactFormLazy(props: React.ComponentProps<typeof ContactForm>) {
  return <ContactForm {...props} />
}
