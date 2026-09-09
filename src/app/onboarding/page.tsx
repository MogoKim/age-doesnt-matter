import type { Metadata } from 'next'
import OnboardingForm from '@/components/features/onboarding/OnboardingFormLazy'

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
    <div className="bg-background max-md:min-h-dvh md:flex md:min-h-dvh md:flex-col md:items-center md:justify-center md:px-6 md:py-12">
      <OnboardingForm callbackUrl={callbackUrl} />
    </div>
  )
}
