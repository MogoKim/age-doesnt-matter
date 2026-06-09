import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginForm from '@/components/features/login/LoginForm'

export const metadata: Metadata = {
  title: '로그인',
  description: '카카오로 1초, 신중년 여성 커뮤니티 우나어 시작하기.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/login` },
}

export default function LoginPage() {
  return (
    // 모바일: 전체 화면 / 데스크탑: 중앙 정렬 카드
    <div className="md:min-h-dvh md:flex md:items-center md:justify-center md:bg-background md:px-4 md:py-12">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
