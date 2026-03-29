import { signIn } from '@/lib/auth'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="w-full max-w-[420px] bg-card rounded-2xl p-12 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] text-center max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col max-md:justify-center">
      {/* 로고 */}
      <div className="mb-6">
        <Image
          src="/images/logo.png"
          alt="우리 나이가 어때서"
          width={80}
          height={80}
          className="w-20 h-20 mx-auto mb-4 object-contain"
        />
        <h1 className="text-2xl font-bold text-foreground mb-2">우리 나이가 어때서</h1>
        <p className="text-body text-muted-foreground leading-relaxed">
          같은 세대끼리 편하게 이야기 나눠요
        </p>
      </div>

      {/* 맥락 설명 — 왜 로그인이 필요한지 */}
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-6 bg-[var(--surface-warm)] rounded-xl px-4 py-3">
        로그인하면 글쓰기, 댓글, 좋아요를<br />
        할 수 있어요
      </p>

      {/* 카카오 로그인 버튼 — 서버 액션 사용 */}
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

      {/* 안심 문구 — 모바일에서 카카오톡 앱 전환 안내 */}
      <p className="text-[15px] text-muted-foreground leading-relaxed mt-3 mb-6">
        <span className="hidden max-md:inline">
          카카오톡 앱에서 바로 연결돼요<br />
          비밀번호 입력 없이 간편하게!
        </span>
        <span className="inline max-md:hidden">
          카카오 계정으로 간편하게 시작할 수 있어요
        </span>
      </p>

      {/* 안내 문구 */}
      <p className="text-caption text-muted-foreground leading-relaxed">
        로그인 시{' '}
        <Link href="/terms/service" className="text-muted-foreground underline hover:text-primary">이용약관</Link>
        {' '}및{' '}
        <Link href="/terms/privacy" className="text-muted-foreground underline hover:text-primary">개인정보처리방침</Link>
        에 동의하게 됩니다.
      </p>

      {/* 비회원 둘러보기 */}
      <Link
        href="/"
        className="flex items-center justify-center gap-2 w-full h-[56px] px-6 mt-3 border-2 border-border rounded-xl bg-background text-foreground text-base font-bold no-underline transition-all hover:border-primary hover:text-primary"
      >
        먼저 둘러볼게요 →
      </Link>

      {/* 안심 문구 — 실수 두려움 해소 */}
      <p className="text-caption text-muted-foreground/60 mt-4">
        잘못 누르셔도 괜찮아요. 언제든 다시 시도할 수 있어요.
      </p>
    </div>
  )
}
