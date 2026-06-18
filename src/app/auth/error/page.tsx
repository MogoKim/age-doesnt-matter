import Link from 'next/link'
import { cookies } from 'next/headers'
import { logAuthFailure } from '@/lib/auth-monitor'
import AppAuthErrorRedirect from './AppAuthErrorRedirect'

interface Props {
  searchParams: { error?: string }
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const error = searchParams.error ?? 'unknown'

  // FemaleOnly는 여성 전용 정책 안내(시스템 오류 아님) → oauth_callback_error로 기록하지 않음.
  // (signIn 차단 시 gender_blocked로 이미 1회 기록됨)
  if (error !== 'FemaleOnly') {
    await logAuthFailure('oauth_callback_error', error).catch(() => {})
  }

  // 앱(Capacitor) 플로우(app_login 쿠키)면 결과를 딥링크로 앱에 복귀 — 웹/TWA는 기존 UI 그대로.
  const isAppFlow = (await cookies()).get('app_login')?.value === '1'
  if (isAppFlow) {
    return <AppAuthErrorRedirect error={error} />
  }

  // 여성 전용 안내 (신규 남성 차단)
  if (error === 'FemaleOnly') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="text-5xl">🌸</div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              우나어는 여성 전용 커뮤니티예요
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              카카오 계정 성별이 남성으로 확인되어 가입이 제한되었습니다.
              <br />
              성별 정보가 잘못되어 있다면 카카오 계정 정보를 확인하거나 문의해 주세요.
            </p>
            <p className="text-base text-muted-foreground pt-2">
              문의: korea.age.not.matter@gmail.com
            </p>
          </div>

          <Link
            href="/"
            className="flex items-center justify-center w-full h-[52px] rounded-xl bg-primary text-white text-lg font-bold transition-colors"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  // 그 외 일반 오류 (기존 동작 유지)
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
