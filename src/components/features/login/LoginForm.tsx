import { signIn } from '@/lib/auth'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="w-full max-w-[420px] bg-card rounded-2xl p-12 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] text-center max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col max-md:justify-center">
      {/* 로고 */}
      <div className="mb-8">
        <Image
          src="/images/logo.png"
          alt="우리 나이가 어때서"
          width={80}
          height={80}
          className="w-20 h-20 mx-auto mb-4 object-contain"
        />
        <h1 className="text-2xl font-bold text-foreground mb-1">우리 나이가 어때서</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          나이 걱정 없이 소통하는<br />
          따뜻한 커뮤니티
        </p>
      </div>

      {/* 카카오 로그인 버튼 — 서버 액션 사용 */}
      <form
        action={async () => {
          'use server'
          await signIn('kakao', { redirectTo: callbackUrl })
        }}
      >
        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full h-[52px] px-6 border-none rounded-xl bg-[var(--kakao-bg)] text-[var(--kakao-text)] text-sm font-bold cursor-pointer transition-all shadow-[0_2px_8px_rgba(254,229,0,0.3)] mb-6 hover:brightness-95 hover:shadow-[0_4px_14px_rgba(254,229,0,0.4)] hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="text-[22px] shrink-0">💬</span>
          카카오로 시작하기
        </button>
      </form>

      {/* 안내 문구 */}
      <p className="text-[15px] text-muted-foreground leading-relaxed">
        로그인 시{' '}
        <Link href="/terms/service" className="text-muted-foreground underline hover:text-primary">이용약관</Link>
        {' '}및{' '}
        <Link href="/terms/privacy" className="text-muted-foreground underline hover:text-primary">개인정보처리방침</Link>
        에 동의하게 됩니다.
      </p>

      {/* 비회원 둘러보기 */}
      <Link
        href="/"
        className="inline-flex items-center min-h-[52px] px-4 mt-4 text-[15px] font-medium text-muted-foreground rounded-lg transition-colors hover:text-primary"
      >
        비회원으로 둘러보기 →
      </Link>
    </div>
  )
}
