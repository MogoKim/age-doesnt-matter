import type { Metadata } from 'next'
import LoginForm from '@/components/features/login/LoginForm'

export const metadata: Metadata = {
  title: '로그인',
  description: '카카오 계정으로 간편하게 로그인하세요',
  alternates: { canonical: 'https://age-doesnt-matter.com/login' },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl = '/' } = await searchParams

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-6 bg-background md:px-6 md:py-12">
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  )
}
