import { describe, it, expect } from 'vitest'
import {
  shouldGoogleNoindexCommunityPost,
  isNarrowUnaeoIdentityTopic,
  type CommunityGoogleNoindexInput,
} from '@/lib/seo/community-google-noindex'

/** 500자 이상 본문(주제어를 포함하지 않는 중립 텍스트) */
const LONG = `<p>${'가나다라마바사'.repeat(80)}</p>` // 560자
/** 500자 미만 본문 */
const SHORT = '<p>짧은 글입니다.</p>'

/** 기본값 = STORY / 주제 미해당 / 짧음 / 메타 없음 → noindex 대상 */
function post(overrides: Partial<CommunityGoogleNoindexInput> = {}): CommunityGoogleNoindexInput {
  return {
    boardType: 'STORY',
    title: '오늘 점심 뭐 드셨어요',
    content: SHORT,
    seoTitle: null,
    seoDescription: null,
    ...overrides,
  }
}

describe('isNarrowUnaeoIdentityTopic — 우나어 핵심 주제(A좁) 판정', () => {
  it('제목에만 주제어가 있어도 true', () => {
    expect(isNarrowUnaeoIdentityTopic({ title: '갱년기 불면 어떻게 견디세요', content: SHORT })).toBe(true)
  })

  it('본문에만 주제어가 있어도 true', () => {
    expect(isNarrowUnaeoIdentityTopic({ title: '요즘 근황', content: '<p>국민연금 수령 시기를 고민 중이에요</p>' })).toBe(true)
  })

  it('HTML 태그 안의 문자열은 주제어로 세지 않는다', () => {
    expect(isNarrowUnaeoIdentityTopic({ title: '사진', content: '<img alt="갱년기" src="x.jpg">' })).toBe(false)
  })

  it('주제군 대표 키워드가 모두 인식된다', () => {
    const samples = [
      '갱년기', '폐경', '완경', '호르몬', '안면홍조', '불면', '식은땀', '골다공증',
      '관절', '당뇨', '혈압', '수술', '검사', '진료', '간병', '돌봄',
      '시댁', '이혼', '재혼', '상속', '장례', '부모님', '자녀 독립', '빈둥지',
      '은퇴', '퇴직', '재취업', '일자리', '알바', '자격증',
      '연금', '노후', '건강보험', '보험료', '세금', '상속세', '재테크',
      '전세', '월세', '청약', '이사', '주거', '지역 선택',
      '40대', '50대', '60대', '중년', '우리 또래', '인생 2막',
    ]
    for (const kw of samples) {
      expect(isNarrowUnaeoIdentityTopic({ title: `${kw} 관련 글`, content: SHORT }), kw).toBe(true)
    }
  })

  it('띄어쓰기 변형(자녀독립·우리또래·인생2막)도 인식', () => {
    for (const kw of ['자녀독립', '우리또래', '인생2막']) {
      expect(isNarrowUnaeoIdentityTopic({ title: kw, content: SHORT }), kw).toBe(true)
    }
  })

  it('범용 생활 어휘(남편·딸·가족·병원·동네·여행)는 주제로 치지 않는다', () => {
    for (const kw of ['남편', '딸', '가족', '병원', '동네', '여행', '날씨', '드라마']) {
      expect(isNarrowUnaeoIdentityTopic({ title: `${kw} 이야기`, content: SHORT }), kw).toBe(false)
    }
  })

  it('content가 null이어도 안전하게 동작', () => {
    expect(isNarrowUnaeoIdentityTopic({ title: '연금 문의', content: null })).toBe(true)
    expect(isNarrowUnaeoIdentityTopic({ title: '오늘 날씨', content: null })).toBe(false)
  })
})

describe('shouldGoogleNoindexCommunityPost — HUMOR 보드 전면 제외 (B2)', () => {
  const humor = (o: Partial<CommunityGoogleNoindexInput> = {}) => post({ boardType: 'HUMOR', ...o })

  it('기본 HUMOR → true', () => {
    expect(shouldGoogleNoindexCommunityPost(humor())).toBe(true)
  })

  it('주제 적합 + 본문 김 + 메타 완비여도 true (조건 무관)', () => {
    expect(
      shouldGoogleNoindexCommunityPost(
        humor({ title: '갱년기 불면 극복기', content: LONG, seoTitle: 'T', seoDescription: 'D' }),
      ),
    ).toBe(true)
  })
})

describe('shouldGoogleNoindexCommunityPost — STORY/LIFE2 주제 게이트 (B3)', () => {
  it('주제 미해당 + 짧음 → true (기본 제외)', () => {
    expect(shouldGoogleNoindexCommunityPost(post())).toBe(true)
  })

  it('주제 미해당이면 본문이 아무리 길어도 true', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ content: LONG }))).toBe(true)
  })

  it('주제 미해당이면 SEO 메타가 완비돼도 true', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ seoTitle: 'T', seoDescription: 'D' }))).toBe(true)
  })

  it('주제 해당 + 500자 이상 → false (유지)', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ title: '갱년기 불면 극복기', content: LONG }))).toBe(false)
  })

  it('주제 해당 + SEO 메타 완비 → 짧아도 false (유지)', () => {
    expect(
      shouldGoogleNoindexCommunityPost(
        post({ title: '연금 수령 시기 고민', content: SHORT, seoTitle: 'T', seoDescription: 'D' }),
      ),
    ).toBe(false)
  })

  it('주제 해당해도 짧고 메타 없으면 true (제외)', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ title: '갱년기 힘드네요', content: SHORT }))).toBe(true)
  })

  it('메타가 하나만 있으면 완비로 치지 않는다', () => {
    const base = { title: '퇴직 후 재취업 고민', content: SHORT }
    expect(shouldGoogleNoindexCommunityPost(post({ ...base, seoTitle: 'T', seoDescription: null }))).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(post({ ...base, seoTitle: null, seoDescription: 'D' }))).toBe(true)
  })

  it('경계: 정확히 500자면 유지, 499자면 제외', () => {
    const exactly500 = `<p>갱년기 ${'가'.repeat(496)}</p>` // "갱년기 " 4 + 496 = 500
    const just499 = `<p>갱년기 ${'가'.repeat(495)}</p>`
    expect(shouldGoogleNoindexCommunityPost(post({ title: '무제', content: exactly500 }))).toBe(false)
    expect(shouldGoogleNoindexCommunityPost(post({ title: '무제', content: just499 }))).toBe(true)
  })

  it('LIFE2도 STORY와 동일하게 판단된다', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ boardType: 'LIFE2' }))).toBe(true)
    expect(
      shouldGoogleNoindexCommunityPost(post({ boardType: 'LIFE2', title: '은퇴 준비', content: LONG })),
    ).toBe(false)
  })

  it('content null/빈 문자열은 길이 0 → true', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ title: '연금 질문', content: null }))).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(post({ title: '연금 질문', content: '' }))).toBe(true)
  })

  it('태그만 길고 텍스트가 짧으면 제외 (태그는 길이에서 제외)', () => {
    const tagHeavy = `<div class="${'x'.repeat(900)}"><p>갱년기 힘들어요</p></div>`
    expect(shouldGoogleNoindexCommunityPost(post({ title: '무제', content: tagHeavy }))).toBe(true)
  })
})

describe('shouldGoogleNoindexCommunityPost — 보호 대상 보드', () => {
  it('MENOPAUSE는 조건과 무관하게 false (전면 보호)', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ boardType: 'MENOPAUSE' }))).toBe(false)
    expect(
      shouldGoogleNoindexCommunityPost(post({ boardType: 'MENOPAUSE', title: '오늘 날씨', content: null })),
    ).toBe(false)
  })

  it('MAGAZINE/JOB/기타 보드도 false', () => {
    for (const boardType of ['MAGAZINE', 'JOB', 'WEEKLY', 'UNKNOWN']) {
      expect(shouldGoogleNoindexCommunityPost(post({ boardType })), boardType).toBe(false)
    }
  })
})

describe('shouldGoogleNoindexCommunityPost — 제외된 기준(회귀 방지)', () => {
  it('댓글 수는 기준이 아니다 — 입력에 없고, 주제 부적합이면 그대로 제외', () => {
    // commentCount 필드 자체가 인터페이스에 없다. 주제 미달 글은 반응과 무관하게 true.
    expect(shouldGoogleNoindexCommunityPost(post({ title: '다들 점심 뭐 드셨어요?' }))).toBe(true)
  })

  it('신규 글 유예는 없다 — 작성 시점 입력 없이도 동일 판정', () => {
    // createdAt 필드가 인터페이스에 없다. 오늘 쓴 잡담도 즉시 제외 대상.
    expect(shouldGoogleNoindexCommunityPost(post({ title: '오늘 기분 좋아요', content: SHORT }))).toBe(true)
  })

  it('주제 적합 + 분량 충족이면 신규·무반응 글이라도 유지된다', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ title: '시댁 상속 문제로 고민입니다', content: LONG }))).toBe(false)
  })
})
