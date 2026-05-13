import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

const OnboardingForm = dynamic(
  () => import('@/components/features/onboarding/OnboardingForm'),
  { loading: () => <div className="h-64 animate-pulse rounded bg-zinc-100" />, ssr: false },
)

export const metadata: Metadata = {
  title: '프로필 설정',
  description: '우나어에서 사용할 닉네임을 설정해 주세요',
}

interface PageProps {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { callbackUrl } = await searchParams
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-6 bg-background md:px-6 md:py-12">
      <OnboardingForm callbackUrl={callbackUrl} />
    </div>
  )
}
