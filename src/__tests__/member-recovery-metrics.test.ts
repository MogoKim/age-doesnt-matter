import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * R8 회원 소생 측정 — 판정 규칙 회귀 테스트.
 *
 * 여기서 지키는 것은 "숫자가 나온다"가 아니라 **틀린 숫자가 안 나온다**이다.
 * 특히 아래 넷은 실제로 오판을 만든 적이 있는 축이라 실패를 주입해 확인한다.
 *  1. 봇·어드민이 실회원에 섞이는 것
 *  2. 내부(창업자) 세션이 퍼널 분모를 부풀리는 것
 *  3. 아직 행동할 시간이 없던 대상(미성숙)을 '안 했다'로 세는 것
 *  4. 분모 0 을 0% 로 그리는 것
 */

const HOUR = 3600000
const DAY = 86400000
const NOW = Date.parse('2026-09-10T00:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms)

interface UserRow { id: string; providerId: string; role: string; createdAt: Date }
interface EventRow {
  eventName: string
  sessionId: string | null
  isBot: boolean
  createdAt: Date
  /** 로그인 회원이 낸 이벤트면 값이 있다. 비회원 방문 분모를 가르는 축이다. */
  userId?: string | null
  path?: string | null
  botType?: string | null
  properties?: Record<string, unknown> | null
}
interface PostRow { authorId: string; createdAt: Date }
interface CommentRow { id: string; authorId: string | null; parentId: string | null; status: string; createdAt: Date }

const db = {
  users: [] as UserRow[],
  events: [] as EventRow[],
  posts: [] as PostRow[],
  comments: [] as CommentRow[],
}

/** 이 fake 가 이해하는 where 모양 — 모듈이 실제로 보내는 것만 적는다. */
interface EventWhere {
  isBot?: boolean
  createdAt?: { gte?: Date }
  sessionId?: { not?: null }
  userId?: null | { in?: string[]; not?: null }
  eventName?: string | { in: string[] }
  properties?: { path?: string[]; equals?: unknown }
  OR?: { path?: { startsWith?: string }; botType?: string | null }[]
}
interface CommentWhere {
  status?: string
  authorId?: { in: string[] }
  parentId?: { in: string[] }
  createdAt?: { gte?: Date }
}

/** 실제로 쓰는 쿼리 모양만 지원하는 최소 fake — 필터가 진짜 도는지 보려고 in-memory 로 짰다. */
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: async ({ where }: { where?: { role?: string } } = {}) =>
        db.users.filter((u) => (where?.role ? u.role === where.role : true)),
    },
    eventLog: {
      groupBy: async ({ by, where }: { by: string[]; where: EventWhere }) => {
        const rows = db.events.filter((e) => {
          if (where.isBot !== undefined && e.isBot !== where.isBot) return false
          if (where.createdAt?.gte && e.createdAt < where.createdAt.gte) return false
          if (where.sessionId?.not === null && e.sessionId == null) return false
          if (where.userId === null && (e.userId ?? null) !== null) return false
          if (where.userId && typeof where.userId === 'object' && 'not' in where.userId
              && where.userId.not === null && (e.userId ?? null) === null) return false
          if (typeof where.eventName === 'string' && e.eventName !== where.eventName) return false
          if (where.properties?.path) {
            const [key] = where.properties.path
            if ((e.properties?.[key] ?? null) !== where.properties.equals) return false
          }
          return true
        })
        // 순서 검증에는 방문자별 **최초·최종 시각**이 둘 다 필요하다 — _min/_max 집계를 흉내낸다.
        const agg = new Map<string, { key: Record<string, unknown>; min: Date; max: Date }>()
        for (const r of rows) {
          const key: Record<string, unknown> = {}
          for (const f of by) key[f] = f === 'sessionId' ? r.sessionId : f === 'userId' ? (r.userId ?? null) : null
          const k = JSON.stringify(key)
          const cur = agg.get(k)
          if (!cur) agg.set(k, { key, min: r.createdAt, max: r.createdAt })
          else {
            if (r.createdAt < cur.min) cur.min = r.createdAt
            if (r.createdAt > cur.max) cur.max = r.createdAt
          }
        }
        return [...agg.values()].map((v) => ({ ...v.key, _min: { createdAt: v.min }, _max: { createdAt: v.max } }))
      },
      findMany: async ({ where }: { where: EventWhere }) => {
        const rows = db.events.filter((e) => {
          if (where.createdAt?.gte && e.createdAt < where.createdAt.gte) return false
          if (where.sessionId?.not === null && e.sessionId == null) return false
          if (where.OR) {
            const ok = where.OR.some((cond) => {
              if (cond.path?.startsWith) return (e.path ?? '').startsWith(cond.path.startsWith)
              if (cond.botType !== undefined) return e.botType === cond.botType
              return false
            })
            if (!ok) return false
          }
          return true
        })
        const seen = new Set<string | null>()
        return rows.filter((r) => (seen.has(r.sessionId) ? false : (seen.add(r.sessionId), true)))
      },
    },
    post: {
      groupBy: async ({ where }: { where: { authorId: { in: string[] } } }) => {
        const ids = new Set(where.authorId.in)
        const min = new Map<string, Date>()
        for (const p of db.posts) {
          if (!ids.has(p.authorId)) continue
          const cur = min.get(p.authorId)
          if (!cur || p.createdAt < cur) min.set(p.authorId, p.createdAt)
        }
        return [...min].map(([authorId, createdAt]) => ({ authorId, _min: { createdAt } }))
      },
    },
    comment: {
      groupBy: async ({ where }: { where: { authorId: { in: string[] } } }) => {
        const ids = new Set(where.authorId.in)
        const min = new Map<string, Date>()
        for (const c of db.comments) {
          if (!c.authorId || !ids.has(c.authorId)) continue
          const cur = min.get(c.authorId)
          if (!cur || c.createdAt < cur) min.set(c.authorId, c.createdAt)
        }
        return [...min].map(([authorId, createdAt]) => ({ authorId, _min: { createdAt } }))
      },
      findMany: async ({ where }: { where: CommentWhere }) =>
        db.comments.filter((c) => {
          if (where.status && c.status !== where.status) return false
          if (where.authorId?.in && (!c.authorId || !where.authorId.in.includes(c.authorId))) return false
          if (where.parentId?.in && (!c.parentId || !where.parentId.in.includes(c.parentId))) return false
          if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false
          return true
        }),
    },
  },
}))

const retentionMock = vi.fn()
vi.mock('@/lib/queries/admin/admin.retention', () => ({
  getRetentionQuadrants: () => retentionMock(),
}))

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}))

const emptyPoint = { denom: 0, returned: 0, rate: null }
const quad = (segment: string, d1: [number, number], d7: [number, number]) => ({
  segment,
  d1: { denom: d1[1], returned: d1[0], rate: d1[1] ? (d1[0] / d1[1]) * 100 : null },
  d3: emptyPoint,
  d7: { denom: d7[1], returned: d7[0], rate: d7[1] ? (d7[0] / d7[1]) * 100 : null },
  d14: emptyPoint,
  d30: emptyPoint,
})

async function run(windowDays = 7) {
  const { computeMemberRecovery } = await import('@/lib/queries/admin/admin.member-recovery')
  return computeMemberRecovery(windowDays)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  db.users = []
  db.events = []
  db.posts = []
  db.comments = []
  retentionMock.mockReturnValue(
    Promise.resolve({
      generatedAt: '', windowDays: 90, note: '',
      members: [quad('WEB', [2, 4], [1, 4]), quad('TWA', [1, 2], [0, 2])],
      guests: [quad('비회원-절대-섞이면-안됨', [999, 999], [999, 999])],
    }),
  )
})

/** 실회원 2명(성숙 1 + 미성숙 1) · 봇 1 · 어드민 1 */
function seedUsers() {
  db.users = [
    { id: 'u1', providerId: '1001', role: 'USER', createdAt: ago(3 * DAY) },
    { id: 'u2', providerId: '1002', role: 'USER', createdAt: ago(2 * HOUR) },
    { id: 'bot', providerId: 'curator-7', role: 'USER', createdAt: ago(3 * DAY) },
    { id: 'admin', providerId: '9999', role: 'ADMIN', createdAt: ago(3 * DAY) },
  ]
}

describe('[R8-1] 실회원 판정 — providerId 순수 숫자 AND role≠ADMIN', () => {
  it('봇(비숫자 providerId)과 어드민을 실회원에서 뺀다', async () => {
    seedUsers()
    const d = await run()
    expect(d.realMemberTotal).toBe(2) // u1, u2
    expect(d.newMembers).toBe(2)
  })

  it('어드민은 providerId 가 숫자여도 제외된다', async () => {
    db.users = [{ id: 'admin', providerId: '9999', role: 'ADMIN', createdAt: ago(DAY) }]
    const d = await run()
    expect(d.realMemberTotal).toBe(0)
  })
})

describe('[R8-2] 1단계 퍼널 — 내부 세션과 봇을 분모에서 뺀다', () => {
  beforeEach(() => {
    seedUsers()
    db.events = [
      { eventName: 'page_view', sessionId: 's1', isBot: false, createdAt: ago(DAY) },
      { eventName: 'page_view', sessionId: 's2', isBot: false, createdAt: ago(DAY) },
      { eventName: 'page_view', sessionId: 's3', isBot: false, createdAt: ago(DAY) },
      // 🔴 내부 세션 — /admin 을 봤으므로 창업자다. 분모에 들어가면 안 된다
      { eventName: 'page_view', sessionId: 'sAdmin', isBot: false, createdAt: ago(DAY), path: '/admin' },
      // 🔴 봇 — isBot=true
      { eventName: 'page_view', sessionId: 'sBot', isBot: true, createdAt: ago(DAY) },
      { eventName: 'signup_banner_shown', sessionId: 's1', isBot: false, createdAt: ago(DAY) },
      { eventName: 'signup_banner_shown', sessionId: 's2', isBot: false, createdAt: ago(DAY) },
      { eventName: 'kakao_button_click', sessionId: 's1', isBot: false, createdAt: ago(DAY) },
      { eventName: 'signup_banner_clicked', sessionId: 's2', isBot: false, createdAt: ago(DAY), properties: { cta_type: 'kakao_oauth' } },
      // 배너 클릭이지만 앱 설치 CTA — 카카오 로그인 시작이 아니다
      { eventName: 'signup_banner_clicked', sessionId: 's3', isBot: false, createdAt: ago(DAY), properties: { cta_type: 'app_install' } },
      { eventName: 'sign_up', sessionId: 's1', isBot: false, createdAt: ago(DAY) },
    ]
  })

  it('비회원 방문자는 봇·내부를 뺀 3명이다', async () => {
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'visit')?.visitors).toBe(3)
  })

  it('배너 반응은 signup_banner_clicked 만 — 사이트 전체 kakao_button_click 은 참고값이다', async () => {
    const d = await run()
    // s2(kakao_oauth) + s3(app_install) = 배너 클릭 2명. s1 의 kakao_button_click 은 배너가 아니다.
    expect(d.signupFunnel.steps.find((s) => s.key === 'banner_cta')?.visitors).toBe(2)
    expect(d.bannerCta.byType).toMatchObject({ kakao_oauth: 1, app_install: 1 })
    expect(d.siteWideKakaoClick.visitors).toBe(1)
  })

  it('전환마다 분모·분자를 함께 돌려준다', async () => {
    const d = await run()
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_banner_cta')!
    expect(c.denom).toBe(2) // s1, s2 노출
    expect(c.numer).toBe(1) // s2 만 배너 CTA 를 눌렀다(s3 은 노출 기록이 없다)
    expect(c.rate).toBe(50)
  })

  it('가입 완료 칸은 이벤트 기준이라 COLLECTED 가 아니다', async () => {
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'signup_done')?.status).not.toBe('COLLECTED')
  })
})

describe('[R8-3] 분모 0 은 0% 가 아니라 판정 불가', () => {
  it('노출 세션이 없으면 rate=null · NO_DENOM 이다', async () => {
    seedUsers()
    db.events = [{ eventName: 'page_view', sessionId: 's1', isBot: false, createdAt: ago(DAY) }]
    const d = await run()
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_banner_cta')!
    expect(c.denom).toBe(0)
    expect(c.rate).toBeNull() // 🔴 0 이면 안 된다
    expect(c.status).toBe('NO_DENOM')
  })
})

describe('[R8-4] 2단계 — 미성숙 코호트를 분모에서 빼고 따로 센다', () => {
  it('가입 24시간 미경과자는 실패가 아니라 분모 제외다', async () => {
    seedUsers()
    db.posts = [{ authorId: 'u1', createdAt: ago(3 * DAY - 5 * HOUR) }]
    const d = await run()
    expect(d.activation.cohortTotal).toBe(2)
    expect(d.activation.immature).toBe(1) // u2 (2시간 전 가입)
    expect(d.activation.matureDenom).toBe(1)
    expect(d.activation.wroteAnyWithin24h).toBe(1)
    expect(d.activation.rate).toBe(100) // 1/1 — u2 를 분모에 넣었으면 50% 로 오판했다
  })

  it('첫 작성까지 걸린 시간의 중앙값을 시간 단위로 준다', async () => {
    seedUsers()
    db.posts = [{ authorId: 'u1', createdAt: ago(3 * DAY - 5 * HOUR) }]
    const d = await run()
    expect(d.activation.medianHoursToFirst).toBe(5)
  })

  it('성숙 코호트가 없으면 rate=null 이다', async () => {
    db.users = [{ id: 'u2', providerId: '1002', role: 'USER', createdAt: ago(2 * HOUR) }]
    const d = await run()
    expect(d.activation.matureDenom).toBe(0)
    expect(d.activation.rate).toBeNull()
    expect(d.activation.status).toBe('NO_DENOM')
  })
})

describe('[R8-5] 3단계 — 다른 실회원의 답글만 루프로 센다', () => {
  beforeEach(() => {
    seedUsers()
    db.comments = [
      // c1: 다른 실회원(u2)의 답글 → 루프 성립
      { id: 'c1', authorId: 'u1', parentId: null, status: 'ACTIVE', createdAt: ago(3 * DAY) },
      { id: 'r1', authorId: 'u2', parentId: 'c1', status: 'ACTIVE', createdAt: ago(2 * DAY) },
      // c2: 본인 답글만 → 루프 아님
      { id: 'c2', authorId: 'u1', parentId: null, status: 'ACTIVE', createdAt: ago(3 * DAY) },
      { id: 'r2', authorId: 'u1', parentId: 'c2', status: 'ACTIVE', createdAt: ago(2 * DAY) },
      // c3: 봇 답글만 → 루프 아님
      { id: 'c3', authorId: 'u1', parentId: null, status: 'ACTIVE', createdAt: ago(3 * DAY) },
      { id: 'r3', authorId: 'bot', parentId: 'c3', status: 'ACTIVE', createdAt: ago(2 * DAY) },
      // c4: 방금 쓴 댓글 → 답글이 달릴 시간이 없었다(미성숙)
      { id: 'c4', authorId: 'u1', parentId: null, status: 'ACTIVE', createdAt: ago(2 * HOUR) },
    ]
  })

  it('본인 답글·봇 답글은 분자에서 빼고 따로 표시한다', async () => {
    const d = await run()
    // 분모는 최상위 댓글만이 아니다 — 실회원이 쓴 **답글도 댓글**이고 거기에도 답글이 달릴 수 있다.
    // c1,c2,c3,c4 + r1(u2),r2(u1) = 6. r3 은 봇이 썼으므로 실회원 댓글이 아니다.
    expect(d.replyLoop.memberComments).toBe(6)
    expect(d.replyLoop.immature).toBe(1) // c4 — 2시간 전이라 답글이 달릴 시간이 없었다
    expect(d.replyLoop.matureDenom).toBe(5) // c1,c2,c3,r1,r2
    expect(d.replyLoop.gotReplyFromMember).toBe(1) // c1 만 (다른 실회원 u2 의 답글)
    expect(d.replyLoop.selfReplyOnly).toBe(1) // c2 — 본인 답글뿐
    expect(d.replyLoop.nonMemberReplyOnly).toBe(1) // c3 — 봇 답글뿐
  })

  it('삭제된 답글은 루프로 세지 않는다', async () => {
    db.comments = db.comments.map((c) => (c.id === 'r1' ? { ...c, status: 'DELETED' } : c))
    const d = await run()
    expect(d.replyLoop.gotReplyFromMember).toBe(0)
  })
})

describe('[R8-6] 4단계 — 기존 리텐션 지표를 재사용하고 비회원을 섞지 않는다', () => {
  it('members 만 싣고 guests 는 화면 데이터에 들어가지 않는다', async () => {
    seedUsers()
    const d = await run()
    const segments = d.retention.quadrants.map((q) => q.segment)
    expect(segments).toEqual(['WEB', 'TWA'])
    expect(JSON.stringify(d.retention)).not.toContain('비회원-절대-섞이면-안됨')
  })

  it('채널 합산은 분모·분자를 더해서 만든다 — 비율 평균이 아니다', async () => {
    seedUsers()
    const d = await run()
    expect(d.retention.combined?.d1).toEqual({ denom: 6, returned: 3, rate: 50 })
    expect(d.retention.combined?.d7).toEqual({ denom: 6, returned: 1, rate: 16.7 })
  })

  it('출처와 관측 창을 명시한다 — 이 화면의 7·30일 창과 다르다', async () => {
    seedUsers()
    const d = await run()
    expect(d.retention.sourceWindowDays).toBe(90)
    expect(d.retention.source).toContain('getRetentionQuadrants')
  })
})

describe('[R8-7] 데이터 품질 — 미수집을 0 으로 읽지 못하게 막는다', () => {
  it('로그인 시작 유실 가능성을 항상 경고로 남긴다', async () => {
    seedUsers()
    const d = await run()
    expect(d.dataQuality.find((q) => q.key === 'login_start_rate_limit')?.level).toBe('WARN')
  })

  it('제외한 내부 방문자·어드민 수를 밝힌다', async () => {
    seedUsers()
    db.events = [{ eventName: 'page_view', sessionId: 'sAdmin', isBot: false, createdAt: ago(DAY), path: '/admin' }]
    const d = await run()
    const note = d.dataQuality.find((q) => q.key === 'internal_excluded')!
    expect(note.message).toContain('내부 세션 1개')
    expect(note.message).toContain('어드민 계정 1개')
  })
})

describe('[R8-8] 관측 창', () => {
  it('7일 창은 그보다 오래된 가입자를 코호트에서 뺀다', async () => {
    db.users = [
      { id: 'old', providerId: '1', role: 'USER', createdAt: ago(20 * DAY) },
      { id: 'new', providerId: '2', role: 'USER', createdAt: ago(3 * DAY) },
    ]
    expect((await run(7)).newMembers).toBe(1)
    expect((await run(30)).newMembers).toBe(2)
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * P1 측정 정확성 보정 (2026-09-10) — 아래는 **먼저 실패시켜 놓고** 고친 항목이다.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('[R8-P1-1] 퍼널 단위 — 비회원 방문 · eligible 단계 · 시간 순서', () => {
  it('로그인 회원의 page_view 는 방문 분모에서 뺀다', async () => {
    seedUsers()
    db.events = [
      { eventName: 'page_view', sessionId: 'v1', isBot: false, createdAt: ago(2 * DAY), userId: null },
      { eventName: 'page_view', sessionId: 'v2', isBot: false, createdAt: ago(2 * DAY), userId: null },
      // 🔴 이미 로그인한 회원 — 가입 퍼널의 분모가 아니다
      { eventName: 'page_view', sessionId: 'vMember', isBot: false, createdAt: ago(2 * DAY), userId: 'u1' },
    ]
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'visit')?.visitors).toBe(2)
  })

  it('퍼널 단계는 방문 → 노출 → 배너 CTA → 가입 이벤트다', async () => {
    seedUsers()
    const d = await run()
    // 적격(eligible)은 노출과 같은 tryFire 라 전환 단계가 아니라 일관성 지표로 뺐다.
    expect(d.signupFunnel.steps.map((s) => s.key)).toEqual(['visit', 'exposure', 'banner_cta', 'signup_done'])
    expect(d.bannerConsistency.eligibleVisitors).toBeDefined()
  })

  it('시간 순서가 뒤집힌 전환은 세지 않는다 — 단순 교집합이면 오답이 나온다', async () => {
    seedUsers()
    db.events = [
      // v1: 방문(4일 전) → 노출(2일 전). 정상 순서
      { eventName: 'page_view', sessionId: 'v1', isBot: false, createdAt: ago(4 * DAY), userId: null },
      { eventName: 'signup_banner_shown', sessionId: 'v1', isBot: false, createdAt: ago(2 * DAY) },
      // 🔴 v2: 노출(3일 전)이 방문 기록(1일 전)보다 **먼저**다 — 전환으로 세면 안 된다
      { eventName: 'signup_banner_shown', sessionId: 'v2', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'page_view', sessionId: 'v2', isBot: false, createdAt: ago(DAY), userId: null },
    ]
    const d = await run(30)
    const c = d.signupFunnel.conversions.find((x) => x.key === 'visit_to_exposure')!
    expect(c.denom).toBe(2) // 방문자 2
    expect(c.numer).toBe(1) // v1 만 — 교집합이면 2 가 나온다
  })

  it('방문자 식별자를 "세션"이라고 부르지 않는다 — _anon_sid 는 30일 쿠키다', async () => {
    seedUsers()
    const d = await run()
    const text = JSON.stringify(d.signupFunnel) + JSON.stringify(d.dataQuality)
    expect(text).toContain('방문자')
    expect(d.dataQuality.some((q) => q.key === 'visitor_id_semantics')).toBe(true)
  })
})

describe('[R8-P1-2] 가입 이벤트와 실제 가입자를 분리한다', () => {
  it('sign_up 단계는 COLLECTED 로 표시하지 않는다', async () => {
    seedUsers()
    db.events = [{ eventName: 'sign_up', sessionId: 'v1', isBot: false, createdAt: ago(DAY) }]
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'signup_done')?.status).not.toBe('COLLECTED')
  })

  it('실제 가입자 수와 이벤트 수집 완전성을 별도 지표로 준다', async () => {
    db.users = [
      { id: 'a', providerId: '1', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'b', providerId: '2', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'c', providerId: '3', role: 'USER', createdAt: ago(3 * DAY) },
    ]
    // userId 가 붙지 않은 sign_up 이벤트 1건 — 누구의 가입인지 이을 수 없다
    db.events = [{ eventName: 'sign_up', sessionId: 'v1', isBot: false, createdAt: ago(DAY) }]
    const d = await run()
    expect(d.signupEventCoverage.actualNewMembers).toBe(3)
    expect(d.signupEventCoverage.events).toBe(1) // 퍼널 단위(방문자)
    expect(d.signupEventCoverage.matchedMembers).toBe(0) // ID 로 연결된 회원 없음
    expect(d.signupEventCoverage.unlinkableEvents).toBe(1)
    expect(d.signupEventCoverage.rate).toBe(0) // 🔴 건수비(1/3=33.3)로 계산하면 안 된다
    expect(d.signupEventCoverage.status).toBe('GAP')
  })
})

describe('[R8-P1-3] 첫 참여는 D1 기준이다', () => {
  it('가입 25시간 뒤 작성은 D1 성공이 아니다', async () => {
    db.users = [{ id: 'u1', providerId: '1001', role: 'USER', createdAt: ago(5 * DAY) }]
    // 가입 5일 전 → 첫 글은 가입 후 25시간
    db.posts = [{ authorId: 'u1', createdAt: ago(5 * DAY - 25 * HOUR) }]
    const d = await run()
    expect(d.activation.matureDenom).toBe(1)
    expect(d.activation.wroteAnyWithin24h).toBe(0) // 🔴 24시간 규칙이 없으면 1
    expect(d.activation.rate).toBe(0)
    expect(d.activation.wroteAnyLater).toBe(1) // 나중에 쓴 것은 따로 센다
  })

  it('가입 3시간 뒤 작성은 D1 성공이다', async () => {
    db.users = [{ id: 'u1', providerId: '1001', role: 'USER', createdAt: ago(5 * DAY) }]
    db.posts = [{ authorId: 'u1', createdAt: ago(5 * DAY - 3 * HOUR) }]
    const d = await run()
    expect(d.activation.wroteAnyWithin24h).toBe(1)
    expect(d.activation.rate).toBe(100)
  })
})

describe('[R8-P1-4] 답글 루프도 24시간 기준이다', () => {
  it('25시간 뒤 답글은 분자가 아니라 늦은 답글로 센다', async () => {
    seedUsers()
    db.comments = [
      { id: 'c1', authorId: 'u1', parentId: null, status: 'ACTIVE', createdAt: ago(5 * DAY) },
      { id: 'r1', authorId: 'u2', parentId: 'c1', status: 'ACTIVE', createdAt: ago(5 * DAY - 25 * HOUR) },
    ]
    const d = await run(30)
    expect(d.replyLoop.gotReplyFromMember).toBe(0) // 🔴 시간 조건이 없으면 1
    expect(d.replyLoop.lateMemberReply).toBe(1)
  })

  it('본인 답글과 봇 답글이 섞이면 "본인 답글뿐"으로 세지 않는다', async () => {
    seedUsers()
    db.comments = [
      { id: 'c1', authorId: 'u1', parentId: null, status: 'ACTIVE', createdAt: ago(5 * DAY) },
      { id: 'rSelf', authorId: 'u1', parentId: 'c1', status: 'ACTIVE', createdAt: ago(5 * DAY - HOUR) },
      { id: 'rBot', authorId: 'bot', parentId: 'c1', status: 'ACTIVE', createdAt: ago(5 * DAY - 2 * HOUR) },
    ]
    const d = await run(30)
    expect(d.replyLoop.selfReplyOnly).toBe(0) // 🔴 섞였는데 '본인뿐'으로 세면 안 된다
    expect(d.replyLoop.nonMemberReplyOnly).toBe(0)
    expect(d.replyLoop.selfAndNonMemberReply).toBe(1)
  })

  it('24시간 이내 다른 실회원 답글만 루프로 센다', async () => {
    seedUsers()
    db.comments = [
      { id: 'c1', authorId: 'u1', parentId: null, status: 'ACTIVE', createdAt: ago(5 * DAY) },
      { id: 'r1', authorId: 'u2', parentId: 'c1', status: 'ACTIVE', createdAt: ago(5 * DAY - 2 * HOUR) },
    ]
    const d = await run(30)
    expect(d.replyLoop.gotReplyFromMember).toBe(1)
    // 답글 r1 자체도 실회원 댓글이라 분모에 들어간다(§ReplyLoop.memberComments 주석).
    // r1 에는 답글이 없으므로 2건 중 1건 → 50%.
    expect(d.replyLoop.matureDenom).toBe(2)
    expect(d.replyLoop.rate).toBe(50)
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * P1 2차 보정 (2026-09-10) — 아래도 **먼저 실패시켜 놓고** 고친 항목이다.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('[R8-P2-1] 가입 과정의 EventLog 소급 귀속을 반영한다', () => {
  /**
   * `onboarding.ts` 는 온보딩 완료 시
   * `eventLog.updateMany({ sessionId: anonSid, userId: null }, { userId })` 로
   * **그 방문자의 과거 익명 이벤트에 userId 를 소급 입력**한다.
   * 그래서 `userId IS NULL` 만으로 비회원 방문을 세면
   * **가입에 성공한 사람의 가입 전 방문이 분모에서 통째로 빠진다** — 전환 성공자만 분모에서 사라지는 편향이다.
   */
  it('소급 귀속된 가입 전 page_view 는 비회원 방문 분모에 포함한다', async () => {
    db.users = [
      { id: 'newbie', providerId: '2001', role: 'USER', createdAt: ago(2 * DAY) }, // 2일 전 가입
    ]
    db.events = [
      // 가입(2일 전)보다 이른 3일 전 방문인데 온보딩이 userId 를 소급 입력했다
      { eventName: 'page_view', sessionId: 'vNew', isBot: false, createdAt: ago(3 * DAY), userId: 'newbie' },
    ]
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'visit')?.visitors).toBe(1)
  })

  it('기존 회원의 가입 후 방문은 분모에서 제외한다', async () => {
    db.users = [
      { id: 'old', providerId: '1001', role: 'USER', createdAt: ago(60 * DAY) }, // 오래된 회원
    ]
    db.events = [
      { eventName: 'page_view', sessionId: 'vOld', isBot: false, createdAt: ago(DAY), userId: 'old' },
    ]
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'visit')?.visitors).toBe(0)
  })

  it('세 경우를 한 번에 — 익명 · 소급 귀속(가입 전) 포함, 기존 회원 제외', async () => {
    db.users = [
      { id: 'newbie', providerId: '2001', role: 'USER', createdAt: ago(2 * DAY) },
      { id: 'old', providerId: '1001', role: 'USER', createdAt: ago(60 * DAY) },
    ]
    db.events = [
      { eventName: 'page_view', sessionId: 'vAnon', isBot: false, createdAt: ago(DAY), userId: null },
      { eventName: 'page_view', sessionId: 'vNew', isBot: false, createdAt: ago(3 * DAY), userId: 'newbie' },
      { eventName: 'page_view', sessionId: 'vOld', isBot: false, createdAt: ago(DAY), userId: 'old' },
    ]
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'visit')?.visitors).toBe(2)
  })
})

describe('[R8-P2-2] 전환은 최초 시각끼리만 비교하지 않는다', () => {
  it('앞 단계 이후에 대상 이벤트가 다시 발생했으면 전환이다', async () => {
    seedUsers()
    db.events = [
      // 배너 클릭이 방문보다 먼저 한 번 있었지만(이전 세션 잔재), 노출 이후에 **다시** 있었다 → 전환
      { eventName: 'signup_banner_clicked', sessionId: 'v1', isBot: false, createdAt: ago(6 * DAY), properties: { cta_type: 'kakao_oauth' } },
      { eventName: 'signup_banner_shown', sessionId: 'v1', isBot: false, createdAt: ago(5 * DAY) },
      { eventName: 'signup_banner_clicked', sessionId: 'v1', isBot: false, createdAt: ago(3 * DAY), properties: { cta_type: 'kakao_oauth' } },
    ]
    const d = await run(30)
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_banner_cta')!
    expect(c.denom).toBe(1)
    expect(c.numer).toBe(1) // 🔴 _min 끼리만 비교하면 0 이 나온다
  })

  it('대상 이벤트가 앞 단계 이전에만 있으면 전환이 아니다', async () => {
    seedUsers()
    db.events = [
      { eventName: 'signup_banner_clicked', sessionId: 'v2', isBot: false, createdAt: ago(6 * DAY), properties: { cta_type: 'kakao_oauth' } },
      { eventName: 'signup_banner_shown', sessionId: 'v2', isBot: false, createdAt: ago(5 * DAY) },
    ]
    const d = await run(30)
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_banner_cta')!
    expect(c.denom).toBe(1)
    expect(c.numer).toBe(0) // 클릭이 노출 이전에만 있었다
  })
})

describe('[R8-P2-3] 가입 수집 완전성은 건수가 아니라 회원 ID 대조다', () => {
  it('서로 다른 대상의 3건/3명을 100% 로 판정하지 않는다', async () => {
    db.users = [
      { id: 'm1', providerId: '1', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'm2', providerId: '2', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'm3', providerId: '3', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'other', providerId: '9', role: 'USER', createdAt: ago(60 * DAY) }, // 코호트 아님
    ]
    db.events = [
      { eventName: 'sign_up', sessionId: 'sA', isBot: false, createdAt: ago(2 * DAY), userId: 'm1' },
      { eventName: 'sign_up', sessionId: 'sB', isBot: false, createdAt: ago(2 * DAY), userId: null },
      { eventName: 'sign_up', sessionId: 'sC', isBot: false, createdAt: ago(2 * DAY), userId: 'other' },
    ]
    const cov = (await run()).signupEventCoverage
    expect(cov.actualNewMembers).toBe(3)
    expect(cov.matchedMembers).toBe(1) // m1 만 ID 로 연결됨
    expect(cov.missingMembers).toBe(2) // m2, m3
    expect(cov.unlinkableEvents).toBe(2) // userId 없음 1 + 코호트 밖 1
    expect(cov.rate).toBe(33.3) // 🔴 건수 비교(3/3)면 100 이 나온다
    expect(cov.status).toBe('PARTIAL')
  })

  it('코호트 전원이 ID 로 연결되면 100% 다', async () => {
    db.users = [{ id: 'm1', providerId: '1', role: 'USER', createdAt: ago(3 * DAY) }]
    db.events = [{ eventName: 'sign_up', sessionId: 'sA', isBot: false, createdAt: ago(2 * DAY), userId: 'm1' }]
    const cov = (await run()).signupEventCoverage
    expect(cov.matchedMembers).toBe(1)
    expect(cov.missingMembers).toBe(0)
    expect(cov.rate).toBe(100)
    expect(cov.status).toBe('OK')
  })

  it('퍼널의 sessionId 연결과 회원 ID 대조는 분리한다', async () => {
    db.users = [{ id: 'm1', providerId: '1', role: 'USER', createdAt: ago(3 * DAY) }]
    db.events = [{ eventName: 'sign_up', sessionId: 'sA', isBot: false, createdAt: ago(2 * DAY), userId: null }]
    const d = await run()
    // 퍼널 단계는 sessionId 기준이라 1 (이벤트가 있었다)
    expect(d.signupFunnel.steps.find((s) => s.key === 'signup_done')?.visitors).toBe(1)
    // 회원 대조는 ID 기준이라 0 (누구인지 연결이 안 된다)
    expect(d.signupEventCoverage.matchedMembers).toBe(0)
    expect(d.signupEventCoverage.unlinkableEvents).toBe(1)
  })
})

describe('[R8-P2-4] 잔존 모순이 남아 있지 않다', () => {
  const read = (rel: string) =>
    readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')

  it('화면이 퍼널을 "세션 기준"이라고 설명하지 않는다', () => {
    const page = read('src/app/admin/(panel)/member-recovery/page.tsx')
    expect(page).not.toContain('세션 기준')
    expect(page).toContain('방문자 기준')
  })

  it('철회된 "신규 실회원 7명" 표현이 코드·문서에 없다', () => {
    for (const rel of [
      'src/lib/queries/admin/admin.member-recovery.ts',
      'docs/operations/2026-09-10-r8-member-recovery-measurement.md',
    ]) {
      expect(read(rel), `${rel} 에 철회된 수치가 남아 있다`).not.toMatch(/신규 실회원 7명/)
    }
  })

  it('ID 대조 전에 "3/3 = 100%" 라고 단정하지 않는다', () => {
    const doc = read('docs/operations/2026-09-10-r8-member-recovery-measurement.md')
    expect(doc).not.toMatch(/3\/3\s*=\s*100%/)
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * P1 3차 보정 (2026-09-11) — 측정 '의미' 보정. 실패 테스트를 먼저 넣었다.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('[R8-P3-1] eligible/shown 은 전환이 아니라 계측 일관성이다', () => {
  /**
   * `SignupPromptBanner.tryFire` 는 `trackEvent('signup_banner_eligible')` 와
   * `trackEvent('signup_banner_shown')` 을 **연속 동기 호출**한다(fire-and-forget POST).
   * 서버가 두 요청을 처리하는 순서는 경쟁 조건이라 `createdAt` 선후가 뒤집힐 수 있다.
   * 이 둘 사이에 "전환율"을 만들면 **네트워크 경쟁을 전환 실패로 오독**한다.
   */
  it('적격→노출 전환율을 만들지 않는다', async () => {
    seedUsers()
    const d = await run()
    expect(d.signupFunnel.conversions.map((c) => c.key)).not.toContain('eligible_to_exposure')
  })

  it('순서가 뒤집혀도 실패로 판정되지 않는다 — 일관성 지표로만 센다', async () => {
    seedUsers()
    db.events = [
      { eventName: 'page_view', sessionId: 'v1', isBot: false, createdAt: ago(4 * DAY), userId: null },
      // 🔴 shown 이 eligible 보다 먼저 기록됐다(경쟁 조건). 전환 실패가 아니다.
      { eventName: 'signup_banner_shown', sessionId: 'v1', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_eligible', sessionId: 'v1', isBot: false, createdAt: ago(3 * DAY - 1) },
    ]
    const d = await run(30)
    expect(d.bannerConsistency.matched).toBe(1)
    expect(d.bannerConsistency.eligibleOnly).toBe(0)
    expect(d.bannerConsistency.shownOnly).toBe(0)
  })

  it('한쪽만 있는 방문자를 분리해 센다', async () => {
    seedUsers()
    db.events = [
      { eventName: 'signup_banner_eligible', sessionId: 'vE', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_shown', sessionId: 'vS', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_eligible', sessionId: 'vB', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_shown', sessionId: 'vB', isBot: false, createdAt: ago(3 * DAY) },
    ]
    const d = await run(30)
    expect(d.bannerConsistency).toMatchObject({ matched: 1, eligibleOnly: 1, shownOnly: 1 })
  })
})

describe('[R8-P3-2] 배너 반응은 CTA 전체가 먼저다', () => {
  it('app_install·external_browser 클릭도 배너 CTA 반응으로 센다 — 실패가 아니다', async () => {
    seedUsers()
    db.events = [
      { eventName: 'signup_banner_shown', sessionId: 'v1', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_shown', sessionId: 'v2', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_shown', sessionId: 'v3', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_clicked', sessionId: 'v1', isBot: false, createdAt: ago(2 * DAY), properties: { cta_type: 'kakao_oauth' } },
      { eventName: 'signup_banner_clicked', sessionId: 'v2', isBot: false, createdAt: ago(2 * DAY), properties: { cta_type: 'app_install' } },
      { eventName: 'signup_banner_clicked', sessionId: 'v3', isBot: false, createdAt: ago(2 * DAY), properties: { cta_type: 'external_browser' } },
    ]
    const d = await run(30)
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_banner_cta')!
    expect(c.denom).toBe(3)
    expect(c.numer).toBe(3) // 🔴 kakao_oauth 만 세면 1 이 된다
    expect(d.bannerCta.byType).toMatchObject({ kakao_oauth: 1, app_install: 1, external_browser: 1 })
  })

  it('카카오 OAuth 직행은 하위 분해값으로만 준다', async () => {
    seedUsers()
    db.events = [
      { eventName: 'signup_banner_shown', sessionId: 'v1', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_clicked', sessionId: 'v1', isBot: false, createdAt: ago(2 * DAY), properties: { cta_type: 'app_install' } },
    ]
    const d = await run(30)
    expect(d.bannerCta.anyVisitors).toBe(1)
    expect(d.bannerCta.byType.kakao_oauth).toBe(0)
  })

  it('나중에 발생한 사이트 전체 kakao_button_click 을 배너 전환으로 귀속하지 않는다', async () => {
    seedUsers()
    db.events = [
      { eventName: 'signup_banner_shown', sessionId: 'v1', isBot: false, createdAt: ago(3 * DAY) },
      // 🔴 배너 클릭이 아니라 사이트 어딘가(로그인 화면 등)의 카카오 버튼이다
      { eventName: 'kakao_button_click', sessionId: 'v1', isBot: false, createdAt: ago(2 * DAY) },
    ]
    const d = await run(30)
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_banner_cta')!
    expect(c.numer).toBe(0)
    expect(d.siteWideKakaoClick.visitors).toBe(1) // 참고값으로만 남는다
  })

  it('과거 signup_banner_shown 에 cta_type 이 없다는 한계를 명시한다', async () => {
    seedUsers()
    const d = await run()
    expect(d.dataQuality.some((q) => q.key === 'exposure_cta_unknown')).toBe(true)
  })
})

describe('[R8-P3-3] 수집 완전성 판정은 ID 대조 하나뿐이다', () => {
  it('건수 기반 signup_cross_check 항목이 없다', async () => {
    seedUsers()
    const d = await run()
    expect(d.dataQuality.map((q) => q.key)).not.toContain('signup_cross_check')
  })

  it('ID 대조가 GAP 인데 OK 라고 말하는 항목이 공존하지 않는다', async () => {
    db.users = [
      { id: 'm1', providerId: '1', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'm2', providerId: '2', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'm3', providerId: '3', role: 'USER', createdAt: ago(3 * DAY) },
    ]
    // 이벤트 3건이지만 전부 연결 불가 → 건수만 보면 3/3 이라 OK 로 보인다
    db.events = [
      { eventName: 'sign_up', sessionId: 'a', isBot: false, createdAt: ago(2 * DAY) },
      { eventName: 'sign_up', sessionId: 'b', isBot: false, createdAt: ago(2 * DAY) },
      { eventName: 'sign_up', sessionId: 'c', isBot: false, createdAt: ago(2 * DAY) },
    ]
    const d = await run()
    expect(d.signupEventCoverage.status).toBe('GAP')
    // 완전성을 언급하는 항목 중 OK 등급이 있으면 ID 대조 GAP 과 모순된다
    const completenessNotes = d.dataQuality.filter((q) => q.message.includes('완전성'))
    expect(completenessNotes.every((q) => q.level !== 'OK'), '건수 비교로 완전성 OK 라고 말하는 항목이 남아 있다').toBe(true)
    expect(d.dataQuality.map((q) => q.key)).not.toContain('signup_cross_check')
  })
})

describe('[R8-P3-4] 잔존 문구', () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')

  it('철회된 "이벤트 3 vs 실제 7" 주석이 없다', () => {
    expect(read('src/lib/queries/admin/admin.member-recovery.ts')).not.toMatch(/이벤트 3 vs 실제 7/)
  })

  it('visit 단계 설명이 소급 귀속 로직과 일치한다', async () => {
    seedUsers()
    const d = await run()
    const note = d.signupFunnel.steps.find((s) => s.key === 'visit')!.note
    expect(note).not.toMatch(/`userId` 가 없는 것만/)
    expect(note).toMatch(/가입 전/)
  })

  it('문서가 병목을 확정으로 쓰지 않는다', () => {
    const doc = read('docs/operations/2026-09-10-r8-member-recovery-measurement.md')
    expect(doc).not.toMatch(/병목 확정|병목이다/)
    expect(doc).toMatch(/직접 로그인 기록이 낮은 후보/)
  })
})
