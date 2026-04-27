import Link from 'next/link'

/**
 * SignupCard — 비회원 중반부 가입 유도 인라인 카드
 * variant="middle": 홈 페이지 중반부 자연스러운 가입 유도
 */
export default function SignupCard() {
  return (
    <section className="py-6 px-4 lg:px-0">
      <div
        className="rounded-2xl p-6 flex flex-col items-center text-center gap-4"
        style={{ background: 'var(--surface-coral-pale)' }}
      >
        <div className="space-y-1">
          <p className="text-title font-bold text-foreground break-keep">
            우리 또래 이야기, 여기 다 있어요
          </p>
          <p className="text-body text-muted-foreground break-keep">
            카카오로 1초 가입해 보세요
          </p>
        </div>

        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-3 w-full max-w-[320px] h-[52px] rounded-2xl no-underline font-bold text-body transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: '#FEE500', color: '#191919' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 2C5.582 2 2 4.925 2 8.5c0 2.26 1.37 4.25 3.46 5.43l-.9 3.3a.25.25 0 0 0 .38.27L8.8 15.5c.39.05.79.08 1.2.08 4.418 0 8-2.925 8-6.5S14.418 2 10 2Z"
              fill="currentColor"
            />
          </svg>
          카카오로 1초 가입
        </Link>
      </div>
    </section>
  )
}
