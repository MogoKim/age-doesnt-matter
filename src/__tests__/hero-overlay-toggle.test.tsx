import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HeroSliderClient, {
  shouldShowOverlay,
  type SlideData,
} from '@/components/features/home/HeroSliderClient'

/**
 * 홈 상단 구좌는 브랜드 히어로 · 광고주 배너 · 참여이벤트가 같이 쓴다.
 * 광고주가 문구까지 넣은 완성 소재를 주면 우리 제목·부제·CTA가 그 위에 겹쳐 광고가 깨지므로
 * 배너별로 오버레이를 끌 수 있게 했다.
 *
 * 여기서 지키는 것 세 가지:
 *  1. 기본값은 켜짐 — 값을 안 주면 지금 운영 중인 브랜드 히어로가 그대로 보여야 한다
 *  2. 이미지 없는 배너는 끌 수 없다 — 끄면 글자도 그림도 없는 빈 색판이 된다
 *  3. 껐어도 배너 전체 클릭 영역은 남는다 — 광고를 눌러도 아무 일 없으면 팔 수 없다
 */

afterEach(cleanup)

const base: SlideData = {
  id: 'b1',
  title: '브랜드 제목',
  subtitle: '브랜드 부제',
  themeColor: '#FF6F61',
  ctaText: '보러가기',
  ctaUrl: '/best',
  imageUrl: '/images/hero/hero_1.jpg',
}

describe('shouldShowOverlay — 순수 판정', () => {
  it('값을 안 주면 켜짐 — 기존 배너·참여이벤트 teaser가 여기 해당한다', () => {
    expect(shouldShowOverlay({ imageUrl: '/a.jpg' })).toBe(true)
    expect(shouldShowOverlay({ imageUrl: undefined })).toBe(true)
  })

  it('이미지가 있고 false면 꺼짐', () => {
    expect(shouldShowOverlay({ showOverlay: false, imageUrl: '/a.jpg' })).toBe(false)
  })

  it('이미지가 없으면 false를 줘도 켜진다 — 빈 색판 방지', () => {
    expect(shouldShowOverlay({ showOverlay: false, imageUrl: undefined })).toBe(true)
    expect(shouldShowOverlay({ showOverlay: false, imageUrl: '' })).toBe(true)
  })

  it('true는 이미지 유무와 무관하게 켜짐', () => {
    expect(shouldShowOverlay({ showOverlay: true, imageUrl: '/a.jpg' })).toBe(true)
    expect(shouldShowOverlay({ showOverlay: true, imageUrl: undefined })).toBe(true)
  })
})

describe('오버레이 ON — 기존 브랜드 히어로 화면 유지', () => {
  it('제목·부제·CTA가 모두 보인다', () => {
    render(<HeroSliderClient slides={[{ ...base, showOverlay: true }]} />)
    expect(screen.getByRole('heading', { name: '브랜드 제목' })).toBeTruthy()
    expect(screen.getByText('브랜드 부제')).toBeTruthy()
    expect(screen.getByText('보러가기')).toBeTruthy()
  })

  it('showOverlay를 아예 안 넘겨도 똑같이 보인다 — 마이그레이션 전 기본값', () => {
    render(<HeroSliderClient slides={[base]} />)
    expect(screen.getByRole('heading', { name: '브랜드 제목' })).toBeTruthy()
    expect(screen.getByText('브랜드 부제')).toBeTruthy()
  })
})

describe('오버레이 OFF — 광고주 소재 그대로', () => {
  it('제목·부제·CTA를 화면에 그리지 않는다', () => {
    render(<HeroSliderClient slides={[{ ...base, showOverlay: false }]} />)
    expect(screen.queryByRole('heading', { name: '브랜드 제목' })).toBeNull()
    expect(screen.queryByText('브랜드 부제')).toBeNull()
    expect(screen.queryByText('보러가기')).toBeNull()
  })

  it('배너 전체 클릭 영역과 링크는 유지된다', () => {
    render(<HeroSliderClient slides={[{ ...base, showOverlay: false }]} />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe('/best')
    expect(a.getAttribute('class')).toContain('absolute inset-0')
  })

  it('외부 링크 안전 처리(새 탭·rel)는 그대로 적용된다', () => {
    render(
      <HeroSliderClient
        slides={[{ ...base, showOverlay: false, ctaUrl: 'https://advertiser.example.com' }]}
      />
    )
    const a = screen.getByRole('link')
    expect(a.getAttribute('target')).toBe('_blank')
    const rel = (a.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toContain('noopener')
    expect(rel).toContain('nofollow')
  })

  it('위험한 스킴은 껐을 때도 홈으로 되돌린다', () => {
    render(
      <HeroSliderClient slides={[{ ...base, showOverlay: false, ctaUrl: 'javascript:alert(1)' }]} />
    )
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })

  it('글자가 사라져도 링크 이름은 남는다 — 화면 낭독기가 목적지를 읽을 수 있어야 한다', () => {
    render(<HeroSliderClient slides={[{ ...base, showOverlay: false }]} />)
    expect(screen.getByRole('link', { name: '브랜드 제목' })).toBeTruthy()
  })

  it('이미지는 그대로 남는다', () => {
    render(<HeroSliderClient slides={[{ ...base, showOverlay: false }]} />)
    expect(screen.getByRole('img', { name: '브랜드 제목' })).toBeTruthy()
  })
})

describe('이미지 없는 배너 — 경계 케이스', () => {
  it('끄려고 해도 제목이 그대로 보인다 (빈 배너 방지)', () => {
    render(
      <HeroSliderClient slides={[{ ...base, imageUrl: undefined, showOverlay: false }]} />
    )
    expect(screen.getByRole('heading', { name: '브랜드 제목' })).toBeTruthy()
  })
})

describe('참여이벤트 보호', () => {
  it('SURVEY 슬라이드는 showOverlay=false여도 전용 입구 UI가 그대로 나온다', () => {
    const survey: SlideData = {
      id: 'survey-1',
      title: '설문 제목',
      themeColor: '#3730A3',
      ctaUrl: '/events/e1?src=hero',
      // Banner가 아닌 teaser라 원래 이 값을 안 넘기지만, 잘못 흘러들어와도 이벤트 UI는 지켜야 한다
      showOverlay: false,
      survey: {
        label: '1분 의견함',
        title: '어떤 점이 더 좋아지면 좋을까요?',
        subtitle: '딱 1분만 들려주세요',
        ctaText: '의견 남기기',
        ctaUrl: '/events/e1?src=hero',
      },
    }
    render(<HeroSliderClient slides={[survey]} />)
    expect(screen.getByRole('heading', { name: '어떤 점이 더 좋아지면 좋을까요?' })).toBeTruthy()
    expect(screen.getByText('딱 1분만 들려주세요')).toBeTruthy()
    expect(screen.getByText(/의견 남기기/)).toBeTruthy()
  })

  // VOTE는 useRouter·fetch를 쓰는 컨테이너라 여기서 렌더하지 않는다.
  // 렌더 분기가 `slide.vote ? <VoteHeroSlide/> : slide.survey ? … : (오버레이 분기)` 순서라
  // vote/survey 슬라이드는 오버레이 코드에 도달하지 않는다 — 위 SURVEY 케이스가 그 구조를 대표한다.
})
