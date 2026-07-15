import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getTodayPublic } from '@/lib/votes'

// 히든 목적지 — 검색 색인 제외
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * /events/today — 오늘 활성(09:00~20:00 OPEN / 20:00 이후 CLOSED) 참여 이벤트로 연결.
 * 팝업/HERO/푸시가 특정 id 없이 "오늘의 이벤트"로 보낼 때 사용. 09:00 전·없음이면 notFound.
 */
export default async function EventTodayPage() {
  const today = await getTodayPublic() // 09:00 전(HIDDEN)·없음이면 null, 09:00 도달 시 lazy 공개
  if (!today?.vote?.id) notFound()
  redirect(`/events/${today.vote.id}`)
}
