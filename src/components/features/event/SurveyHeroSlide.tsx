'use client'

import Link from 'next/link'

export interface SurveyHeroData {
  /** 라벨 배지 문구 — 예: "1분 의견함" */
  label: string
  /** 짧은 제목 — HERO에서 최대 2줄. 긴 설문 제목은 line-clamp로 잘림. */
  title: string
  /** 보조문구 — 최대 1줄. 설문 상세 설명(description)이 아니라 짧은 유도 문구. */
  subtitle?: string
  /** CTA 문구 — 예: "의견 남기기" */
  ctaText: string
  /** 클릭 시 이동할 상세 URL (예: /events/[id]?src=hero) */
  ctaUrl: string
}

/**
 * 1분 의견함(SURVEY) 전용 HERO 슬라이드 — Phase 5 핫픽스.
 *
 * HERO는 **입구**만 보여준다: 라벨 배지 + 짧은 제목(≤2줄) + 짧은 보조문구(≤1줄) + CTA.
 * 설문 상세 설명/질문 목록/본문은 여기에 절대 노출하지 않는다 → /events 상세에서만.
 *
 * 일반 배너 렌더러(긴 title/description 그대로 삽입 → 과밀)를 피하려고 전용 렌더러로 분리.
 * VoteHeroSlide처럼 slide.survey 필드로 분기하며, VOTE/FEEDBACK HERO는 무접촉(회귀 0).
 * 배경 그라디언트는 상위 슬라이드 div(buildGradient)가 담당 — 여기선 콘텐츠 오버레이만.
 */
export default function SurveyHeroSlide({
  data,
  active,
}: {
  data: SurveyHeroData
  active: boolean
}) {
  return (
    <>
      {/* 가독성 보강용 반투명 어둠 오버레이 */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.15)' }} />

      {/* 전체 영역 클릭 → 상세로 이동 */}
      <Link
        href={(data.ctaUrl ?? '/').trim() || '/'}
        className="absolute inset-0 flex flex-col items-start justify-end gap-2 px-5 pb-7 text-left lg:justify-center lg:gap-3 lg:px-16 lg:pb-0 no-underline [-webkit-tap-highlight-color:transparent]"
        tabIndex={active ? 0 : -1}
      >
        {/* 라벨 배지 */}
        <span
          className="inline-flex items-center rounded-full bg-white/25 backdrop-blur-sm px-3 h-7 font-bold text-white leading-none"
          style={{ fontSize: 'clamp(12px, 3.2vw, 14px)' }}
        >
          📝 {data.label}
        </span>

        {/* 짧은 제목 — 최대 2줄 */}
        <h2
          className="text-white font-bold leading-[1.3] break-keep line-clamp-2 max-w-[80%] lg:max-w-[70%]"
          style={{ fontSize: 'clamp(19px, 5vw, 28px)', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
        >
          {data.title}
        </h2>

        {/* 보조문구 — 최대 1줄 */}
        {data.subtitle && (
          <p
            className="text-white/90 leading-snug break-keep line-clamp-1 max-w-[80%] lg:max-w-[70%]"
            style={{ fontSize: 'clamp(14px, 3.8vw, 18px)', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
          >
            {data.subtitle}
          </p>
        )}

        {/* CTA */}
        <span
          className="mt-0.5 inline-flex items-center justify-center px-4 h-11 rounded-full bg-black/30 backdrop-blur-sm text-white font-semibold"
          style={{ fontSize: 'clamp(15px, 3.6vw, 17px)' }}
        >
          {data.ctaText} →
        </span>
      </Link>
    </>
  )
}
