import { signIn } from '@/lib/auth'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginForm({
  callbackUrl,
  userCount,
}: {
  callbackUrl: string
  userCount: number
}) {
  const formattedCount = userCount.toLocaleString('ko-KR')

  return (
    <div className="w-full max-w-[420px] bg-card rounded-2xl py-10 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] text-center max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col max-md:justify-center">

      {/* 1. 로고 + 브랜드 헤드카피 */}
      <div className="mb-5">
        <Image
          src="/images/logo.png"
          alt="우리 나이가 어때서"
          width={80}
          height={80}
          className="w-20 h-20 mx-auto mb-4 object-contain"
        />
        <h1 className="text-2xl font-bold text-foreground mb-2">우리 나이가 어때서</h1>
        <p className="text-body text-foreground/80 leading-snug font-medium">
          우리의 삶을 잇다
        </p>
      </div>

      {/* 2. Social Proof */}
      <div className="flex justify-center mb-5">
        <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-caption font-semibold">
          <span>👥</span>
          <span>지금 {formattedCount}명이 함께해요</span>
        </span>
      </div>

      {/* 3. 혜택 3개 아이콘 행 */}
      <div className="grid grid-cols-3 gap-3 mb-7 px-2">
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-2xl">✍️</span>
          <span className="text-caption text-muted-foreground leading-tight">우리 또래<br />이야기</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-2xl">📰</span>
          <span className="text-caption text-muted-foreground leading-tight">건강·생활<br />정보</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-2xl">❤️</span>
          <span className="text-caption text-muted-foreground leading-tight">따뜻한<br />공감</span>
        </div>
      </div>

      {/* 4. 카카오 버튼 — 메인 CTA */}
      <form
        action={async () => {
          'use server'
          await signIn('kakao', { redirectTo: callbackUrl })
        }}
      >
        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full h-[56px] px-6 border-none rounded-xl bg-[var(--kakao-bg)] text-[var(--kakao-text)] text-base font-bold cursor-pointer transition-all shadow-[0_2px_8px_rgba(254,229,0,0.3)] hover:brightness-95 hover:shadow-[0_4px_14px_rgba(254,229,0,0.4)] hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="text-[22px] shrink-0">💬</span>
          카카오톡으로 시작하기
        </button>
      </form>

      {/* 신규 사용자 안내 */}
      <p className="text-caption text-muted-foreground mt-3 mb-5">
        처음이세요? 버튼 하나로 바로 가입돼요 😊
      </p>

      {/* 5. 약관 동의 안내 */}
      <p className="text-caption text-muted-foreground leading-relaxed mb-4">
        로그인 시{' '}
        <Link href="/terms/service" className="text-muted-foreground underline hover:text-primary">이용약관</Link>
        {' '}및{' '}
        <Link href="/terms/privacy" className="text-muted-foreground underline hover:text-primary">개인정보처리방침</Link>
        에 동의하게 됩니다.
      </p>

      {/* 둘러보기 — 텍스트 링크로 격하 */}
      <Link
        href="/"
        className="text-caption text-muted-foreground/60 hover:text-muted-foreground transition-colors hover:underline underline-offset-2"
      >
        먼저 둘러볼게요
      </Link>
    </div>
  )
}
