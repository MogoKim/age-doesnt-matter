import type { Metadata } from 'next'
import OnboardingForm from '@/components/features/onboarding/OnboardingForm'

export const metadata: Metadata = {
  title: '\uD504\uB85C\uD544 \uC124\uC815',
  description: '\uC6B0\uB098\uC5B4\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uB2C9\uB124\uC784\uC744 \uC124\uC815\uD574 \uC8FC\uC138\uC694',
}

export default function OnboardingPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-6 bg-background md:px-6 md:py-12">
      <OnboardingForm />
    </div>
  )
}
