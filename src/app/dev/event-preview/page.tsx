import type { Metadata } from 'next'
import EventPreviewClient from './EventPreviewClient'

/**
 * 참여 이벤트 입구(HERO) QA 프리뷰 — **테스트 전용, noindex, 비링크.**
 *
 * 목적: VOTE·FEEDBACK·SURVEY HERO 슬라이드를 실제 렌더 경로(HeroSliderClient)로 태워
 *   "입구 전용인지 / 긴 설명이 노출되지 않는지"를 **DB·홈·실노출 없이** 검증한다(노출 리스크 0).
 *   participation-events-qa.md 계층 B. 어디서도 링크되지 않고 robots noindex라 사용자 도달 경로 0.
 */
export const metadata: Metadata = {
  title: '우나어 — 참여 이벤트 입구 프리뷰 (QA)',
  description: 'Participation event HERO preview for QA only',
  robots: 'noindex, nofollow',
}

export default function EventPreviewPage() {
  return <EventPreviewClient />
}
