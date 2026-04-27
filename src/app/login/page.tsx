import type { Metadata } from 'next'
import LoginForm from '@/components/features/login/LoginForm'

export const metadata: Metadata = {
  title: '로그인',
  description: '카카오 계정으로 간편하게 로그인하세요',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/login` },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl = '/' } = await searchParams

  return (
    // 모바일: 전체 화면 / 데스크탑: 중앙 정렬 카드
    <div className="md:min-h-dvh md:flex md:items-center md:justify-center md:bg-background md:px-4 md:py-12">
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  )
}
