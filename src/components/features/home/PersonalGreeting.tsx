import Link from 'next/link'

interface Props {
  nickname: string
}

/**
 * PersonalGreeting — 회원 전용 Hero 직후 인사 카드
 */
export default function PersonalGreeting({ nickname }: Props) {
  return (
    <section
      className="px-4 py-4 lg:px-0"
      aria-label="개인화 인사"
    >
      <div
        className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
        style={{ background: 'var(--surface-coral-pale)' }}
      >
        <div className="space-y-0.5">
          <p className="text-body font-bold text-foreground break-keep">
            {nickname}님, 오늘도 반가워요 👋
          </p>
          <p className="text-caption text-muted-foreground">
            새로운 이야기가 기다리고 있어요
          </p>
        </div>
        <Link
          href="/community/stories"
          className="shrink-0 inline-flex items-center justify-center px-4 h-[48px] rounded-xl bg-primary text-white font-semibold text-caption no-underline hover:opacity-90 active:scale-95 whitespace-nowrap"
        >
          둘러보기
        </Link>
      </div>
    </section>
  )
}
