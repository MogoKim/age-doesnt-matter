import { describe, expect, it } from 'vitest'
import {
  NAVER_ORIGIN_FILTER, PRODUCTION_PROJECT_REF_SHA256, isProductionProjectRef, EXPECTED,
  isHumanProviderId, POST_FK_ON_DELETE, RESTRICTING_TABLES,
  checkStartState, checkFinalState, completedSteps, decidePost, isNaverOrigin,
  assertNoUserPosts, assertMutationIsScoped, assertPageIntegrity,
  TOMBSTONE_PATCH, CONTENT_BEARING_FIELDS, isTombstoned, redactForLog, STEPS,
  type LiveCounts, type PurgeExpectation,
} from './naver-origin-policy.js'

const START: LiveCounts = {
  naverOrigin: EXPECTED.naverOrigin,
  naverOriginPublic: 0,
  tombstoneSignature: 0,
  botCommentsOnNaver: EXPECTED.botCommentsOnTombstone,
  humanCommentsOnTombstone: EXPECTED.humanCommentsOnTombstone,
  nullAuthorCommentsOnTombstone: EXPECTED.nullAuthorCommentsOnTombstone,
  guestLikesOnNaver: EXPECTED.guestLikesOnNaver,
  reportsOnNaver: EXPECTED.reportsOnNaver,
  homeCurationOnNaver: EXPECTED.homeCurationOnNaver,
  cafePost: EXPECTED.cafePost,
  cafeTrend: EXPECTED.cafeTrend,
  commentWaveQueue: EXPECTED.commentWaveQueue,
  botLogPurgeTargets: EXPECTED.botLogPurgeTargets,
  r2Remaining: EXPECTED.r2Objects,
  publicUserPosts: 73,
}
const EXP: PurgeExpectation = {
  naverOrigin: EXPECTED.naverOrigin,
  tombstonePosts: EXPECTED.tombstonePosts,
  humanCommentsOnTombstone: EXPECTED.humanCommentsOnTombstone,
  nullAuthorCommentsOnTombstone: EXPECTED.nullAuthorCommentsOnTombstone,
  guestLikesOnNaver: EXPECTED.guestLikesOnNaver,
  reportsOnNaver: EXPECTED.reportsOnNaver,
  homeCurationOnNaver: EXPECTED.homeCurationOnNaver,
  cafePost: EXPECTED.cafePost,
  cafeTrend: EXPECTED.cafeTrend,
  commentWaveQueue: EXPECTED.commentWaveQueue,
  botLogPurgeTargets: EXPECTED.botLogPurgeTargets,
  r2Objects: EXPECTED.r2Objects,
  publicUserPosts: 73,
}

const DONE: LiveCounts = {
  ...START,
  naverOrigin: 0, tombstoneSignature: EXPECTED.tombstonePosts, botCommentsOnNaver: 0,
  cafePost: 0, cafeTrend: 0, commentWaveQueue: 0, botLogPurgeTargets: 0, r2Remaining: 0,
}

describe('[T6] 네이버 유래 판정 — 회귀 방지', () => {
  it('대상 정의 문자열이 바뀌지 않았다 (SSoT)', () => {
    expect(NAVER_ORIGIN_FILTER).toBe('or=(cafePostId.not.is.null,sourceUrl.ilike.*cafe.naver.com*)')
  })
  it('cafePostId 또는 cafe.naver.com sourceUrl 이면 대상', () => {
    expect(isNaverOrigin({ cafePostId: 'c1', sourceUrl: null })).toBe(true)
    expect(isNaverOrigin({ cafePostId: null, sourceUrl: 'https://CAFE.NAVER.COM/x/1' })).toBe(true)
  })
  it('다른 외부 커뮤니티·출처 없음은 대상이 아니다', () => {
    for (const u of ['https://www.todayhumor.co.kr/a', 'https://pann.nate.com/b', 'https://www.fmkorea.com/c']) {
      expect(isNaverOrigin({ cafePostId: null, sourceUrl: u })).toBe(false)
    }
    expect(isNaverOrigin({ cafePostId: null, sourceUrl: null })).toBe(false)
  })
})

describe('[T2-SSoT] 실회원 판정은 순수 숫자 providerId 다', () => {
  it('숫자면 사람', () => {
    expect(isHumanProviderId('123456789')).toBe(true)
    expect(isHumanProviderId('0')).toBe(true)
  })
  it('비숫자는 전부 봇 — 접두어 목록에 없던 형태도 봇으로 잡힌다', () => {
    for (const p of ['bot_1', 'seed-3', 'curator9', 'persona_x', 'withdrawn_123', 'abc', '', null, undefined, '12a', ' 12']) {
      expect(isHumanProviderId(p)).toBe(false)
    }
  })
  it('실측 기준선이 정본 상태판(188명)과 같다', () => {
    expect(EXPECTED.humanUsers).toBe(188)
  })
})

describe('[T3-FK] FK 는 migration 기준이다 — schema 와 어긋난다', () => {
  it('HomeCurationOverride 와 Report 는 RESTRICT 다', () => {
    expect(POST_FK_ON_DELETE.HomeCurationOverride).toBe('RESTRICT')
    expect(POST_FK_ON_DELETE.Report).toBe('RESTRICT')
    expect(RESTRICTING_TABLES.sort()).toEqual(['HomeCurationOverride', 'Report'])
  })
  it('RESTRICT 참조가 있는 글은 hard delete 가 아니라 tombstone 이다', () => {
    expect(decidePost({ source: 'BOT', cafePostId: 'c', sourceUrl: null, traces: ['home-curation'] })).toBe('TOMBSTONE')
    expect(decidePost({ source: 'BOT', cafePostId: 'c', sourceUrl: null, traces: ['report'] })).toBe('TOMBSTONE')
  })
})

describe('[T1] USER Post 는 어떤 경우에도 대상이 아니다 — fail closed', () => {
  it('USER 는 네이버 표식이 있어도 PRESERVE', () => {
    expect(decidePost({ source: 'USER', cafePostId: 'c1', sourceUrl: null, traces: [] })).toBe('PRESERVE')
  })
  it('후보에 USER 가 1건이라도 있으면 던진다', () => {
    expect(() => assertNoUserPosts([{ source: 'BOT' }, { source: 'USER' }])).toThrow(/FAIL-CLOSED/)
    expect(() => assertNoUserPosts([{ source: 'BOT' }, { source: 'SHEET' }])).not.toThrow()
  })
})

describe('처분 판정', () => {
  it('흔적 없으면 hard delete, 있으면 tombstone', () => {
    expect(decidePost({ source: 'BOT', cafePostId: 'c', sourceUrl: null, traces: [] })).toBe('DELETE')
    for (const t of ['comment-human', 'comment-null', 'like-human', 'guestlike'] as const) {
      expect(decidePost({ source: 'BOT', cafePostId: 'c', sourceUrl: null, traces: [t] })).toBe('TOMBSTONE')
    }
  })
  it('실측 분기 합이 전체와 같다', () => {
    expect(EXPECTED.tombstonePosts + EXPECTED.hardDeletePosts).toBe(EXPECTED.naverOrigin)
  })
})

describe('[T1-조회] keyset pagination 무결성', () => {
  it('중복 ID 가 있으면 던진다', () => {
    expect(() => assertPageIntegrity('t', ['a', 'b', 'a'], 3)).toThrow(/중복 ID/)
  })
  it('exact count 와 다르면 누락으로 보고 던진다', () => {
    expect(() => assertPageIntegrity('t', ['a', 'b'], 3)).toThrow(/누락/)
  })
  it('중복 없고 수가 맞으면 통과', () => {
    expect(() => assertPageIntegrity('t', ['a', 'b', 'c'], 3)).not.toThrow()
  })
})

describe('[T2] 시작 상태 검사 — 재실행을 막지 않되 늘어나면 중단', () => {
  it('처음 상태는 통과', () => {
    expect(checkStartState(START, EXP)).toEqual([])
  })
  it('중간까지 진행된 상태(줄어든 방향)도 통과 — resume 가능', () => {
    expect(checkStartState({ ...START, botLogPurgeTargets: 0, r2Remaining: 0, naverOrigin: 324, tombstoneSignature: 0 }, EXP)).toEqual([])
  })
  it('대상이 예상보다 늘어나면 중단', () => {
    expect(checkStartState({ ...START, cafePost: EXPECTED.cafePost + 1 }, EXP).map((v) => v.key)).toContain('cafePost')
  })
  it('보존 대상이 한 건이라도 줄면 중단', () => {
    for (const k of ['humanCommentsOnTombstone', 'nullAuthorCommentsOnTombstone', 'guestLikesOnNaver', 'reportsOnNaver', 'homeCurationOnNaver'] as const) {
      expect(checkStartState({ ...START, [k]: START[k] - 1 }, EXP).map((v) => v.key)).toContain(k)
    }
  })
  it('공개된 네이버 유래 글이 생기면 중단', () => {
    expect(checkStartState({ ...START, naverOriginPublic: 1 }, EXP).map((v) => v.key)).toContain('naverOriginPublic')
  })
  it('tombstone 서명이 예상 총량을 넘으면 중단 — 대상 밖 글을 덮은 것이다', () => {
    expect(checkStartState({ ...START, tombstoneSignature: EXPECTED.tombstonePosts + 1 }, EXP).map((v) => v.key)).toContain('tombstoneSignature')
  })
})

describe('[T4] 최종 검증 — 하나라도 어긋나면 done 이 아니다', () => {
  it('전부 0/일치면 통과', () => {
    expect(checkFinalState(DONE, EXP)).toEqual([])
  })
  it.each([
    ['naverOrigin', 1], ['botCommentsOnNaver', 1], ['cafePost', 1], ['cafeTrend', 1],
    ['commentWaveQueue', 1], ['botLogPurgeTargets', 1], ['r2Remaining', 1],
  ] as const)('%s 이 0 이 아니면 실패', (k, v) => {
    expect(checkFinalState({ ...DONE, [k]: v }, EXP).map((x) => x.key)).toContain(k)
  })
  it('tombstone 서명 수가 예상과 다르면 실패', () => {
    expect(checkFinalState({ ...DONE, tombstoneSignature: EXPECTED.tombstonePosts - 1 }, EXP).map((v) => v.key)).toContain('tombstoneSignature')
  })
  it('보존 수치가 달라지면 실패', () => {
    expect(checkFinalState({ ...DONE, humanCommentsOnTombstone: 70 }, EXP).map((v) => v.key)).toContain('humanCommentsOnTombstone')
    // 실행 중 실회원이 새 글을 쓰면 늘어난다 — 허용
    expect(checkFinalState({ ...DONE, publicUserPosts: 80 }, EXP)).toEqual([])
    // 줄어들면 실패
    expect(checkFinalState({ ...DONE, publicUserPosts: 72 }, EXP).map((v) => v.key)).toContain('publicUserPosts')
  })
})

describe('[T8-resume] 라이브 카운트로 완료 단계를 판정한다', () => {
  it('시작 상태에서는 완료 단계가 없다', () => {
    expect(completedSteps(START, EXP).size).toBe(0)
  })
  it('끝난 상태에서는 전 단계가 완료다', () => {
    expect(completedSteps(DONE, EXP).size).toBe(STEPS.length)
  })
  it('P0·P1 만 끝난 중간 상태를 정확히 읽는다', () => {
    const mid = { ...START, botLogPurgeTargets: 0, r2Remaining: 0 }
    expect([...completedSteps(mid, EXP)].sort()).toEqual(['P0-botlog', 'P1-r2'])
  })
  it('hard delete 까지 끝나면 P2 가 완료로 잡힌다 (잔량 = tombstone 대상)', () => {
    const mid = { ...START, botLogPurgeTargets: 0, r2Remaining: 0, naverOrigin: EXPECTED.tombstonePosts }
    expect(completedSteps(mid, EXP).has('P2-hard-delete')).toBe(true)
    expect(completedSteps(mid, EXP).has('P4-tombstone')).toBe(false)
  })
})

describe('[T5] 필터 없는 mutation 금지', () => {
  it('필터가 없으면 던진다', () => {
    expect(() => assertMutationIsScoped('Post')).toThrow(/FAIL-CLOSED/)
    expect(() => assertMutationIsScoped('CafePost?select=id&limit=10')).toThrow(/FAIL-CLOSED/)
  })
  it('필터가 있으면 통과', () => {
    expect(() => assertMutationIsScoped('Post?id=in.("a","b")')).not.toThrow()
  })
})

describe('[T9] tombstone 후 복원 가능한 필드가 남지 않는다', () => {
  it('category·series·controversy 까지 덮는다', () => {
    for (const f of ['category', 'seriesId', 'seriesTitle', 'seasonId', 'controversyChainId']) {
      expect(CONTENT_BEARING_FIELDS).toContain(f)
    }
  })
  it('NOT NULL 인 title·content 만 고정 문구, 나머지는 전부 null', () => {
    for (const f of CONTENT_BEARING_FIELDS) {
      if (f === 'title' || f === 'content') { expect(typeof TOMBSTONE_PATCH[f]).toBe('string'); continue }
      expect(TOMBSTONE_PATCH[f]).toBeNull()
    }
  })
  it('slug 는 null 이어야 한다 — 고정 문구면 @unique 충돌이 난다', () => {
    expect(TOMBSTONE_PATCH.slug).toBeNull()
  })
  it('한 필드라도 남으면 tombstone 이 아니다', () => {
    expect(isTombstoned({ ...TOMBSTONE_PATCH })).toBe(true)
    for (const f of ['slug', 'category', 'seoDescription', 'seriesTitle'] as const) {
      expect(isTombstoned({ ...TOMBSTONE_PATCH, [f]: 'still here' })).toBe(false)
    }
  })
})

describe('[T7] 로그 마스킹', () => {
  it('콘텐츠 키는 가리고 집계 키는 남긴다', () => {
    const out = redactForLog({ step: 'P4-tombstone', naverOrigin: 7449, title: '원문', content: '본문', nickname: '닉' }) as Record<string, unknown>
    expect(out.step).toBe('P4-tombstone')
    expect(out.naverOrigin).toBe(7449)
    for (const k of ['title', 'content', 'nickname']) expect(out[k]).toBe('[redacted]')
  })
  it('긴 문자열(secret)과 배열(ID 목록)은 새지 않는다', () => {
    expect(JSON.stringify(redactForLog({ apikey: 'x'.repeat(200) }))).not.toContain('xxxxxxxxxx')
    expect(redactForLog({ step: ['id1', 'id2'] })).toEqual({ step: '[2 items]' })
  })
})

describe('project ref allowlist — 평문 노출 없이 고정', () => {
  it('해시만 저장한다', () => {
    expect(PRODUCTION_PROJECT_REF_SHA256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('다른 ref 는 거부', () => {
    expect(isProductionProjectRef('some-other-project')).toBe(false)
    expect(isProductionProjectRef('')).toBe(false)
  })
})
