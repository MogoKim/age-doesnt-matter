import { describe, expect, it } from 'vitest'
import {
  NAVER_ORIGIN_FILTER, PRODUCTION_PROJECT_REF_SHA256, isProductionProjectRef, EXPECTED, checkBaseline, decidePost, isNaverOrigin,
  assertNoUserPosts, assertMutationIsScoped, TOMBSTONE_PATCH, CONTENT_BEARING_FIELDS, isTombstoned,
  redactForLog, type BaselineActual,
} from './naver-origin-policy.js'

const baseline = (over: Partial<BaselineActual> = {}): BaselineActual => ({
  postTotal: EXPECTED.postTotal,
  naverOrigin: EXPECTED.naverOrigin,
  naverOriginPublic: 0,
  tombstonePosts: EXPECTED.tombstonePosts,
  hardDeletePosts: EXPECTED.hardDeletePosts,
  cafePost: EXPECTED.cafePost,
  cafeTrend: EXPECTED.cafeTrend,
  commentWaveQueue: EXPECTED.commentWaveQueue,
  ...over,
})

describe('[T6] 네이버 유래 판정 — 회귀 방지', () => {
  it('대상 정의 문자열이 바뀌지 않았다 (SSoT)', () => {
    expect(NAVER_ORIGIN_FILTER).toBe('or=(cafePostId.not.is.null,sourceUrl.ilike.*cafe.naver.com*)')
  })

  it('cafePostId 가 있으면 네이버 유래다', () => {
    expect(isNaverOrigin({ cafePostId: 'c1', sourceUrl: null })).toBe(true)
  })

  it('sourceUrl 이 cafe.naver.com 이면 네이버 유래다 (대소문자 무관)', () => {
    expect(isNaverOrigin({ cafePostId: null, sourceUrl: 'https://CAFE.NAVER.COM/x/1' })).toBe(true)
  })

  it('다른 외부 커뮤니티(Google Sheet 경로)는 네이버 유래가 아니다', () => {
    for (const u of ['https://www.todayhumor.co.kr/a', 'https://pann.nate.com/b', 'https://www.fmkorea.com/c']) {
      expect(isNaverOrigin({ cafePostId: null, sourceUrl: u })).toBe(false)
    }
  })

  it('출처가 아예 없으면 네이버 유래가 아니다 — 레거시 164건이 여기 해당한다', () => {
    expect(isNaverOrigin({ cafePostId: null, sourceUrl: null })).toBe(false)
  })
})

describe('[T1] USER Post 는 어떤 경우에도 대상이 아니다 — fail closed', () => {
  it('USER 는 네이버 표식이 있어도 PRESERVE 다', () => {
    expect(decidePost({ source: 'USER', cafePostId: 'c1', sourceUrl: null, hasHumanTrace: false })).toBe('PRESERVE')
    expect(decidePost({ source: 'USER', cafePostId: null, sourceUrl: 'https://cafe.naver.com/x', hasHumanTrace: true })).toBe('PRESERVE')
  })

  it('후보에 USER 가 1건이라도 있으면 던진다', () => {
    expect(() => assertNoUserPosts([{ source: 'BOT' }, { source: 'USER' }])).toThrow(/FAIL-CLOSED/)
  })

  it('USER 가 없으면 통과한다', () => {
    expect(() => assertNoUserPosts([{ source: 'BOT' }, { source: 'SHEET' }, { source: 'ADMIN' }])).not.toThrow()
  })
})

describe('처분 판정', () => {
  it('실회원 흔적이 없으면 hard delete', () => {
    expect(decidePost({ source: 'BOT', cafePostId: 'c1', sourceUrl: null, hasHumanTrace: false })).toBe('DELETE')
  })

  it('실회원 흔적이 있으면 tombstone — cascade 로 사람 흔적을 지우지 않는다', () => {
    expect(decidePost({ source: 'BOT', cafePostId: 'c1', sourceUrl: null, hasHumanTrace: true })).toBe('TOMBSTONE')
  })

  it('네이버 유래가 아니면 흔적 여부와 무관하게 PRESERVE', () => {
    expect(decidePost({ source: 'BOT', cafePostId: null, sourceUrl: null, hasHumanTrace: false })).toBe('PRESERVE')
    expect(decidePost({ source: 'SHEET', cafePostId: null, sourceUrl: 'https://pann.nate.com/x', hasHumanTrace: false })).toBe('PRESERVE')
  })
})

describe('[T2] 예상 건수 불일치 시 중단', () => {
  it('기준선과 같으면 위반 0', () => {
    expect(checkBaseline(baseline())).toEqual([])
  })

  it('네이버 유래 건수가 다르면 위반', () => {
    expect(checkBaseline(baseline({ naverOrigin: 7448, hardDeletePosts: 7222 })).map((v) => v.key)).toContain('naverOrigin')
  })

  it('CafePost·CafeTrend·CommentWaveQueue 는 정확히 일치해야 한다', () => {
    expect(checkBaseline(baseline({ cafePost: 33_030 })).map((v) => v.key)).toContain('cafePost')
    expect(checkBaseline(baseline({ cafeTrend: 190 })).map((v) => v.key)).toContain('cafeTrend')
    expect(checkBaseline(baseline({ commentWaveQueue: 275 })).map((v) => v.key)).toContain('commentWaveQueue')
  })

  it('공개된 네이버 유래 글이 생기면 위반 — 전제가 무너진 것이다', () => {
    expect(checkBaseline(baseline({ naverOriginPublic: 1 })).map((v) => v.key)).toContain('naverOriginPublic')
  })

  it('실회원 흔적이 늘어난 것(tombstone 증가)은 허용한다', () => {
    expect(checkBaseline(baseline({ tombstonePosts: 230, hardDeletePosts: 7219 }))).toEqual([])
  })

  it('실회원 흔적이 줄어든 것은 위반이다', () => {
    expect(checkBaseline(baseline({ tombstonePosts: 225, hardDeletePosts: 7224 })).map((v) => v.key)).toContain('tombstonePosts')
  })

  it('tombstone + hardDelete 가 전체와 안 맞으면 위반', () => {
    expect(checkBaseline(baseline({ hardDeletePosts: 7000 })).map((v) => v.key)).toContain('tombstone+hardDelete')
  })
})

describe('[T5] 필터 없는 mutation 금지', () => {
  it('필터가 없으면 던진다', () => {
    expect(() => assertMutationIsScoped('Post')).toThrow(/FAIL-CLOSED/)
    expect(() => assertMutationIsScoped('CafePost?select=id&limit=10')).toThrow(/FAIL-CLOSED/)
  })

  it('필터가 있으면 통과한다', () => {
    expect(() => assertMutationIsScoped('Post?id=in.("a","b")')).not.toThrow()
    expect(() => assertMutationIsScoped('CafePost?id=not.is.null')).not.toThrow()
  })
})

describe('[T9] tombstone 후 복원 가능한 필드가 남지 않는다', () => {
  it('콘텐츠 보유 필드를 전부 덮는다', () => {
    expect(CONTENT_BEARING_FIELDS.sort()).toEqual([
      'cafePostId', 'content', 'originalTitle', 'seoDescription', 'seoTitle',
      'slug', 'sourceSite', 'sourceUrl', 'summary', 'thumbnailUrl', 'title',
    ].sort())
  })

  it('NOT NULL 인 title·content 만 고정 문구, 나머지는 전부 null', () => {
    expect(TOMBSTONE_PATCH.title).toBe('삭제된 글')
    expect(TOMBSTONE_PATCH.content).toBe('이 글은 삭제되었습니다.')
    for (const f of CONTENT_BEARING_FIELDS) {
      if (f === 'title' || f === 'content') continue
      expect(TOMBSTONE_PATCH[f]).toBeNull()
    }
  })

  it('slug 는 null 이어야 한다 — 고정 문구면 @unique 충돌로 두 번째 글부터 실패한다', () => {
    expect(TOMBSTONE_PATCH.slug).toBeNull()
  })

  it('원문이 한 필드라도 남으면 tombstone 이 아니다', () => {
    const done = { ...TOMBSTONE_PATCH }
    expect(isTombstoned(done)).toBe(true)
    expect(isTombstoned({ ...done, slug: 'still-here' })).toBe(false)
    expect(isTombstoned({ ...done, seoDescription: 'still here' })).toBe(false)
  })
})

describe('[T7] 로그에 title/content/comment/secret 이 실리지 않는다', () => {
  it('허용 키가 아니면 값을 가린다', () => {
    const out = redactForLog({ step: 'S2', table: 'Post', deleted: 3, title: '원문 제목', content: '원문 본문', nickname: '닉네임' }) as Record<string, unknown>
    expect(out.step).toBe('S2')
    expect(out.deleted).toBe(3)
    expect(out.title).toBe('[redacted]')
    expect(out.content).toBe('[redacted]')
    expect(out.nickname).toBe('[redacted]')
  })

  it('service role key 같은 긴 문자열은 그대로 나가지 않는다', () => {
    const out = redactForLog({ apikey: 'x'.repeat(200) }) as Record<string, unknown>
    expect(JSON.stringify(out)).not.toContain('xxxxxxxxxx')
  })

  it('배열은 길이만 남긴다 — row ID 목록이 새지 않는다', () => {
    expect(redactForLog({ step: ['id1', 'id2', 'id3'] })).toEqual({ step: '[3 items]' })
  })

  it('집계 건수는 숫자 그대로 보인다 — 운영자가 기준선을 대조해야 한다', () => {
    const out = redactForLog({ before: { naverOrigin: 7449, cafePost: 33031, title: '원문' } }) as { before: Record<string, unknown> }
    expect(out.before.naverOrigin).toBe(7449)
    expect(out.before.cafePost).toBe(33031)
    expect(out.before.title).toBe('[redacted]')
  })
})

describe('project ref allowlist — 평문 노출 없이 고정한다', () => {
  it('해시만 저장한다 (공개 저장소에 ref 평문을 넣지 않는다)', () => {
    expect(PRODUCTION_PROJECT_REF_SHA256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('다른 project ref 는 거부한다', () => {
    expect(isProductionProjectRef('some-other-project')).toBe(false)
    expect(isProductionProjectRef('')).toBe(false)
  })

  it('환경변수의 실제 ref 만 통과한다', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) return // CI 에는 운영 env 가 없다 — 그 경우 이 단언은 건너뛴다
    expect(isProductionProjectRef(new URL(url).host.split('.')[0])).toBe(true)
  })
})
