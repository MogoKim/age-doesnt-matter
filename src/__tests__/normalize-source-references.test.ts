import { describe, it, expect } from 'vitest'
import { normalizeSourceReferences } from '../../agents/cafe/normalize-source-references'
import { replaceCafeReferences } from '../../agents/cafe/curator-shared'

/** 원문 출처 노출 제거 P0 (2026-07-16 창업자 승인) — 치환/불변/flag 계약 고정 */

const norm = (t: string) => normalizeSourceReferences(t)

describe('C. 원카페 회원 호칭 → 우나어 분들', () => {
  it('은오님들/레테님들/82님들/줌마렐라 회원님들', () => {
    expect(norm('은오님들 어떻게 생각하세요').text).toBe('우나어 분들 어떻게 생각하세요')
    expect(norm('레테님들 ㅠㅠ 올해 유독 더운거').text).toContain('우나어 분들')
    expect(norm('82님들 의견 주세요').text).toBe('우나어 분들 의견 주세요')
    expect(norm('줌마렐라 회원님들').text).toBe('우나어 분들')
  })
  it('외부명 결합 회원님들만 치환 — 82 회원님들/82쿡 회원님들/레테선배님들', () => {
    expect(norm('82 회원님들 안녕하세요').text).toBe('우나어 분들 안녕하세요')
    expect(norm('82쿡 회원님들').text).toBe('우나어 분들')
    expect(norm('레테선배님들께서 알려주세요').text).toContain('우나어 분들')
  })
  it("'회원님들' 단독은 불변 (우나어 내부에서도 자연스러움 — 창업자 확정)", () => {
    expect(norm('회원님들은 어떻게 생각하세요').replacements).toHaveLength(0)
  })
})

describe('B. 사이트명 → 우나어 (네이버 카페는 온라인 커뮤니티)', () => {
  it('레몬테라스/줌마렐라/줌말레라/82cook/82쿡/은오/우갱', () => {
    expect(norm('레몬테라스에서 봤는데').text).toBe('우나어에서 봤는데')
    expect(norm('줌말레라 글이래요').text).toBe('우나어 글이래요')
    expect(norm('82cook에서 유명한 글').text).toBe('우나어에서 유명한 글')
    expect(norm('82쿡 인기글').text).toContain('우나어')
    expect(norm('은오에 올라온 글').text).toBe('우나어에 올라온 글')
    expect(norm('우아한 갱년기 카페').text).toContain('우나어')
  })
  it('네이버 카페 → 온라인 커뮤니티 (자기지칭 어색 방지)', () => {
    expect(norm('네이버 카페에서 봤어요').text).toBe('온라인 커뮤니티에서 봤어요')
  })
})

describe('A. 출처 문구 — 삭제하지 않고 일반화 (HUMOR 유지 정책)', () => {
  it('출처: 82cook/네이버 카페/레몬테라스/펨코 → 출처: 온라인 커뮤니티', () => {
    expect(norm('출처: 82cook').text).toBe('출처: 온라인 커뮤니티')
    expect(norm('출처: 네이버 카페').text).toBe('출처: 온라인 커뮤니티')
    expect(norm('출처: 레몬테라스').text).toBe('출처: 온라인 커뮤니티')
    expect(norm('출처: 펨코').text).toBe('출처: 온라인 커뮤니티')
    expect(norm('출처: 오늘의유머').text).toBe('출처: 온라인 커뮤니티')
  })
})

describe('불변 계약 — 82 단독·일반 카페 문맥 절대 치환 금지', () => {
  it('82세/82년생/82만원/82번/82kg/숫자 82 단독', () => {
    for (const t of ['제 나이 82세인데요', '82년생 남편', '경비 82만원 나왔어요', '버스 82번', '몸무게 82kg', '82가 정답입니다']) {
      expect(norm(t).replacements, t).toHaveLength(0)
    }
  })
  it('동네 카페/카페라떼/카페라테/스터디 카페/레테랑', () => {
    for (const t of ['동네 카페 다녀왔어요', '카페라떼 한 잔', '카페라테 시켰어요', '스터디 카페 등록', '레테랑 비슷한 향']) {
      expect(norm(t).replacements, t).toHaveLength(0)
    }
  })
})

describe('D. 맥락 의존 표현 — 치환·차단 없이 flag만 (Haiku/rule gate 몫)', () => {
  it('원글/이전글/이 카페/댓글 보니 → flags 기록, 본문 불변', () => {
    const r = norm('원글은 내릴게요. 댓글 보니 다들 그러시네요')
    expect(r.text).toContain('원글')
    expect(r.flags).toEqual(expect.arrayContaining(['원글', '댓글보니/인기글']))
    expect(norm('이 카페 글 읽다보면').flags).toContain('이/우리 카페')
    expect(norm('지난 글에서 말씀드렸듯').flags).toContain('이전글/지난글')
  })
})

describe('반환 구조·호환', () => {
  it('replacements에 원문→치환 기록', () => {
    const r = norm('은오님들 그리고 출처: 82cook')
    expect(r.replacements).toEqual(
      expect.arrayContaining([
        ['은오님들', '우나어 분들'],
        ['출처: 82cook', '출처: 온라인 커뮤니티'],
      ]),
    )
  })
  it('기존 replaceCafeReferences는 새 사전으로 동작 (기존 CURATE/wave 경로 자동 커버)', () => {
    expect(replaceCafeReferences('레테님들 우갱에서 봤어요')).toBe('우나어 분들 우나어에서 봤어요')
    expect(replaceCafeReferences('은오 글')).toBe('우나어 글') // 기존 사전 회귀
  })
})
