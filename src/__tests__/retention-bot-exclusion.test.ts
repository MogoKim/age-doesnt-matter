import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 공유 지표 회귀 — `getRetentionQuadrants()` 의 **회원 활성 이벤트에 `isBot=false` 가 걸려 있는지** 고정한다.
 *
 * 배경: 회원 리텐션은 `EventLog` 의 `page_view`·`login` 으로 "그 날 활동했다"를 판정한다.
 * 그런데 **회원 id 가 붙은 이벤트라도 봇으로 표시된 것**(`botType='e2e-test'`·`'founder'` 등)이 있다.
 * 필터가 없으면 그 날짜가 활성으로 잡혀 **D1·D7 이 실제보다 높게** 나온다.
 * 이 지표는 R8 회원 소생 화면이 그대로 재사용하므로, 여기가 틀리면 두 화면이 함께 틀린다.
 */

const DAY = 86400000
const NOW = Date.parse('2026-09-10T00:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms)

interface UserRow { id: string; providerId: string; role: string; signupSource: string | null; createdAt: Date }
interface EventRow { userId: string | null; sessionId: string | null; eventName: string; isBot: boolean; createdAt: Date; referrer?: string | null; path?: string | null; botType?: string | null }

const db = { users: [] as UserRow[], events: [] as EventRow[] }
/** eventLog.findMany 에 전달된 where 를 전부 기록 — 필터가 실제로 붙는지 본다. */
const eventWheres: Record<string, unknown>[] = []

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: async ({ where }: { where?: { role?: string } } = {}) =>
        db.users.filter((u) => (where?.role ? u.role === where.role : true)),
    },
    eventLog: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        eventWheres.push(where)
        const w = where as {
          userId?: { in: string[] } | { not?: null }
          eventName?: { in: string[] }
          createdAt?: { gte?: Date }
          isBot?: boolean
          sessionId?: { not?: null }
          OR?: unknown[]
        }
        return db.events.filter((e) => {
          if (w.isBot !== undefined && e.isBot !== w.isBot) return false
          if (w.createdAt?.gte && e.createdAt < w.createdAt.gte) return false
          if (w.eventName?.in && !w.eventName.in.includes(e.eventName)) return false
          const uid = w.userId as { in?: string[] } | undefined
          if (uid?.in && (!e.userId || !uid.in.includes(e.userId))) return false
          if (w.sessionId?.not === null && e.sessionId == null) return false
          return true
        })
      },
    },
  },
}))

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  db.users = []
  db.events = []
  eventWheres.length = 0
})

async function run() {
  const { getRetentionQuadrants } = await import('@/lib/queries/admin/admin.retention')
  return getRetentionQuadrants()
}

describe('[RET-1] 회원 활성 이벤트는 봇 표시분을 제외한다', () => {
  it('회원 이벤트 조회에 isBot=false 가 걸려 있다', async () => {
    db.users = [{ id: 'u1', providerId: '1001', role: 'USER', signupSource: 'WEB', createdAt: ago(30 * DAY) }]
    await run()
    const memberQuery = eventWheres.find((w) => {
      const uid = (w as { userId?: { in?: string[] } }).userId
      return Array.isArray(uid?.in)
    })
    expect(memberQuery, '회원 활성 이벤트 조회를 찾지 못했다').toBeDefined()
    expect(memberQuery, 'isBot 필터가 없으면 봇 표시 이벤트가 회원 리텐션을 부풀린다').toMatchObject({ isBot: false })
  })

  it('봇으로 표시된 회원 이벤트만 있으면 D1 재방문으로 세지 않는다', async () => {
    db.users = [{ id: 'u1', providerId: '1001', role: 'USER', signupSource: 'WEB', createdAt: ago(30 * DAY) }]
    db.events = [
      // 🔴 회원 id 가 붙었지만 봇 표시 — 활성으로 세면 안 된다
      { userId: 'u1', sessionId: 's1', eventName: 'page_view', isBot: true, botType: 'e2e-test', createdAt: ago(10 * DAY) },
    ]
    const web = (await run()).members.find((m) => m.segment === '웹 회원')!
    expect(web.d1.denom).toBe(1)
    expect(web.d1.returned).toBe(0)
  })

  it('사람 이벤트는 그대로 D1 재방문으로 센다', async () => {
    db.users = [{ id: 'u1', providerId: '1001', role: 'USER', signupSource: 'WEB', createdAt: ago(30 * DAY) }]
    db.events = [
      { userId: 'u1', sessionId: 's1', eventName: 'page_view', isBot: false, createdAt: ago(10 * DAY) },
    ]
    const web = (await run()).members.find((m) => m.segment === '웹 회원')!
    expect(web.d1.returned).toBe(1)
  })
})

describe('[RET-2] 어드민은 회원 리텐션에서 빠진다', () => {
  it('role=ADMIN 은 코호트에 들어가지 않는다', async () => {
    db.users = [{ id: 'admin', providerId: '9999', role: 'ADMIN', signupSource: 'WEB', createdAt: ago(30 * DAY) }]
    const total = (await run()).members.reduce((n, m) => n + m.d1.denom, 0)
    expect(total).toBe(0)
  })
})
