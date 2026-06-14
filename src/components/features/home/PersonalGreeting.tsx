'use client'

import { useAppSession } from '@/components/common/AppSessionProvider'
import Link from 'next/link'

/**
 * PersonalGreeting — 회원 전용 Hero 직후 인사 카드
 */
export default function PersonalGreeting() {
  const { data: session, status } = useAppSession()
  if (status !== 'authenticated' || !session?.user?.nickname) return null
  const nickname = session.user.nickname
  // 온보딩 직후 세션 갱신 지연으로 옛 임시닉네임(user_숫자)이 잠깐 남는 경우 인사말을 숨긴다
  // (세션이 갱신되면 진짜 닉네임으로 표시됨). 온보딩 미완 유저에게도 user_ 인사말은 부적절.
  if (nickname.startsWith('user_')) return null

  return (
    <section
      className="px-4 py-4 lg:px-0"
      aria-label="개인화 인사"
    >
      <div
        className="rounded-2xl px-5 py-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        style={{ background: 'var(--surface-coral-pale)' }}
      >
        <div className="min-w-0 space-y-1">
          <p className="text-body font-bold text-foreground break-keep">
            {nickname}님, 오늘도 반가워요 👋
          </p>
          <p className="text-caption text-muted-foreground">
            새로운 이야기가 기다리고 있어요
          </p>
        </div>
        <Link
          href="/community/stories"
          className="shrink-0 inline-flex items-center justify-center px-4 min-h-[52px] py-2 rounded-xl bg-primary text-white font-semibold text-body no-underline hover:opacity-90 active:scale-95 whitespace-nowrap"
        >
          둘러보기
        </Link>
      </div>
    </section>
  )
}
