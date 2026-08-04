'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { resolveHeroLink } from '@/lib/hero-link'
import VoteHeroSlide, { type VoteHeroData } from '@/components/features/vote/VoteHeroSlide'
import SurveyHeroSlide, { type SurveyHeroData } from '@/components/features/event/SurveyHeroSlide'

export interface SlideData {
  id: string
  title: string
  subtitle?: string
  themeColor: string
  themeColorMid?: string
  themeColorEnd?: string
  ctaText?: string
  ctaUrl: string
  imageUrl?: string
  /**
   * 시스템 텍스트(제목·부제·CTA·어두운 그라디언트)를 이미지 위에 겹칠지.
   * Banner 데이터로 만든 슬라이드만 이 값을 넘긴다 — 참여이벤트 teaser는 넘기지 않아
   * undefined가 되고, 아래 shouldShowOverlay가 켜진 것으로 본다.
   */
  showOverlay?: boolean
  /** 오늘의 투표 슬라이드 — 있으면 일반 렌더 대신 VoteHeroSlide (직접투표) */
  vote?: VoteHeroData
  /** 1분 의견함(SURVEY) 슬라이드 — 있으면 일반 렌더 대신 SurveyHeroSlide (입구 전용) */
  survey?: SurveyHeroData
}

const AUTO_PLAY_INTERVAL = 7000

/**
 * 슬라이드 전체를 덮는 링크.
 *
 * 내부 경로는 클라이언트 라우팅(`next/link`)으로 앱 안에서 이동하고,
 * 외부 https는 새 탭으로 연다 — 광고주 사이트로 나갈 때 우나어를 떠나지 않게,
 * 특히 앱 웹뷰 안에 갇히지 않게 하기 위해서다.
 * 허용하지 않는 스킴은 resolveHeroLink가 홈으로 되돌린다.
 */
export function HeroSlideLink({
  ctaUrl,
  className,
  tabIndex,
  children,
}: {
  ctaUrl: string | null | undefined
  className: string
  tabIndex: number
  children: React.ReactNode
}) {
  const link = resolveHeroLink(ctaUrl)

  if (link.kind === 'external') {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={className}
        tabIndex={tabIndex}
      >
        {children}
      </a>
    )
  }

  return (
    <Link href={link.href} className={className} tabIndex={tabIndex}>
      {children}
    </Link>
  )
}

/**
 * 이 슬라이드에 시스템 텍스트를 얹을지 판정한다.
 *
 * 광고주가 문구까지 넣은 완성 소재를 줄 때 우리 제목·부제·CTA가 그 위에 겹치면 광고가 깨진다.
 * 그래서 배너마다 끌 수 있게 했는데, **이미지가 없으면 끌 수 없다** — 배경 그라디언트만 남아
 * 아무 글자도 없는 빈 배너가 되기 때문이다. 저장 단계에서도 같은 규칙으로 막지만,
 * 예전에 저장된 데이터나 직접 DB를 고친 경우까지 화면에서 한 번 더 받아낸다.
 */
export function shouldShowOverlay(slide: Pick<SlideData, 'showOverlay' | 'imageUrl'>): boolean {
  if (!slide.imageUrl) return true
  return slide.showOverlay !== false
}

/** 3색 그라디언트 배경 CSS 문자열 생성 */
function buildGradient(slide: SlideData): string {
  const from = slide.themeColor
  const mid = slide.themeColorMid ?? slide.themeColor
  const to = slide.themeColorEnd ?? slide.themeColorMid ?? slide.themeColor
  return `linear-gradient(135deg, ${from} 0%, ${mid} 50%, ${to} 100%)`
}

interface Props {
  slides: SlideData[]
  /** SURVEY HERO를 client에서 세션 기준으로 삽입 허용(서버 teaser 없을 때만 true — 슬롯 중복 방지) */
  allowSurveyIsland?: boolean
}

interface ExposedSurveyResp {
  survey: { eventId: string; title: string } | null
}

export default function HeroSliderClient({ slides, allowSurveyIsland = false }: Props) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  // 투표 슬라이드에서 투표하면 자동재생 정지 — 결과를 읽기 전에 슬라이드가 넘어가지 않도록
  const [voteLock, setVoteLock] = useState(false)
  // SURVEY HERO(audience 분리) — 마운트 시 세션 포함 fetch. 홈 ISR을 안 깨면서 회원/비회원 분리 노출.
  const [surveySlide, setSurveySlide] = useState<SlideData | null>(null)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (!allowSurveyIsland) return
    let cancelled = false
    fetch('/api/events/exposed?channel=hero', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ExposedSurveyResp | null) => {
        const s = d?.survey
        if (!s || cancelled) return
        const url = `/events/${s.eventId}?src=hero`
        setSurveySlide({
          id: `survey-teaser-${s.eventId}`,
          title: s.title,
          themeColor: '#3730A3',
          themeColorMid: '#4F46E5',
          themeColorEnd: '#818CF8',
          ctaUrl: url,
          survey: { label: '1분 의견함', title: s.title, subtitle: '딱 1분만 들려주세요', ctaText: '의견 남기기', ctaUrl: url },
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [allowSurveyIsland])

  // 서버 슬라이드 + (있으면) client survey 슬라이드 3번째 삽입
  const allSlides = surveySlide ? [...slides.slice(0, 2), surveySlide, ...slides.slice(2)] : slides

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + allSlides.length) % allSlides.length)
  }, [allSlides.length])

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev + 1) % allSlides.length)
  }, [allSlides.length])

  // 자동재생 — 호버/포커스/투표 직후 일시정지
  useEffect(() => {
    if (allSlides.length <= 1 || paused || voteLock) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % allSlides.length)
    }, AUTO_PLAY_INTERVAL)
    return () => clearInterval(timer)
  }, [allSlides.length, paused, voteLock])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext(); else goPrev()
    }
    touchStartX.current = null
  }, [goNext, goPrev])

  if (allSlides.length === 0) return null

  return (
    // 비율 고정 — 광고 소재 규격의 근거다.
    // 홈 최상단은 성격이 다른 배너 셋(브랜드 히어로 · 광고주 배너 · 참여이벤트)이 돌아가며 쓰는
    // 하나의 구좌다. 예전에는 모바일 2:1 / PC 8:3으로 갈라져 있어 같은 소재가 기기마다 다르게
    // 잘렸고, 광고주에게 줄 규격도 두 개였다. 목록 상단 띠(광고 슬롯)와 같은 3:1로 통일해
    // 전 뷰포트에서 잘림 없이 원본 그대로 나오게 한다 — 규격은 2400×800 하나뿐이다.
    <section
      className="w-full relative overflow-hidden [aspect-ratio:3/1]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-label="홈 배너 슬라이더"
      aria-roledescription="carousel"
    >
      {allSlides.map((slide, index) => (
        <div
          key={slide.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`슬라이드 ${index + 1} / ${allSlides.length}`}
          aria-hidden={index !== current}
          className={cn(
            'absolute inset-0 transition-opacity duration-500',
            index === current ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
          style={{ background: slide.imageUrl || slide.vote ? undefined : buildGradient(slide) }}
        >
          {/* 오늘의 투표 슬라이드 — 일반 렌더 대신 직접투표 미니 투표판 */}
          {slide.vote ? (
            <VoteHeroSlide vote={slide.vote} onVoted={() => setVoteLock(true)} />
          ) : slide.survey ? (
            /* 1분 의견함 — 일반 배너 대신 입구 전용 렌더러(라벨+짧은 제목+CTA) */
            <SurveyHeroSlide data={slide.survey} active={index === current} />
          ) : (
            <>
          {/* 이미지 배경 */}
          {slide.imageUrl && (
            <Image
              src={slide.imageUrl}
              alt={slide.title}
              fill
              className="object-cover object-center"
              priority={index === 0}
              sizes="(min-width: 1200px) 1200px, 100vw"
            />
          )}

          {shouldShowOverlay(slide) ? (
            <>
          {/* 오버레이 — 이미지 있으면 좌측 어두운 그라디언트, 없으면 반투명 어둠 */}
          <div
            className="absolute inset-0"
            style={{
              background: slide.imageUrl
                ? 'linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.08) 100%)'
                : 'rgba(0,0,0,0.15)',
            }}
          />

          {/* 텍스트 오버레이 — 전체 영역 클릭 시 ctaUrl로 이동 (외부 https는 새 탭) */}
          <HeroSlideLink
            ctaUrl={slide.ctaUrl}
            className={cn(
              'absolute inset-0 flex flex-col justify-end gap-1.5 px-5 pb-3 lg:justify-center lg:gap-3 lg:px-16 lg:pb-0 no-underline [-webkit-tap-highlight-color:transparent]',
              slide.imageUrl ? 'items-start text-left' : 'items-center text-center'
            )}
            tabIndex={index === current ? 0 : -1}
          >
            {/* 모바일 3:1은 높이가 폭의 1/3뿐이라(375 → 125px) 글이 길면 자리가 모자란다.
                줄 수를 묶어 높이를 고정하고, shrink-0으로 flex가 글상자를 눌러 글자를 반쯤
                자르는 일(넘침 수치에는 안 잡히는 조용한 잘림)을 막는다.
                전체 문구는 배너를 눌러 들어간 페이지에서 보여준다. */}
            <h2
              className="shrink-0 text-white font-bold leading-[1.4] break-keep max-w-[72%] line-clamp-1 lg:max-w-none lg:line-clamp-none"
              style={{ fontSize: 'var(--text-hero-title)', whiteSpace: 'pre-line', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
            >
              {slide.title.replace(/\\n/g, '\n')}
            </h2>

            {slide.subtitle && (
              <p
                className="shrink-0 text-white/90 leading-snug break-keep max-w-[72%] line-clamp-1 lg:max-w-none lg:line-clamp-none"
                style={{ fontSize: 'var(--text-hero-subtitle)', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
              >
                {slide.subtitle}
              </p>
            )}

            {slide.ctaText && (
              <span
                className="shrink-0 inline-flex items-center justify-center px-4 h-8 lg:mt-1 lg:h-11 rounded-full bg-black/30 backdrop-blur-sm text-white font-semibold"
                style={{ fontSize: 'var(--text-hero-cta)' }}
              >
                {slide.ctaText}
              </span>
            )}
          </HeroSlideLink>
            </>
          ) : (
            /* 오버레이 OFF — 광고주 소재를 그대로 보여준다.
               어두운 그라디언트도 뺀다(글자 가독성용이라 글자가 없으면 소재만 어둡게 만든다).
               클릭 영역은 그대로 슬라이드 전체. 링크에 글자가 없으면 스크린리더가 목적지를
               읽을 수 없으므로 제목을 sr-only로 남긴다. */
            <HeroSlideLink
              ctaUrl={slide.ctaUrl}
              className="absolute inset-0 no-underline [-webkit-tap-highlight-color:transparent]"
              tabIndex={index === current ? 0 : -1}
            >
              <span className="sr-only">{slide.title}</span>
            </HeroSlideLink>
          )}
            </>
          )}
        </div>
      ))}

      {/* 우하단 카운터 pill — 비인터랙티브 */}
      {allSlides.length > 1 && (
        <div
          className="absolute right-3 bottom-3 z-10 rounded-full bg-black/35 px-3 h-8 inline-flex items-center justify-center text-[13px] font-semibold leading-none tabular-nums text-white shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
          aria-live="polite"
          aria-label={`현재 슬라이드 ${current + 1} / ${allSlides.length}`}
        >
          {current + 1} / {allSlides.length}
        </div>
      )}
    </section>
  )
}
