/**
 * 공개 콘텐츠 영구 삭제 — **실패 경로** 테스트.
 *
 * 롤백이 없는 도구다. 그래서 "잘 지워지는가"보다
 * **"지우면 안 될 때 멈추는가"**를 훨씬 더 많이 본다.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseCsv, toPurgeRows, buildPlan, detectDrift, assertCsvIntegrity, assertR2ManifestIntegrity,
  classifyRunState, blockingSemanticIssues, residualSemanticIssues, verifyAfterPurge,
  isRealMember, protectionReasons, fingerprint, tag, keyTag, sha12,
  EXPECTED_TOTAL, EXPECTED_ORIGIN_COUNTS, EXPECTED_PRESERVE_TOTAL, R2_MANIFEST_KEYS,
  SEMANTIC_REFS, PROTECTION_AXES, WITHDRAWN_PREFIX,
  type PurgeRow, type LiveRow, type SemanticCount,
} from './public-content-policy.js'
import {
  planR2Deletion, toObjectKey, extractImageUrls, classifyHead, classifyDelete, R2_PUBLIC_HOSTS,
} from './r2-objects.js'
import {
  executePurge, PurgeAbortError, type PurgeTx, type TransactionRunner,
} from './public-content-exec.js'
import { signHeaders, objectUrl, deleteObject, runR2Cleanup, type FetchLike, type R2Config } from './r2-client.js'
import { parseArgs, isExecutionAuthorized, preserveIdsFrom, findDeadLinkRows } from '../coo/public-content-purge.js'

const ROOT = resolve(__dirname, '../..')
const RAW = readFileSync(resolve(ROOT, 'docs/operations/data/2026-09-14-public-content-purge.csv'), 'utf8')
const MANIFEST = readFileSync(resolve(ROOT, 'docs/operations/data/2026-09-14-public-content-purge-r2.txt'), 'utf8')
const ROWS = toPurgeRows(parseCsv(RAW))

// ── 확정 입력 계약 ────────────────────────────────────────────
describe('확정 입력 계약', () => {
  it('CSV SHA-256 이 코드에 박힌 값과 같다', () => {
    expect(() => assertCsvIntegrity(RAW)).not.toThrow()
  })
  it('CSV 가 한 글자만 바뀌어도 ABORT', () => {
    expect(() => assertCsvIntegrity(RAW + ' ')).toThrow(/변조/)
  })
  it('R2 manifest SHA-256 이 코드에 박힌 값과 같다', () => {
    expect(() => assertR2ManifestIntegrity(MANIFEST)).not.toThrow()
  })
  it('R2 manifest 가 한 줄만 바뀌어도 ABORT', () => {
    expect(() => assertR2ManifestIntegrity(MANIFEST + 'extra/key.jpg\n')).toThrow(/변조/)
  })
  it('manifest 키 수가 기대와 같고 중복이 없다', () => {
    const keys = MANIFEST.trim().split('\n')
    expect(keys).toHaveLength(R2_MANIFEST_KEYS)
    expect(new Set(keys).size).toBe(R2_MANIFEST_KEYS)
  })
  it('628행 · 전건 PUBLISHED · 출처 분해 일치 · 중복 없음', () => {
    expect(ROWS).toHaveLength(EXPECTED_TOTAL)
    expect(ROWS.every((r) => r.expectedStatus === 'PUBLISHED')).toBe(true)
    const got: Record<string, number> = {}
    for (const r of ROWS) got[r.originAction] = (got[r.originAction] ?? 0) + 1
    expect(got).toEqual(EXPECTED_ORIGIN_COUNTS)
    expect(new Set(ROWS.map((r) => r.id)).size).toBe(EXPECTED_TOTAL)
  })
  it('drift 잠금 열이 실제로 채워져 있다', () => {
    expect(ROWS.every((r) => /^[0-9a-f]{12}$/.test(r.contentSha256_12))).toBe(true)
    expect(ROWS.every((r) => !Number.isNaN(Date.parse(r.updatedAt)))).toBe(true)
  })
  it('실제 CSV 로 세운 계획에 이슈가 0건', () => {
    expect(buildPlan(ROWS).issues).toEqual([])
  })
})

describe('후보 누락·중복·변조', () => {
  it('한 건이 빠지면 ROW_COUNT', () => {
    expect(buildPlan(ROWS.slice(1)).issues.some((i) => i.code === 'ROW_COUNT')).toBe(true)
  })
  it('중복이면 DUPLICATE_ID', () => {
    expect(buildPlan([...ROWS.slice(0, EXPECTED_TOTAL - 1), ROWS[0]]).issues.some((i) => i.code === 'DUPLICATE_ID')).toBe(true)
  })
  it('출처 분해가 어긋나면 ORIGIN_COUNT', () => {
    const bent = ROWS.map((r, i) => (i === 0 ? { ...r, originAction: 'KEEP_NOINDEX' } : r))
    expect(buildPlan(bent).issues.some((i) => i.code === 'ORIGIN_COUNT')).toBe(true)
  })
  it('해시 열이 깨지면 BAD_HASH_COLUMN', () => {
    const bent = ROWS.map((r, i) => (i === 0 ? { ...r, contentSha256_12: 'zzz' } : r))
    expect(buildPlan(bent).issues.some((i) => i.code === 'BAD_HASH_COLUMN')).toBe(true)
  })
  it('updatedAt 이 날짜가 아니면 BAD_UPDATED_AT', () => {
    const bent = ROWS.map((r, i) => (i === 0 ? { ...r, updatedAt: '어제' } : r))
    expect(buildPlan(bent).issues.some((i) => i.code === 'BAD_UPDATED_AT')).toBe(true)
  })
})

describe('보호 대상 혼입', () => {
  const preserve = Array.from({ length: EXPECTED_PRESERVE_TOTAL }, (_, i) => `keep-${i}`)
  it('겹치지 않으면 통과', () => expect(buildPlan(ROWS, preserve).issues).toEqual([]))
  it('보존 대상이 섞이면 PRESERVE_OVERLAP', () => {
    expect(buildPlan(ROWS, [...preserve.slice(1), ROWS[0].id]).issues.some((i) => i.code === 'PRESERVE_OVERLAP')).toBe(true)
  })
  it('보존 대상이 줄면 PRESERVE_COUNT', () => {
    expect(buildPlan(ROWS, preserve.slice(1)).issues.some((i) => i.code === 'PRESERVE_COUNT')).toBe(true)
  })
})

// ── 탈퇴 실회원 ───────────────────────────────────────────────
describe('🔴 익명화된 탈퇴 실회원도 실제 회원이다', () => {
  it(`${WITHDRAWN_PREFIX}<숫자> 는 실회원으로 본다`, () => {
    expect(isRealMember({ providerId: 'withdrawn_3812345678', role: 'USER' })).toBe(true)
  })
  it('현역 카카오 숫자 ID 도 실회원', () => {
    expect(isRealMember({ providerId: '3812345678', role: 'USER' })).toBe(true)
  })
  it('봇 페르소나는 실회원이 아니다', () => {
    expect(isRealMember({ providerId: 'persona-A', role: 'USER' })).toBe(false)
    expect(isRealMember({ providerId: 'withdrawn_persona-A', role: 'USER' })).toBe(false)
  })
  it('ADMIN 은 실회원으로 보지 않는다', () => {
    expect(isRealMember({ providerId: '3812345678', role: 'ADMIN' })).toBe(false)
  })
  it('작성자가 없으면 실회원이 아니다', () => {
    expect(isRealMember(null)).toBe(false)
    expect(isRealMember(undefined)).toBe(false)
  })
})

// ── drift ─────────────────────────────────────────────────────
const liveOf = (r: PurgeRow, over: Partial<LiveRow> = {}): LiveRow => ({
  id: r.id, boardType: r.boardType, status: 'PUBLISHED', source: r.source,
  authorIdSha256_12: r.authorIdSha256_12, titleSha256_12: r.titleSha256_12,
  contentSha256_12: r.contentSha256_12, updatedAt: r.updatedAt,
  hasRealAuthor: false, hasRealComment: false, hasGuestComment: false,
  hasRealLike: false, hasRealScrap: false, ...over,
})
const SOME = ROWS.slice(0, 6)

describe('drift 는 여섯 축을 잠그고 updatedAt 은 관측만 한다', () => {
  it('전건 일치면 이슈 0', () => {
    const d = detectDrift(SOME, SOME.map((r) => liveOf(r)))
    expect(d.issues).toEqual([])
    expect(d.deletable).toHaveLength(SOME.length)
  })

  const axes: [string, Partial<LiveRow>][] = [
    ['DRIFT_STATUS', { status: 'DELETED' }],
    ['DRIFT_BOARD_TYPE', { boardType: 'NOTICE' }],
    ['DRIFT_SOURCE', { source: 'SOMETHING_ELSE' }],
    ['DRIFT_AUTHOR', { authorIdSha256_12: 'aaaaaaaaaaaa' }],
    ['DRIFT_TITLE', { titleSha256_12: 'bbbbbbbbbbbb' }],
    ['DRIFT_CONTENT', { contentSha256_12: 'cccccccccccc' }],
  ]
  for (const [code, over] of axes) {
    it(`${code} 를 잡고 그 글은 지우지 않는다`, () => {
      const live = SOME.map((r, i) => liveOf(r, i === 0 ? over : {}))
      const d = detectDrift(SOME, live)
      expect(d.issues.some((x) => x.code === code)).toBe(true)
      expect(d.deletable).not.toContain(SOME[0].id)
    })
  }

  it('🔴 boardType 은 전체 허용목록이 아니라 ID 별 기대값이다', () => {
    // 확정 CSV 안에 실제로 존재하는 **다른** boardType 으로 바꿔치기한다.
    // 허용목록 방식이면 "목록에 있는 값"이라 통과해버린다 — 그게 이 테스트가 막는 것이다.
    const other = ROWS.find((r) => r.boardType !== SOME[0].boardType)
    expect(other, '서로 다른 boardType 이 확정 CSV 에 있어야 한다').toBeDefined()
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { boardType: other!.boardType } : {}))
    const d = detectDrift(SOME, live)
    expect(d.issues.some((x) => x.code === 'DRIFT_BOARD_TYPE')).toBe(true)
    expect(d.deletable).not.toContain(SOME[0].id)
  })

  it('🔴 updatedAt 만 바뀌면 막지 않고 관측으로만 남긴다', () => {
    // 실측(2026-09-14): 628건 중 3건이 그랬고 **본문·제목 drift 는 0** 이었다.
    // 원인은 viewCount·likeCount·trendingScore 비정규화 갱신이다.
    // 이걸 ABORT 축으로 두면 조회수가 오르는 것만으로 도구가 영영 못 돈다.
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { updatedAt: '2030-01-01T00:00:00.000Z' } : {}))
    const d = detectDrift(SOME, live)
    expect(d.issues).toEqual([])
    expect(d.deletable).toContain(SOME[0].id)
    expect(d.observations.some((o) => o.code === 'UPDATED_AT_CHANGED')).toBe(true)
  })

  it('🔴 본문이 실제로 바뀌면 updatedAt 과 무관하게 막는다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { contentSha256_12: 'ffffffffffff', updatedAt: r.updatedAt } : {}))
    const d = detectDrift(SOME, live)
    expect(d.issues.some((x) => x.code === 'DRIFT_CONTENT')).toBe(true)
    expect(d.deletable).not.toContain(SOME[0].id)
  })

  it('응답 누락·초과·중복을 잡는다', () => {
    expect(detectDrift(SOME, SOME.slice(1).map((r) => liveOf(r))).issues.map((i) => i.code)).toContain('MISSING')
    const extra = [...SOME.map((r) => liveOf(r)), liveOf({ ...SOME[0], id: 'stranger' })]
    expect(detectDrift(SOME, extra).issues.some((i) => i.code === 'LIVE_EXTRA')).toBe(true)
    const dup = [...SOME.map((r) => liveOf(r)), liveOf(SOME[0])]
    expect(detectDrift(SOME, dup).issues.some((i) => i.code === 'LIVE_DUPLICATE')).toBe(true)
  })
})

describe('보호 신호 다섯 축은 ABORT 가 아니라 자동 제외다', () => {
  for (const axis of PROTECTION_AXES) {
    it(`${axis} 가 켜지면 그 글만 빠진다`, () => {
      const live = SOME.map((r, i) => liveOf(r, i === 1 ? { [axis]: true } : {}))
      const d = detectDrift(SOME, live)
      expect(d.issues).toEqual([])
      expect(d.protectedExclusions).toEqual([SOME[1].id])
      expect(d.deletable).toHaveLength(SOME.length - 1)
    })
  }
  it('protectionReasons 가 켜진 축을 그대로 알려준다', () => {
    const l = liveOf(SOME[0], { hasRealLike: true, hasRealScrap: true })
    expect(protectionReasons(l)).toEqual(['hasRealLike', 'hasRealScrap'])
  })
})

// ── semantic 참조 ─────────────────────────────────────────────
describe('semantic 평문 참조 정책', () => {
  const base: SemanticCount[] = SEMANTIC_REFS.map((r) => ({ model: r.model, field: r.field, count: 0 }))

  it('전부 0이면 막지 않는다', () => expect(blockingSemanticIssues(base)).toEqual([]))

  it('🔴 살아 있는 VoteEvent 참조는 mutation 전에 ABORT', () => {
    const c = base.map((x) => (x.model === 'VoteEvent' ? { ...x, count: 1 } : x))
    const issues = blockingSemanticIssues(c)
    expect(issues.some((i) => i.code === 'ACTIVE_SEMANTIC_REF')).toBe(true)
  })
  it('🔴 살아 있는 Event 참조도 ABORT', () => {
    const c = base.map((x) => (x.model === 'Event' ? { ...x, count: 3 } : x))
    expect(blockingSemanticIssues(c).some((i) => i.code === 'ACTIVE_SEMANTIC_REF')).toBe(true)
  })
  it('CLEANUP 대상은 건수가 있어도 막지 않는다', () => {
    const c = base.map((x) => (x.model === 'NaverBlogQueue' ? { ...x, count: 15 } : x))
    expect(blockingSemanticIssues(c)).toEqual([])
  })
  it('감사 로그는 PRESERVE — 막지도, 사후에 잔재로 보지도 않는다', () => {
    const c = base.map((x) => (x.model === 'AdminAuditLog' ? { ...x, count: 7 } : x))
    expect(blockingSemanticIssues(c)).toEqual([])
    expect(residualSemanticIssues(c)).toEqual([])
  })
  it('CLEANUP 대상이 사후에 남아 있으면 잔재로 잡는다', () => {
    const c = base.map((x) => (x.model === 'SocialPost' && x.field === 'sourcePostId' ? { ...x, count: 2 } : x))
    expect(residualSemanticIssues(c).some((i) => i.code === 'RESIDUAL_SEMANTIC_REF')).toBe(true)
  })
  it('모르는 참조가 들어오면 잡는다', () => {
    expect(blockingSemanticIssues([{ model: 'Mystery', field: 'postId', count: 0 }])
      .some((i) => i.code === 'UNKNOWN_SEMANTIC_REF')).toBe(true)
  })
  it('URL 안에 대상 ID 가 박힌 행을 경로 매칭으로 찾는다', () => {
    const rows = [
      { id: 's1', linkUrl: 'https://age-doesnt-matter.com/community/abc123' },
      { id: 's2', linkUrl: 'https://age-doesnt-matter.com/community/other' },
      { id: 's3', linkUrl: null },
    ]
    expect(findDeadLinkRows(rows, new Set(['abc123']))).toEqual(['s1'])
  })
})

// ── 재실행 ────────────────────────────────────────────────────
describe('재실행 판정', () => {
  it('전건 남음 → NOT_STARTED', () => expect(classifyRunState(628, 628)).toBe('NOT_STARTED'))
  it('전건 사라짐 → COMPLETE', () => expect(classifyRunState(628, 0)).toBe('COMPLETE'))
  it('섞임 → PARTIAL', () => expect(classifyRunState(628, 12)).toBe('PARTIAL'))
})

// ── 로그 위생 ─────────────────────────────────────────────────
describe('로그에 원본이 남지 않는다', () => {
  it('tag·keyTag 는 원본을 담지 않는다', () => {
    expect(tag(ROWS[0].id)).toBe(`post#${fingerprint(ROWS[0].id)}`)
    expect(tag(ROWS[0].id)).not.toContain(ROWS[0].id)
    expect(keyTag('magazine/secret.jpg')).not.toContain('secret')
  })
  it('모든 이슈 detail 에 원본 ID 가 없다', () => {
    const live = SOME.map((r, i) => liveOf(r, i === 0 ? { status: 'HIDDEN' } : {}))
    const details = [...buildPlan([...ROWS.slice(0, EXPECTED_TOTAL - 1), ROWS[0]], [ROWS[0].id]).issues,
                     ...detectDrift(SOME, live).issues].map((i) => i.detail).join(' ')
    for (const r of ROWS) expect(details).not.toContain(r.id)
    expect(details.length).toBeGreaterThan(0)
  })
})

// ── R2 ────────────────────────────────────────────────────────
const HOST_A = `https://${R2_PUBLIC_HOSTS[0]}`
const HOST_B = `https://${R2_PUBLIC_HOSTS[1]}`

describe('R2 키 정규화·공유 판정', () => {
  it('두 공개 호스트가 같은 키로 정규화된다', () => {
    expect(toObjectKey(`${HOST_A}/magazine/a.jpg`)).toBe('magazine/a.jpg')
    expect(toObjectKey(`${HOST_B}/magazine/a.jpg`)).toBe('magazine/a.jpg')
  })
  it('우리 버킷이 아니면 null', () => {
    expect(toObjectKey('https://images.unsplash.com/p.jpg')).toBeNull()
  })
  it('썸네일·본문 이미지를 뽑고 비이미지 링크는 뺀다', () => {
    const urls = extractImageUrls(`${HOST_A}/t.webp`, `![x](${HOST_A}/b.png) https://x.com/page`)
    expect(urls).toContain(`${HOST_A}/t.webp`)
    expect(urls).toContain(`${HOST_A}/b.png`)
    expect(urls).not.toContain('https://x.com/page')
  })
  it('보존 글이 다른 호스트로 같은 객체를 쓰면 shared', () => {
    const p = planR2Deletion(
      [{ id: 'd', thumbnailUrl: `${HOST_A}/same.jpg`, content: '' }],
      [{ id: 'k', thumbnailUrl: `${HOST_B}/same.jpg`, content: '' }],
    )
    expect(p.shared).toEqual(['same.jpg'])
    expect(p.exclusive).toEqual([])
  })

  it('🔴 SocialPost 가 쓰는 객체는 글이 아니어도 shared 다', () => {
    const p = planR2Deletion(
      [{ id: 'd', thumbnailUrl: `${HOST_A}/card.jpg`, content: '' }],
      [],
      [{ model: 'SocialPost', urls: [`${HOST_A}/card.jpg`] }],
    )
    expect(p.shared).toEqual(['card.jpg'])
    expect(p.exclusive).toEqual([])
  })
  it('🔴 NaverBlogQueue·Banner·ChannelDraft 도 같은 보호를 받는다', () => {
    for (const model of ['NaverBlogQueue', 'Banner', 'ChannelDraft']) {
      const p = planR2Deletion(
        [{ id: 'd', thumbnailUrl: `${HOST_A}/x.jpg`, content: '' }],
        [], [{ model, urls: [`${HOST_B}/x.jpg`] }],
      )
      expect(p.shared, model).toEqual(['x.jpg'])
    }
  })
  it('아무도 안 쓰는 객체만 exclusive', () => {
    const p = planR2Deletion(
      [{ id: 'd', thumbnailUrl: `${HOST_A}/only.jpg`, content: '' }],
      [{ id: 'k', thumbnailUrl: `${HOST_A}/other.jpg`, content: '' }],
      [{ model: 'SocialPost', urls: [`${HOST_A}/third.jpg`] }],
    )
    expect(p.exclusive).toEqual(['only.jpg'])
  })
})

describe('R2 HTTP 판정', () => {
  it('200 존재 · 404 부재', () => {
    expect(classifyHead(200)).toBe('PRESENT')
    expect(classifyHead(404)).toBe('ABSENT')
  })
  it('403·429·5xx·네트워크 실패(0) 는 UNCERTAIN', () => {
    for (const s of [403, 429, 500, 502, 503, 0]) expect(classifyHead(s)).toBe('UNCERTAIN')
  })
  it('DELETE 는 204·200 만 성공', () => {
    expect(classifyDelete(204)).toBe('DELETED')
    for (const s of [403, 429, 500, 0]) expect(classifyDelete(s)).toBe('UNCERTAIN')
  })
})

const R2CFG: R2Config = { accountId: 'acct', accessKey: 'ak', secretKey: 'sk', bucket: 'bkt' }

function r2Stub(seq: number[]) {
  const calls: string[] = []
  let i = 0
  const impl: FetchLike = async (url, init) => {
    calls.push(`${init.method} ${url.split('/bkt/')[1]}`)
    return { status: seq[i++] ?? 500 }
  }
  return { impl, calls }
}

describe('R2 HEAD→DELETE→HEAD', () => {
  it('있던 객체를 지우고 사라진 것을 확인해야 DELETED', async () => {
    const s = r2Stub([200, 204, 404])
    expect(await deleteObject(s.impl, R2CFG, 'magazine/a.jpg')).toBe('DELETED')
    expect(s.calls.map((c) => c.split(' ')[0])).toEqual(['HEAD', 'DELETE', 'HEAD'])
  })
  it('🔴 DELETE 가 204 여도 아직 있으면 DELETED 라고 하지 않는다', async () => {
    const s = r2Stub([200, 204, 200])
    expect(await deleteObject(s.impl, R2CFG, 'magazine/a.jpg')).toBe('SKIPPED_UNCERTAIN')
  })
  it('처음부터 없으면 ALREADY_GONE — DELETE 를 부르지 않는다', async () => {
    const s = r2Stub([404])
    expect(await deleteObject(s.impl, R2CFG, 'k.jpg')).toBe('ALREADY_GONE')
    expect(s.calls).toHaveLength(1)
  })
  for (const code of [403, 429, 500]) {
    it(`${code} 면 그 객체만 SKIPPED_UNCERTAIN`, async () => {
      const s = r2Stub([code])
      expect(await deleteObject(s.impl, R2CFG, 'k.jpg')).toBe('SKIPPED_UNCERTAIN')
    })
  }
  it('서명 헤더에 시크릿 원문이 들어가지 않는다', () => {
    const h = signHeaders(R2CFG, 'HEAD', 'magazine/a.jpg', new Date('2026-09-14T00:00:00Z'))
    expect(JSON.stringify(h)).not.toContain(R2CFG.secretKey)
    expect(h.Authorization).toContain('AWS4-HMAC-SHA256')
    expect(objectUrl(R2CFG, 'magazine/a.jpg')).toContain('/bkt/magazine/a.jpg')
  })
})

describe('R2 정리는 DB 와 독립이고 재개 가능하다', () => {
  it('공유 키는 요청조차 하지 않는다', async () => {
    const s = r2Stub([])
    const r = await runR2Cleanup(s.impl, R2CFG, ['shared.jpg'], new Set(['shared.jpg']))
    expect(s.calls).toEqual([])
    expect(r.sharedSkipped).toBe(1)
  })
  it('일부 실패해도 나머지를 계속 지우고 잔존 수를 보고한다', async () => {
    // a: 있음→삭제→없음(성공), b: 403(불확실), c: 처음부터 없음
    const s = r2Stub([200, 204, 404, 403, 404])
    const r = await runR2Cleanup(s.impl, R2CFG, ['a.jpg', 'b.jpg', 'c.jpg'], new Set())
    expect(r).toMatchObject({ deleted: 1, uncertain: 1, alreadyGone: 1, remaining: 1 })
  })
  it('이미 다 지워진 상태로 재개하면 전건 ALREADY_GONE — 안전하다', async () => {
    const s = r2Stub([404, 404, 404])
    const r = await runR2Cleanup(s.impl, R2CFG, ['a.jpg', 'b.jpg', 'c.jpg'], new Set())
    expect(r).toMatchObject({ deleted: 0, alreadyGone: 3, uncertain: 0 })
  })
})

// ── COO 실행 경로 ─────────────────────────────────────────────
describe('COO 경로 밖에서는 실행할 수 없다', () => {
  it('runner 에 coo:public-content-purge 가 등록돼 있다', () => {
    const runner = readFileSync(resolve(ROOT, 'agents/cron/runner.ts'), 'utf8')
    expect(runner).toContain("'coo:public-content-purge'")
    expect(runner).toContain("import('../coo/public-content-purge.js')")
  })
  it('핸들러 모듈이 agents/coo 아래에 있다 — DB write 는 COO 만', () => {
    expect(existsSync(resolve(ROOT, 'agents/coo/public-content-purge.ts'))).toBe(true)
  })
  it('🔴 환경변수 문자열 위장 게이트가 남아 있지 않다', () => {
    // 이전 판은 `process.env.PURGE_AGENT_ID` 가 'coo:' 로 시작하는지만 봤다.
    // 아무나 값을 넣으면 통과하는 위장이었다. 주석의 설명은 남기되 **코드 사용은 0** 이어야 한다.
    const src = readFileSync(resolve(ROOT, 'agents/coo/public-content-purge.ts'), 'utf8')
    expect(src).not.toContain('process.env.PURGE_AGENT')
    expect(src).not.toContain('assertCooWriteAuthority')
  })
  it('스케줄(workflow)에 연결돼 있지 않다', () => {
    const dir = resolve(ROOT, '.github/workflows')
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith('.yml'))
      .filter((f) => readFileSync(resolve(dir, f), 'utf8').includes('public-content-purge'))
    expect(hits).toEqual([])
  })
  it('--execute 만으로는 권한이 열리지 않는다', () => {
    expect(isExecutionAuthorized(parseArgs(['--execute']))).toBe(false)
    expect(isExecutionAuthorized(parseArgs(['--execute', '--confirm=WRONG']))).toBe(false)
  })
  it('확인 토큰만으로도 열리지 않는다', () => {
    expect(isExecutionAuthorized(parseArgs(['--confirm=PURGE-PUBLIC-CONTENT-628']))).toBe(false)
  })
  it('둘 다 있어야 열린다', () => {
    expect(isExecutionAuthorized(parseArgs(['--execute', '--confirm=PURGE-PUBLIC-CONTENT-628']))).toBe(true)
  })
  it('보존 경계를 역사 CSV 두 장에서 재구성한다', () => {
    const keep = preserveIdsFrom(
      readFileSync(resolve(ROOT, 'docs/operations/data/2026-09-11-public-content-disposition.csv'), 'utf8'),
      readFileSync(resolve(ROOT, 'docs/operations/data/2026-09-11-review-tier2.csv'), 'utf8'),
    )
    expect(keep).toHaveLength(EXPECTED_PRESERVE_TOTAL)
  })
})

// ── 트랜잭션 (TOCTOU) ─────────────────────────────────────────
type PostRow = Awaited<ReturnType<PurgeTx['post']['findMany']>>[number]
type CommentRow = Awaited<ReturnType<PurgeTx['comment']['findMany']>>[number]

const BOT = { providerId: 'persona-A', role: 'USER' }
const MEMBER = { providerId: '3812345678', role: 'USER' }

function postOf(r: PurgeRow, over: Partial<PostRow> = {}): PostRow {
  return {
    id: r.id, boardType: r.boardType, status: 'PUBLISHED', source: r.source,
    authorId: r.authorIdSha256_12 ? 'author-x' : null,
    title: '', content: '', updatedAt: new Date(r.updatedAt), author: BOT, ...over,
  } as PostRow
}

/** 실제 CSV 행의 해시와 맞도록 sha12 를 대역한다(본문 원문이 없으므로). */
function fakeDb(opts: {
  posts: PostRow[]
  comments?: CommentRow[]
  likes?: { postId: string | null; user: typeof BOT | null }[]
  scraps?: { postId: string; user: typeof BOT | null }[]
  counts?: Record<string, number>
  voteRefs?: number
  eventRefs?: number
}) {
  const counts = opts.counts ?? {}
  const calls: string[] = []
  let committed = false
  const del = (name: string) => async () => { calls.push(name); return { count: counts[name] ?? 0 } }
  const tx: PurgeTx = {
    post: {
      findMany: async () => opts.posts,
      deleteMany: async (a) => {
        calls.push('Post')
        const w = a.where as { id: { in: string[] } }
        return { count: counts.Post ?? w.id.in.length }
      },
    },
    comment: { findMany: async () => opts.comments ?? [] },
    like: { findMany: async () => opts.likes ?? [], count: async () => counts['Like(comment)'] ?? 0 },
    guestLike: { count: async () => 0 },
    scrap: { findMany: async () => opts.scraps ?? [] },
    postView: { count: async () => counts.PostView ?? 0 },
    jobDetail: { count: async () => counts.JobDetail ?? 0 },
    cpsLink: { count: async () => counts.CpsLink ?? 0 },
    report: { deleteMany: async (a) => { const k = JSON.stringify(a.where).includes('commentId') ? 'Report(comment)' : 'Report(post)'; calls.push(k); return { count: counts[k] ?? 0 } } },
    homeCurationOverride: { deleteMany: del('HomeCurationOverride') },
    notification: { deleteMany: del('Notification') },
    commentWaveQueue: { deleteMany: del('CommentWaveQueue') },
    userPostWaveQueue: { deleteMany: del('UserPostWaveQueue') },
    user: { updateMany: async () => { calls.push('User'); return { count: counts.User ?? 0 } } },
    naverBlogQueue: { deleteMany: del('NaverBlogQueue') },
    socialPost: { updateMany: async () => { calls.push('SocialPost'); return { count: counts.SocialPost ?? 0 } } },
    channelDraft: { updateMany: async () => { calls.push('ChannelDraft'); return { count: counts.ChannelDraft ?? 0 } } },
    voteEvent: { count: async () => opts.voteRefs ?? 0 },
    event: { count: async () => opts.eventRefs ?? 0 },
  }
  const db: TransactionRunner = { $transaction: async (fn) => { const r = await fn(tx); committed = true; return r } }
  return { db, calls, wasCommitted: () => committed }
}

/** CSV 행의 해시와 일치하도록 title/content 를 대역하는 sha12. */
const rowAwareSha12 = (row: PurgeRow) => (v: string) =>
  v === '' ? row.titleSha256_12 : v === 'author-x' ? row.authorIdSha256_12 : sha12(v)

describe('🔴 TOCTOU — 보호 판정을 트랜잭션 안에서 다시 한다', () => {
  const R = ROWS[0]
  const sha = (v: string) => (v === '' ? R.titleSha256_12 : v === 'author-x' ? R.authorIdSha256_12 : sha12(v))
  // content 해시도 같은 대역이 필요하므로 title 과 content 를 같은 빈 문자열로 둔다.
  const shaBoth = (v: string) =>
    v === 'author-x' ? R.authorIdSha256_12 : v === '' ? R.titleSha256_12 : sha12(v)

  it('preflight 이후 실회원 댓글이 달리면 트랜잭션 안에서 제외된다', async () => {
    const row = { ...R, contentSha256_12: R.titleSha256_12 }
    const f = fakeDb({
      posts: [postOf(row)],
      comments: [{ id: 'c1', postId: row.id, authorId: 'u1', guestNickname: null, author: MEMBER }],
      counts: { Post: 0 },
    })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [row], expectedMax: 1 }))
      .rejects.toThrow(/전건이 보호 대상/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('preflight 이후 실회원 Like 가 달려도 제외된다', async () => {
    const row = { ...R, contentSha256_12: R.titleSha256_12 }
    const f = fakeDb({ posts: [postOf(row)], likes: [{ postId: row.id, user: MEMBER }] })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [row], expectedMax: 1 }))
      .rejects.toThrow(/전건이 보호 대상/)
  })

  it('preflight 이후 실회원 Scrap 이 달려도 제외된다', async () => {
    const row = { ...R, contentSha256_12: R.titleSha256_12 }
    const f = fakeDb({ posts: [postOf(row)], scraps: [{ postId: row.id, user: MEMBER }] })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [row], expectedMax: 1 }))
      .rejects.toThrow(/전건이 보호 대상/)
  })

  it('preflight 이후 게스트 댓글이 달려도 제외된다', async () => {
    const row = { ...R, contentSha256_12: R.titleSha256_12 }
    const f = fakeDb({
      posts: [postOf(row)],
      comments: [{ id: 'c1', postId: row.id, authorId: null, guestNickname: '지나가던', author: null }],
    })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [row], expectedMax: 1 }))
      .rejects.toThrow(/전건이 보호 대상/)
  })

  it('🔴 새 GuestLike 는 보호 사유가 아니다 — 주체를 알 수 없다', async () => {
    const row = { ...R, contentSha256_12: R.titleSha256_12 }
    const f = fakeDb({ posts: [postOf(row)], counts: { Post: 1 } })
    const r = await executePurge(f.db, { sha12: shaBoth, candidates: [row], expectedMax: 1 })
    expect(r.deleted).toBe(1)
  })

  it('탈퇴 실회원이 쓴 글은 트랜잭션 안에서 보호된다', async () => {
    const row = { ...R, contentSha256_12: R.titleSha256_12 }
    const f = fakeDb({ posts: [postOf(row, { author: { providerId: 'withdrawn_3812345678', role: 'USER' } })] })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [row], expectedMax: 1 }))
      .rejects.toThrow(/전건이 보호 대상/)
  })

  it('일부만 보호되면 나머지는 정상 삭제되고 보호 목록이 보고된다', async () => {
    const [a, b] = [ROWS[0], ROWS[1]].map((r) => ({ ...r, contentSha256_12: r.titleSha256_12 }))
    const shaAB = (v: string) =>
      v === 'author-x' ? a.authorIdSha256_12 : v === '' ? a.titleSha256_12 : sha12(v)
    // 두 행의 해시가 같아야 대역이 성립하므로 b 를 a 기준으로 맞춘다.
    const bAligned = { ...b, titleSha256_12: a.titleSha256_12, contentSha256_12: a.titleSha256_12, authorIdSha256_12: a.authorIdSha256_12, updatedAt: a.updatedAt }
    const f = fakeDb({
      posts: [postOf(a), postOf({ ...bAligned })],
      comments: [{ id: 'c1', postId: b.id, authorId: 'u1', guestNickname: null, author: MEMBER }],
      counts: { Post: 1 },
    })
    const r = await executePurge(f.db, { sha12: shaAB, candidates: [a, bAligned], expectedMax: 2 })
    expect(r.protectedInTx).toEqual([b.id])
    expect(r.deleted).toBe(1)
  })

  it('트랜잭션 안에서 대상이 늘어나면 ABORT', async () => {
    const [a, b] = [ROWS[0], ROWS[1]].map((r) => ({ ...r, contentSha256_12: r.titleSha256_12 }))
    const bAligned = { ...b, titleSha256_12: a.titleSha256_12, contentSha256_12: a.titleSha256_12, authorIdSha256_12: a.authorIdSha256_12, updatedAt: a.updatedAt }
    const shaAB = (v: string) => (v === 'author-x' ? a.authorIdSha256_12 : v === '' ? a.titleSha256_12 : sha12(v))
    const f = fakeDb({ posts: [postOf(a), postOf(bAligned)] })
    await expect(executePurge(f.db, { sha12: shaAB, candidates: [a, bAligned], expectedMax: 1 }))
      .rejects.toThrow(/늘어날 수 없다/)
    expect(f.wasCommitted()).toBe(false)
  })

  void sha
  void rowAwareSha12
})

describe('트랜잭션 안 drift·순서·집계', () => {
  const R = { ...ROWS[0], contentSha256_12: ROWS[0].titleSha256_12 }
  const shaBoth = (v: string) => (v === 'author-x' ? R.authorIdSha256_12 : v === '' ? R.titleSha256_12 : sha12(v))

  it('트랜잭션 안에서 content drift 를 보면 즉시 되돌린다', async () => {
    const f = fakeDb({ posts: [postOf(R, { content: '누가 본문을 고쳤다' })] })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 }))
      .rejects.toThrow(/DRIFT_CONTENT/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('트랜잭션 안에서도 updatedAt 만 바뀐 건 막지 않는다', async () => {
    const f = fakeDb({ posts: [postOf(R, { updatedAt: new Date('2030-01-01T00:00:00.000Z') })], counts: { Post: 1 } })
    const r = await executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 })
    expect(r.deleted).toBe(1)
  })

  it('🔴 살아 있는 VoteEvent 참조가 있으면 트랜잭션 안에서 ABORT', async () => {
    const f = fakeDb({ posts: [postOf(R)], voteRefs: 1, counts: { Post: 1 } })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 }))
      .rejects.toThrow(/VoteEvent/)
    expect(f.wasCommitted()).toBe(false)
  })

  it('🔴 살아 있는 Event 참조도 ABORT', async () => {
    const f = fakeDb({ posts: [postOf(R)], eventRefs: 2, counts: { Post: 1 } })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 }))
      .rejects.toThrow(/Event/)
  })

  it('Restrict 해제가 Post 삭제보다 먼저다', async () => {
    const f = fakeDb({
      posts: [postOf(R)],
      comments: [{ id: 'c1', postId: R.id, authorId: 'bot', guestNickname: null, author: BOT }],
      counts: { Post: 1 },
    })
    await executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 })
    expect(f.calls.indexOf('Report(comment)')).toBeLessThan(f.calls.indexOf('Post'))
    expect(f.calls.indexOf('HomeCurationOverride')).toBeLessThan(f.calls.indexOf('Post'))
  })

  it('감사 로그는 어느 단계에서도 건드리지 않는다', async () => {
    const f = fakeDb({ posts: [postOf(R)], counts: { Post: 1 } })
    await executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 })
    expect(f.calls.join(' ')).not.toContain('AdminAuditLog')
  })

  it('CASCADE 계수를 트랜잭션 안에서 확정한다', async () => {
    const f = fakeDb({
      posts: [postOf(R)],
      comments: [{ id: 'c1', postId: R.id, authorId: 'bot', guestNickname: null, author: BOT }],
      likes: [{ postId: R.id, user: BOT }],
      counts: { Post: 1, PostView: 3, JobDetail: 1 },
    })
    const r = await executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 })
    expect(r.cascade).toMatchObject({ Comment: 1, 'Like(post)': 1, PostView: 3, JobDetail: 1 })
  })

  it('Post 영향 행이 확정 대상과 다르면 커밋하지 않는다', async () => {
    const f = fakeDb({ posts: [postOf(R)], counts: { Post: 0 } })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [R], expectedMax: 1 }))
      .rejects.toThrow(PurgeAbortError)
    expect(f.wasCommitted()).toBe(false)
  })

  it('대상이 0건이면 실행하지 않는다', async () => {
    const f = fakeDb({ posts: [] })
    await expect(executePurge(f.db, { sha12: shaBoth, candidates: [], expectedMax: 0 })).rejects.toThrow(/0건/)
  })
})

// ── 사후 검증 ─────────────────────────────────────────────────
describe('사후 검증을 통과해야만 done 이다', () => {
  const ok = {
    targetsRemaining: 0, preserveBefore: 218, preserveAfter: 218,
    protectedExpected: 0, protectedRemaining: 0,
    semanticResidual: [] as SemanticCount[],
    tableDeltas: [{ table: 'Comment', expected: 775, actual: 775 }],
  }
  it('전부 맞으면 이슈 0', () => expect(verifyAfterPurge(ok)).toEqual([]))
  it('대상이 남아 있으면 TARGET_REMAINS', () => {
    expect(verifyAfterPurge({ ...ok, targetsRemaining: 3 }).some((i) => i.code === 'TARGET_REMAINS')).toBe(true)
  })
  it('🔴 보존 대상이 줄면 PRESERVE_CHANGED', () => {
    expect(verifyAfterPurge({ ...ok, preserveAfter: 217 }).some((i) => i.code === 'PRESERVE_CHANGED')).toBe(true)
  })
  it('보호 제외한 글이 사라졌으면 PROTECTED_LOST', () => {
    expect(verifyAfterPurge({ ...ok, protectedExpected: 2, protectedRemaining: 1 })
      .some((i) => i.code === 'PROTECTED_LOST')).toBe(true)
  })
  it('평문 참조 잔재가 남으면 잡는다', () => {
    const residual: SemanticCount[] = [{ model: 'NaverBlogQueue', field: 'magazinePostId', count: 2 }]
    expect(verifyAfterPurge({ ...ok, semanticResidual: residual })
      .some((i) => i.code === 'RESIDUAL_SEMANTIC_REF')).toBe(true)
  })
  it('테이블 실제 감소량이 다르면 TABLE_DELTA', () => {
    expect(verifyAfterPurge({ ...ok, tableDeltas: [{ table: 'Comment', expected: 775, actual: 700 }] })
      .some((i) => i.code === 'TABLE_DELTA')).toBe(true)
  })
})
