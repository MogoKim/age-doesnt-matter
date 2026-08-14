import { describe, it, expect } from 'vitest'
import {
  shouldGoogleNoindexCommunityPost,
  isNarrowUnaeoIdentityTopic,
  isWideLifeTopic,
  type CommunityGoogleNoindexInput,
} from '@/lib/seo/community-google-noindex'

/** 주제어를 포함하지 않는 중립 텍스트 — 길이만 조절해 쓴다 */
const filler = (chars: number) => `<p>${'가나다라마바사'.repeat(Math.ceil(chars / 7))}</p>`

const LONG = filler(560)          // 560자 — 모든 하한 통과
const SHORT = '<p>짧은 글입니다.</p>' // 8자 — 모든 하한 미달
const HUMAN_OK = filler(84)       // 84자 — USER/ADMIN 하한(80) 통과
const BOT_MID = filler(210)       // 210자 — 절대 하한(150) 통과, 주제 분량(300) 미달
const BOT_LONG = filler(350)      // 350자 — 주제 분량(300) 통과

/** 기본값 = STORY / BOT / 주제 미해당 / 짧음 → noindex 대상 */
function post(overrides: Partial<CommunityGoogleNoindexInput> = {}): CommunityGoogleNoindexInput {
  return {
    boardType: 'STORY',
    title: '오늘 점심 뭐 드셨어요',
    content: SHORT,
    source: 'BOT',
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

describe('shouldGoogleNoindexCommunityPost — 보드 단위 정책', () => {
  it('HUMOR는 source·길이·주제와 무관하게 항상 Google noindex', () => {
    for (const source of ['USER', 'ADMIN', 'BOT', 'SHEET']) {
      expect(
        shouldGoogleNoindexCommunityPost(
          post({ boardType: 'HUMOR', source, title: '갱년기 극복기', content: LONG }),
        ),
        source,
      ).toBe(true)
    }
  })

  it('MENOPAUSE(갱년기톡)는 짧아도 Google 색인 유지 — 전면 보호', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ boardType: 'MENOPAUSE' }))).toBe(false)
    expect(
      shouldGoogleNoindexCommunityPost(
        post({ boardType: 'MENOPAUSE', title: '오늘 날씨', content: null, source: 'BOT' }),
      ),
    ).toBe(false)
  })

  it('MAGAZINE·JOB·기타 보드는 대상이 아니다', () => {
    for (const boardType of ['MAGAZINE', 'JOB', 'NOTICE', 'UNKNOWN']) {
      expect(shouldGoogleNoindexCommunityPost(post({ boardType })), boardType).toBe(false)
    }
  })
})

describe('shouldGoogleNoindexCommunityPost — USER/ADMIN (사람이 쓴 글, E0)', () => {
  it('80자 이상이면 주제와 무관하게 색인 유지', () => {
    for (const source of ['USER', 'ADMIN']) {
      expect(
        shouldGoogleNoindexCommunityPost(post({ source, title: '오늘 점심 뭐 드셨어요', content: HUMAN_OK })),
        source,
      ).toBe(false)
    }
  })

  it('80자 미만이면 제외', () => {
    for (const source of ['USER', 'ADMIN']) {
      expect(shouldGoogleNoindexCommunityPost(post({ source, content: SHORT })), source).toBe(true)
    }
  })

  it('LIFE2에서도 동일하게 동작한다', () => {
    expect(
      shouldGoogleNoindexCommunityPost(post({ boardType: 'LIFE2', source: 'USER', content: HUMAN_OK })),
    ).toBe(false)
  })

  it('content가 null/빈 문자열이면 제외', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ source: 'USER', content: null }))).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(post({ source: 'USER', content: '' }))).toBe(true)
  })
})

describe('shouldGoogleNoindexCommunityPost — BOT/SHEET (자동 수집·생성, E0)', () => {
  it('150자 미만은 주제가 맞아도 무조건 제외', () => {
    for (const source of ['BOT', 'SHEET']) {
      expect(
        shouldGoogleNoindexCommunityPost(post({ source, title: '연금 수령 시기 고민', content: SHORT })),
        source,
      ).toBe(true)
    }
  })

  it('150~300자 구간은 주제가 맞아도 제외', () => {
    for (const source of ['BOT', 'SHEET']) {
      expect(
        shouldGoogleNoindexCommunityPost(post({ source, title: '연금 수령 시기 고민', content: BOT_MID })),
        source,
      ).toBe(true)
    }
  })

  it('300자 이상 + 주제어면 색인 유지', () => {
    for (const source of ['BOT', 'SHEET']) {
      expect(
        shouldGoogleNoindexCommunityPost(post({ source, title: '연금 수령 시기 고민', content: BOT_LONG })),
        source,
      ).toBe(false)
    }
  })

  it('300자 이상이어도 주제어가 없으면 제외', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ source: 'BOT', content: BOT_LONG }))).toBe(true)
  })

  it('확장 주제어(A좁에 없는 생활 어휘)도 인정된다', () => {
    // 남편·병원·가족은 isNarrowUnaeoIdentityTopic에서는 false지만 BOT/SHEET 게이트는 통과한다
    for (const kw of ['남편', '병원', '가족', '친구', '우울']) {
      expect(isNarrowUnaeoIdentityTopic({ title: `${kw} 이야기`, content: SHORT }), `narrow:${kw}`).toBe(false)
      expect(isWideLifeTopic({ title: `${kw} 이야기`, content: SHORT }), `wide:${kw}`).toBe(true)
      expect(
        shouldGoogleNoindexCommunityPost(post({ source: 'BOT', title: `${kw} 이야기`, content: BOT_LONG })),
        kw,
      ).toBe(false)
    }
  })

  it('알 수 없는 source는 BOT과 같은 엄격 기준으로 처리된다', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ source: 'UNKNOWN', content: HUMAN_OK }))).toBe(true)
    expect(
      shouldGoogleNoindexCommunityPost(post({ source: 'UNKNOWN', title: '연금', content: BOT_LONG })),
    ).toBe(false)
  })
})

describe('shouldGoogleNoindexCommunityPost — 제외된 기준(회귀 방지)', () => {
  it('자동 생성 SEO 메타는 더 이상 면제 사유가 아니다 — 입력에서 제거됐다', () => {
    // B3의 `seoTitle && seoDescription` 면제로 짧은 봇 글 다수가 색인됐던 회귀를 막는다.
    const input = post({ source: 'BOT', title: '연금 이야기', content: BOT_MID })
    expect(Object.keys(input)).not.toContain('seoTitle')
    expect(Object.keys(input)).not.toContain('seoDescription')
    expect(shouldGoogleNoindexCommunityPost(input)).toBe(true)
  })

  it('댓글·좋아요는 판정 입력이 아니다 (봇 글이 오히려 댓글이 많아 신호가 뒤집힘)', () => {
    const input = post({ source: 'BOT', content: BOT_LONG, title: '연금' })
    expect(Object.keys(input)).not.toContain('commentCount')
    expect(Object.keys(input)).not.toContain('likeCount')
  })

  it('HTML 태그만 잔뜩인 본문은 텍스트 길이로 세지 않는다', () => {
    const tagHeavy = `<div>${'<span class="x"></span>'.repeat(60)}</div>`
    expect(shouldGoogleNoindexCommunityPost(post({ source: 'USER', content: tagHeavy }))).toBe(true)
  })
})

/**
 * ── 제목 리라이팅 회귀 안전선 (2026-08-14) ──────────────────────────────
 *
 * 배경: Sonnet 제목 리라이팅을 붙이면 Post.title이 바뀐다. 그런데 noindex 판정은
 *   haystackOf(title + content)를 본다(community-google-noindex.ts:118).
 *   제목에서 주제어가 빠지면 **색인되던 글이 조용히 noindex로 뒤집힐 수 있다.**
 *   네이버 일반 robots는 영향받지 않지만, 구글 색인 정책이 소리 없이 바뀌는 건 위험하다.
 *
 * 이 블록의 역할: **정책을 바꾸지 않는다.** 제목 변경이 판정을 뒤집는 조건을 테스트로 고정해
 *   리라이팅 구현 시 어디를 조심해야 하는지 못박는다.
 *
 * 리라이팅 구현 시 지켜야 할 계약
 *   · 본문이 충분히 길고 주제어를 갖고 있으면 → 제목이 어떻게 바뀌어도 판정 불변 (아래 ①)
 *   · 본문에 주제어가 없고 제목에만 있었다면 → 제목에서 주제어를 빼면 뒤집힌다 (아래 ②)
 *     → 리라이팅 후보 gate가 본문 80자 이상을 요구하는 이유가 여기 있다.
 */
describe('제목 리라이팅 회귀 — 제목이 바뀌어도 noindex 판정이 조용히 뒤집히지 않는지', () => {
  /** 본문에 우리 나이 주제어가 실제로 들어 있는 긴 본문 (BOT 주제 하한 300자 통과 — 약 350자) */
  const BODY_WITH_TOPIC = `<p>${'갱년기 증상 때문에 요즘 잠을 잘 못 자고 있어요. 병원에 가봐야 하나 고민입니다. '.repeat(8)}</p>`

  it('① 본문이 주제어를 갖고 있으면 제목을 어떻게 바꿔도 판정이 같다 (리라이팅 안전 구간)', () => {
    const original = post({ source: 'BOT', title: '갱년기 불면 어떻게 견디세요', content: BODY_WITH_TOPIC })
    const rewritten = post({ source: 'BOT', title: '요즘 밤마다 뒤척이는데 저만 그런가요', content: BODY_WITH_TOPIC })
    // 제목에서 '갱년기'가 빠졌지만 본문이 갖고 있으므로 판정은 불변이어야 한다
    expect(shouldGoogleNoindexCommunityPost(rewritten))
      .toBe(shouldGoogleNoindexCommunityPost(original))
    expect(shouldGoogleNoindexCommunityPost(original)).toBe(false) // 둘 다 색인 유지
  })

  it('① 주제어를 제목에 더해도 판정이 뒤집히지 않는다 (본문이 이미 근거를 갖고 있음)', () => {
    const plain = post({ source: 'BOT', title: '요즘 밤마다 뒤척여요', content: BODY_WITH_TOPIC })
    const enriched = post({ source: 'BOT', title: '갱년기 불면 다들 어떻게 견디세요', content: BODY_WITH_TOPIC })
    expect(shouldGoogleNoindexCommunityPost(enriched))
      .toBe(shouldGoogleNoindexCommunityPost(plain))
  })

  it('② 🚨 본문에 주제어가 없고 제목에만 있었다면, 제목에서 빼는 순간 뒤집힌다', () => {
    // 이게 리라이팅의 진짜 위험 지점이다. 본문 80자 미만/주제어 없는 글을
    // 후보에서 제외해야 하는 이유를 이 테스트가 고정한다.
    const titleOnly = post({ source: 'BOT', title: '갱년기 이야기', content: BOT_LONG })
    const stripped = post({ source: 'BOT', title: '오늘 하루 어떠셨어요', content: BOT_LONG })
    expect(shouldGoogleNoindexCommunityPost(titleOnly)).toBe(false)  // 색인
    expect(shouldGoogleNoindexCommunityPost(stripped)).toBe(true)    // noindex로 반전 ⚠️
  })

  it('② 반전 위험은 BOT 경로 한정 — USER 글은 주제와 무관하게 분량만 본다', () => {
    const a = post({ source: 'USER', title: '갱년기 이야기', content: HUMAN_OK })
    const b = post({ source: 'USER', title: '오늘 하루 어떠셨어요', content: HUMAN_OK })
    expect(shouldGoogleNoindexCommunityPost(a)).toBe(shouldGoogleNoindexCommunityPost(b))
  })

  it('③ HUMOR는 제목과 무관하게 항상 noindex (리라이팅해도 불변)', () => {
    const a = post({ boardType: 'HUMOR', source: 'BOT', title: '갱년기 불면', content: BOT_LONG })
    const b = post({ boardType: 'HUMOR', source: 'BOT', title: '아무 말', content: BOT_LONG })
    expect(shouldGoogleNoindexCommunityPost(a)).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(b)).toBe(true)
  })

  it('③ MENOPAUSE는 주제 게이트 대상이 아니라 제목 변경에 영향받지 않는다', () => {
    const a = post({ boardType: 'MENOPAUSE', source: 'BOT', title: '갱년기 불면', content: BOT_LONG })
    const b = post({ boardType: 'MENOPAUSE', source: 'BOT', title: '아무 말', content: BOT_LONG })
    expect(shouldGoogleNoindexCommunityPost(a)).toBe(shouldGoogleNoindexCommunityPost(b))
    expect(shouldGoogleNoindexCommunityPost(a)).toBe(false)
  })
})
