import { signIn } from '@/lib/auth'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="w-full max-w-[420px] bg-card rounded-2xl py-12 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] text-center max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col max-md:justify-center">

      {/* 로고 + 태그라인 */}
      <div className="mb-10">
        <Image
          src="/images/logo.png"
          alt="우리 나이가 어때서"
          width={80}
          height={80}
          className="w-20 h-20 mx-auto mb-3 object-contain"
        />
        <p className="text-sm text-muted-foreground">
          우리의 삶을 잇다
        </p>
      </div>

      {/* 카카오 버튼 — 메인 CTA */}
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

      {/* 약관 + 둘러보기 */}
      <p className="text-caption text-muted-foreground leading-relaxed mt-5 mb-3">
        로그인 시{' '}
        <Link href="/terms" className="text-muted-foreground underline hover:text-primary">이용약관</Link>
        {' '}및{' '}
        <Link href="/privacy" className="text-muted-foreground underline hover:text-primary">개인정보처리방침</Link>
        에 동의하게 됩니다.
      </p>

      <Link
        href="/"
        className="text-caption text-muted-foreground/60 hover:text-muted-foreground transition-colors hover:underline underline-offset-2"
      >
        먼저 둘러볼게요
      </Link>
    </div>
  )
}
