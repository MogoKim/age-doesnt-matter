import Link from 'next/link'
import { logAuthFailure } from '@/lib/auth-monitor'

interface Props {
  searchParams: { error?: string }
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const error = searchParams.error ?? 'unknown'

  await logAuthFailure('oauth_callback_error', error).catch(() => {})

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="text-5xl">😔</div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            로그인 중 문제가 생겼어요
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            카카오 로그인 처리 중 오류가 발생했습니다.
            <br />
            다시 한번 시도해 주세요.
          </p>
        </div>

        <Link
          href="/login"
          className="flex items-center justify-center w-full h-[52px] rounded-xl bg-[#FEE500] text-[#191919] text-lg font-bold hover:bg-[#F5DC00] transition-colors"
        >
          카카오로 다시 로그인
        </Link>

        <Link
          href="/"
          className="block text-base text-muted-foreground underline underline-offset-4"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
