import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  userId?: null | { in: string[] }
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
      groupBy: async ({ where }: { where: EventWhere }) => {
        const rows = db.events.filter((e) => {
          if (where.isBot !== undefined && e.isBot !== where.isBot) return false
          if (where.createdAt?.gte && e.createdAt < where.createdAt.gte) return false
          if (where.sessionId?.not === null && e.sessionId == null) return false
          if (where.userId === null && (e.userId ?? null) !== null) return false
          if (typeof where.eventName === 'string' && e.eventName !== where.eventName) return false
          if (where.properties?.path) {
            const [key] = where.properties.path
            if ((e.properties?.[key] ?? null) !== where.properties.equals) return false
          }
          return true
        })
        // 순서 검증을 하려면 방문자별 **최초 시각**이 필요하다 — _min 집계를 흉내낸다.
        const min = new Map<string | null, Date>()
        for (const r of rows) {
          const cur = min.get(r.sessionId)
          if (!cur || r.createdAt < cur) min.set(r.sessionId, r.createdAt)
        }
        return [...min].map(([sessionId, createdAt]) => ({ sessionId, _min: { createdAt } }))
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

  it('로그인 시작 = kakao_button_click ∪ 배너 카카오 CTA — app_install 은 안 센다', async () => {
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'login_start')?.visitors).toBe(2) // s1, s2
  })

  it('전환마다 분모·분자를 함께 돌려준다', async () => {
    const d = await run()
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_login_start')!
    expect(c.denom).toBe(2)
    expect(c.numer).toBe(2)
    expect(c.rate).toBe(100)
  })

  it('로그인 시작은 유실 가능이라 PARTIAL 로 표시한다 — 정확값으로 읽으면 안 된다', async () => {
    const d = await run()
    expect(d.signupFunnel.steps.find((s) => s.key === 'login_start')?.status).toBe('PARTIAL')
  })
})

describe('[R8-3] 분모 0 은 0% 가 아니라 판정 불가', () => {
  it('노출 세션이 없으면 rate=null · NO_DENOM 이다', async () => {
    seedUsers()
    db.events = [{ eventName: 'page_view', sessionId: 's1', isBot: false, createdAt: ago(DAY) }]
    const d = await run()
    const c = d.signupFunnel.conversions.find((x) => x.key === 'exposure_to_login_start')!
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
  it('실제 가입자가 있는데 sign_up 이벤트가 0이면 GAP 으로 올린다', async () => {
    seedUsers() // 신규 실회원 2명
    db.events = [{ eventName: 'page_view', sessionId: 's1', isBot: false, createdAt: ago(DAY) }]
    const d = await run()
    const note = d.dataQuality.find((q) => q.key === 'signup_cross_check')!
    expect(note.level).toBe('GAP')
    expect(note.message).toContain('이벤트 미수집')
  })

  it('이벤트가 실제 가입자의 절반에 못 미치면 WARN 으로 올린다 (production 30일: 3 vs 7)', async () => {
    // 실회원 3명 가입, sign_up 이벤트는 1건 → 1 < 3/2 → 유실 의심
    db.users = [
      { id: 'a', providerId: '1', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'b', providerId: '2', role: 'USER', createdAt: ago(3 * DAY) },
      { id: 'c', providerId: '3', role: 'USER', createdAt: ago(3 * DAY) },
    ]
    db.events = [{ eventName: 'sign_up', sessionId: 's1', isBot: false, createdAt: ago(DAY) }]
    const note = (await run()).dataQuality.find((q) => q.key === 'signup_cross_check')!
    expect(note.level).toBe('WARN')
    expect(note.message).toContain('유실 의심')
  })

  it('이벤트가 가입자 수와 맞으면 OK 다', async () => {
    db.users = [{ id: 'a', providerId: '1', role: 'USER', createdAt: ago(3 * DAY) }]
    db.events = [{ eventName: 'sign_up', sessionId: 's1', isBot: false, createdAt: ago(DAY) }]
    expect((await run()).dataQuality.find((q) => q.key === 'signup_cross_check')?.level).toBe('OK')
  })

  it('가입자가 0이면 대조할 것이 없어 OK 다 — 이벤트 0 을 결손으로 오인하지 않는다', async () => {
    db.users = []
    db.events = [{ eventName: 'page_view', sessionId: 's1', isBot: false, createdAt: ago(DAY) }]
    const note = (await run()).dataQuality.find((q) => q.key === 'signup_cross_check')!
    expect(note.level).toBe('OK')
    expect(note.message).toContain('대조할 것이 없다')
  })

  it('로그인 시작 유실 가능성을 항상 경고로 남긴다', async () => {
    seedUsers()
    const d = await run()
    expect(d.dataQuality.find((q) => q.key === 'login_start_rate_limit')?.level).toBe('WARN')
  })

  it('제외한 내부 세션·어드민 수를 밝힌다', async () => {
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

  it('signup_banner_eligible 단계를 퍼널에 포함한다', async () => {
    seedUsers()
    const d = await run()
    const keys = d.signupFunnel.steps.map((s) => s.key)
    expect(keys).toEqual(['visit', 'eligible', 'exposure', 'login_start', 'signup_done'])
  })

  it('시간 순서가 뒤집힌 전환은 세지 않는다 — 단순 교집합이면 오답이 나온다', async () => {
    seedUsers()
    db.events = [
      // v1: eligible(3일 전) → shown(2일 전). 정상 순서
      { eventName: 'page_view', sessionId: 'v1', isBot: false, createdAt: ago(4 * DAY), userId: null },
      { eventName: 'signup_banner_eligible', sessionId: 'v1', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_shown', sessionId: 'v1', isBot: false, createdAt: ago(2 * DAY) },
      // 🔴 v2: shown(3일 전)이 eligible(1일 전)보다 **먼저**다 — 전환으로 세면 안 된다
      { eventName: 'page_view', sessionId: 'v2', isBot: false, createdAt: ago(4 * DAY), userId: null },
      { eventName: 'signup_banner_shown', sessionId: 'v2', isBot: false, createdAt: ago(3 * DAY) },
      { eventName: 'signup_banner_eligible', sessionId: 'v2', isBot: false, createdAt: ago(DAY) },
    ]
    const d = await run()
    const c = d.signupFunnel.conversions.find((x) => x.key === 'eligible_to_exposure')!
    expect(c.denom).toBe(2) // eligible 방문자 2
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
    db.events = [{ eventName: 'sign_up', sessionId: 'v1', isBot: false, createdAt: ago(DAY) }]
    const d = await run()
    expect(d.signupEventCoverage.actualNewMembers).toBe(3)
    expect(d.signupEventCoverage.events).toBe(1)
    expect(d.signupEventCoverage.rate).toBe(33.3)
    expect(d.signupEventCoverage.status).toBe('PARTIAL')
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
