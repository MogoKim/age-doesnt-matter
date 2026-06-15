import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginForm from '@/components/features/login/LoginForm'

export const metadata: Metadata = {
  title: '로그인',
  description: '카카오로 1초, 40대 50대 60대 여성 커뮤니티 우나어 시작하기.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'}/login` },
}

export default function LoginPage() {
  return (
    // 모바일: 전체 화면 / 데스크탑: 중앙 정렬 카드 (슬라이드 카드가 sm: 기준이라 중앙정렬도 sm:로 일치)
    <div className="sm:min-h-dvh sm:flex sm:items-center sm:justify-center sm:bg-background sm:px-4 sm:py-12">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
