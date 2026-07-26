import { describe, expect, it } from 'vitest'
import {
  SHEET_BOARD_DEFAULT_CATEGORY,
  SHEET_TAB_TO_BOARD,
  getSheetBoardSlug,
} from '../../agents/community/sheet-board-routing'
import {
  classifyCategory,
  transformContent,
  transformRawContent,
} from '../../agents/community/content-transformer'
import type { SiteConfig } from '../../agents/community/site-configs'

const site: SiteConfig = {
  id: 'cook82',
  name: '82cook',
  urlPatterns: [/82cook\.com/],
  minDelay: 0,
  headless: true,
  cloudflareProtected: false,
  selectors: {
    title: [],
    content: [],
    images: 'img',
    removeElements: [],
  },
}

describe('sheet board routing — 갱년기톡 직접 탭 라우팅', () => {
  it('기존 탭과 갱년기톡 탭을 명시적으로 boardType에 연결한다', () => {
    expect(SHEET_TAB_TO_BOARD['사는이야기']).toEqual({ boardType: 'STORY', isFeatured: false })
    expect(SHEET_TAB_TO_BOARD['2막준비']).toEqual({ boardType: 'LIFE2', isFeatured: false })
    expect(SHEET_TAB_TO_BOARD['웃음방']).toEqual({ boardType: 'HUMOR', isFeatured: false })
    expect(SHEET_TAB_TO_BOARD['갱년기톡']).toEqual({ boardType: 'MENOPAUSE', isFeatured: false })
    expect(SHEET_TAB_TO_BOARD['갱년기톡_화제성']).toEqual({ boardType: 'MENOPAUSE', isFeatured: true })
  })

  it('새벽 탭은 기존처럼 STORY dawn 전용으로 남긴다', () => {
    expect(SHEET_TAB_TO_BOARD['사는이야기_새벽']).toEqual({ boardType: 'STORY', isFeatured: false, isDawn: true })
  })

  it('MENOPAUSE URL은 life2 fallback 없이 /community/menopause로 간다', () => {
    expect(getSheetBoardSlug('STORY')).toBe('stories')
    expect(getSheetBoardSlug('HUMOR')).toBe('humor')
    expect(getSheetBoardSlug('LIFE2')).toBe('life2')
    expect(getSheetBoardSlug('MENOPAUSE')).toBe('menopause')
  })

  it('MENOPAUSE 기본 카테고리는 나만 이런가요로 고정한다', () => {
    expect(SHEET_BOARD_DEFAULT_CATEGORY.MENOPAUSE).toBe('나만 이런가요')
  })
})

describe('sheet board routing — 갱년기톡 카테고리/본문 처리', () => {
  it('갱년기톡 하위 카테고리를 제목/본문 신호로 분류한다', () => {
    expect(classifyCategory('폐경 이후 호르몬제 고민', '', 'MENOPAUSE')).toBe('완경·호르몬')
    expect(classifyCategory('안면홍조 때문에 밤잠을 못 자요', '식은땀도 나요', 'MENOPAUSE')).toBe('몸의 변화')
    expect(classifyCategory('요즘 자꾸 눈물이 나요', '갱년기 때문인지 우울하고 불안해요', 'MENOPAUSE')).toBe('마음의 변화')
    expect(classifyCategory('남편이 제 갱년기를 이해 못해요', '', 'MENOPAUSE')).toBe('가족·관계')
  })

  it('갱년기라는 단어만으로 세부 카테고리를 억지 분류하지 않는다', () => {
    expect(classifyCategory('갱년기 저만 이런가요', '', 'MENOPAUSE')).toBe('기타')
  })

  it('갱년기톡은 HUMOR와 달리 출처 문구를 붙이지 않는다', () => {
    expect(transformContent('<p>본문</p>', 'https://www.82cook.com/a', site, 'MENOPAUSE')).not.toContain('출처:')
    expect(transformRawContent('본문', 'https://www.82cook.com/a', site.name, 'MENOPAUSE')).not.toContain('출처:')
    expect(transformContent('<p>본문</p>', 'https://www.82cook.com/a', site, 'HUMOR')).toContain('출처: 온라인 커뮤니티')
  })
})
