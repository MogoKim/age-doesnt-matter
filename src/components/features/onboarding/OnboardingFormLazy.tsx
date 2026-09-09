'use client'

import dynamic from 'next/dynamic'

/**
 * `OnboardingForm` 지연 로딩 client 경계 — Next 16 전환(2026-09-09).
 * Server Component(`/onboarding`)에서 `ssr: false` 를 쓸 수 없어 선언만 옮겼다.
 * skeleton 과 props(callbackUrl) 는 그대로다.
 */
const OnboardingForm = dynamic(
  () => import('@/components/features/onboarding/OnboardingForm'),
  { loading: () => <div className="h-64 animate-pulse rounded bg-muted" />, ssr: false },
)

export default function OnboardingFormLazy(props: React.ComponentProps<typeof OnboardingForm>) {
  return <OnboardingForm {...props} />
}
