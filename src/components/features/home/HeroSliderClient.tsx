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
    // 이전에는 aspect-ratio 5:2와 minHeight 200px이 섞여, 375/390/430에서 minHeight가 이겨
    // 실제 비율이 1.875 / 1.95 / 2.15로 제각각이었다(광고주에게 규격을 줄 수 없는 상태).
    // minHeight를 빼고 모바일·태블릿 2:1, lg 이상 8:3 두 가지로만 확정한다.
    <section
      className="w-full relative overflow-hidden [aspect-ratio:2/1] lg:[aspect-ratio:8/3]"
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
              'absolute inset-0 flex flex-col justify-end gap-2.5 px-5 pb-7 lg:justify-center lg:gap-3 lg:px-16 lg:pb-0 no-underline [-webkit-tap-highlight-color:transparent]',
              slide.imageUrl ? 'items-start text-left' : 'items-center text-center'
            )}
            tabIndex={index === current ? 0 : -1}
          >
            <h2
              className="text-white font-bold leading-[1.4] break-keep max-w-[72%] lg:max-w-none"
              style={{ fontSize: 'var(--text-hero-title)', whiteSpace: 'pre-line', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
            >
              {slide.title.replace(/\\n/g, '\n')}
            </h2>

            {slide.subtitle && (
              <p
                className="text-white/90 leading-snug break-keep max-w-[72%] lg:max-w-none"
                style={{ fontSize: 'var(--text-hero-subtitle)', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
              >
                {slide.subtitle}
              </p>
            )}

            {slide.ctaText && (
              <span
                className="mt-1 inline-flex items-center justify-center px-4 h-11 rounded-full bg-black/30 backdrop-blur-sm text-white font-semibold"
                style={{ fontSize: 'var(--text-hero-cta)' }}
              >
                {slide.ctaText}
              </span>
            )}
          </HeroSlideLink>
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
