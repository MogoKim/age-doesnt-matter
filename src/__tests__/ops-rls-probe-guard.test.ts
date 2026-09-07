import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * R6 PR-1 — ops-board DB probe 의 RLS 가드 회귀 테스트.
 *
 * 배경: RLS 가 켜져 있는데 현재 role 이 **전체 행을 읽을 수 없는** 테이블은
 *       에러 없이 0행(또는 일부 행)을 돌려준다.
 *       가드가 없으면 `ok:true, count=0` 이 되어 "데이터 0건"과 "안 보임"이 같은 결론이 된다.
 *       probe.types.ts 의 대원칙("ok=null 을 false 와 절대 혼동하지 않는다")을 DB probe 에서 지키는지 검증한다.
 *
 * pg 는 mock 한다 — 실제 DB 없이 세 경로(정상 / rls-blocked / rls-precheck-failed)를 전부 통과시킨다.
 */

const queryMock = vi.fn()
const connectMock = vi.fn()
const endMock = vi.fn()

vi.mock('pg', () => ({
  default: {
    Client: class {
      connect = connectMock
      query = queryMock
      end = endMock
    },
  },
}))

const RLS_PREFLIGHT_MARKER = 'relrowsecurity'

/** preflight 는 blocked 목록을, 카드 SQL 은 count 를 돌려주도록 분기한다. */
function mockDb(blocked: string[], count = 0) {
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes(RLS_PREFLIGHT_MARKER)) {
      return Promise.resolve({ rows: blocked.map((t) => ({ t })) })
    }
    return Promise.resolve({ rows: [{ n: count }] })
  })
}

async function loadProbe() {
  const mod = await import('../../scripts/ops-board/probes/db-probe')
  mod.__resetRlsPreflightCacheForTest()
  return mod
}

async function loadRlsModule() {
  return import('../../scripts/ops-board/probes/rls-visibility')
}

describe('extractTableNames', () => {
  it('FROM · JOIN 의 큰따옴표 식별자를 뽑는다', async () => {
    const { extractTableNames } = await loadRlsModule()
    const sql = `SELECT count(*)::int AS n
      FROM "Comment" c
      JOIN "Post" p ON p.id = c."postId"
      JOIN "User" u ON u.id = c."authorId"`
    expect(extractTableNames(sql).sort()).toEqual(['Comment', 'Post', 'User'])
  })

  it('대소문자 무관하게 매칭하고 중복은 한 번만 센다', async () => {
    const { extractTableNames } = await loadRlsModule()
    const sql = 'select * from "Post" p join "Post" q on true'
    expect(extractTableNames(sql)).toEqual(['Post'])
  })

  it('따옴표 없는 이름은 추출하지 않는다 (Postgres 가 소문자로 접어 매칭되지 않음)', async () => {
    const { extractTableNames } = await loadRlsModule()
    expect(extractTableNames('SELECT count(*) AS n FROM Post')).toEqual([])
  })

  it('schema-qualified 참조를 모두 인식한다', async () => {
    const { extractTableNames } = await loadRlsModule()
    expect(extractTableNames('SELECT 1 AS n FROM public."Post"')).toEqual(['Post'])
    expect(extractTableNames('SELECT 1 AS n FROM "public"."Post"')).toEqual(['Post'])
    expect(extractTableNames('SELECT 1 AS n FROM x JOIN public."Comment" c ON true')).toEqual(['Comment'])
    expect(extractTableNames('SELECT 1 AS n FROM x JOIN "public"."Comment" c ON true')).toEqual(['Comment'])
  })

  it('public 이 아닌 스키마 참조는 제외한다 (차단 목록은 public 전용)', async () => {
    const { extractTableNames } = await loadRlsModule()
    expect(extractTableNames('SELECT 1 AS n FROM other."Post"')).toEqual([])
    expect(extractTableNames('SELECT 1 AS n FROM "auth"."users"')).toEqual([])
  })

  it('컬럼의 큰따옴표는 테이블로 오인하지 않는다', async () => {
    const { extractTableNames } = await loadRlsModule()
    const sql = 'SELECT "postId" AS n FROM "EventLog" WHERE "eventName" = \'x\''
    expect(extractTableNames(sql)).toEqual(['EventLog'])
  })
})

describe('findBlockedTables', () => {
  it('참조 테이블 중 차단된 것만 돌려준다', async () => {
    const { findBlockedTables } = await loadRlsModule()
    const sql = 'SELECT count(*) AS n FROM "Post" p JOIN "VoteBallot" v ON true'
    expect(findBlockedTables(sql, new Set(['VoteBallot', 'FcmToken']))).toEqual(['VoteBallot'])
  })

  it('차단 테이블이 없으면 빈 배열', async () => {
    const { findBlockedTables } = await loadRlsModule()
    expect(findBlockedTables('SELECT count(*) AS n FROM "Post"', new Set(['FcmToken']))).toEqual([])
  })
})

describe('dbCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    connectMock.mockResolvedValue(undefined)
    endMock.mockResolvedValue(undefined)
    process.env.OPS_BOARD_READONLY_URL = 'postgres://test-not-a-real-url/db'
  })

  it('정상 경로 — 기존과 동일하게 ok:true 와 count 를 반환한다 (회귀 방지)', async () => {
    mockDb([], 42)
    const { dbCount } = await loadProbe()
    const res = await dbCount('label', 'SELECT count(*)::int AS n FROM "Post"')
    expect(res.ok).toBe(true)
    expect(res.signal).toBe('count=42')
    expect(res.detail.count).toBe(42)
  })

  it('차단 테이블이 0행이어도 ok:true 로 통과시키지 않는다', async () => {
    mockDb(['VoteBallot'], 0)
    const { dbCount } = await loadProbe()
    const res = await dbCount('label', 'SELECT count(*)::int AS n FROM "VoteBallot"')
    expect(res.ok).toBeNull()
    expect(res.signal).toBe('rls-blocked')
    expect(res.detail.blockedTables).toBe('VoteBallot')
    expect(res.error).toContain('VoteBallot')
  })

  it('여러 테이블 중 하나만 차단돼도 rls-blocked 로 막는다', async () => {
    mockDb(['FcmToken'], 7)
    const { dbCount } = await loadProbe()
    const res = await dbCount('label', 'SELECT count(*) AS n FROM "Post" p JOIN "FcmToken" f ON true')
    expect(res.ok).toBeNull()
    expect(res.signal).toBe('rls-blocked')
  })

  it('schema-qualified 참조도 차단 목록에 걸리면 rls-blocked', async () => {
    mockDb(['SurveyResponse'], 0)
    const { dbCount } = await loadProbe()
    const res = await dbCount('label', 'SELECT count(*)::int AS n FROM public."SurveyResponse"')
    expect(res.ok).toBeNull()
    expect(res.signal).toBe('rls-blocked')
    expect(res.detail.blockedTables).toBe('SurveyResponse')
  })

  it('preflight 가 실패하면 rls-precheck-failed 로 떨어뜨린다 (ok:true 금지)', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes(RLS_PREFLIGHT_MARKER)) return Promise.reject(new Error('permission denied for pg_policies'))
      return Promise.resolve({ rows: [{ n: 99 }] })
    })
    const { dbCount } = await loadProbe()
    const res = await dbCount('label', 'SELECT count(*)::int AS n FROM "Post"')
    expect(res.ok).toBeNull()
    expect(res.signal).toBe('rls-precheck-failed')
    expect(res.error).toContain('permission denied')
  })

  it('preflight 는 프로세스당 1회만 조회한다', async () => {
    mockDb([], 1)
    const { dbCount } = await loadProbe()
    await dbCount('a', 'SELECT count(*)::int AS n FROM "Post"')
    await dbCount('b', 'SELECT count(*)::int AS n FROM "Comment"')
    const preflightCalls = queryMock.mock.calls.filter(([sql]) => String(sql).includes(RLS_PREFLIGHT_MARKER))
    expect(preflightCalls).toHaveLength(1)
  })

  it('URL 미설정이면 기존과 동일하게 db-url-missing (RLS 조회 시도 없음)', async () => {
    delete process.env.OPS_BOARD_READONLY_URL
    const { dbCount } = await loadProbe()
    const res = await dbCount('label', 'SELECT count(*)::int AS n FROM "Post"')
    expect(res.signal).toBe('db-url-missing')
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('SELECT 외 쿼리는 기존과 동일하게 차단한다', async () => {
    const { dbCount } = await loadProbe()
    const res = await dbCount('label', 'UPDATE "Post" SET title = \'x\'')
    expect(res.signal).toBe('non-select-blocked')
    expect(connectMock).not.toHaveBeenCalled()
  })
})

describe('compareBlocked (check-rls-visibility)', () => {
  it('예상과 실제가 같으면 ok', async () => {
    const { compareBlocked, EXPECTED_BLOCKED } = await import('../../scripts/check-rls-visibility')
    expect(compareBlocked(EXPECTED_BLOCKED, [...EXPECTED_BLOCKED]).ok).toBe(true)
  })

  it('예상 밖 차단(정책 없이 추가된 신규 테이블)을 실패로 잡는다', async () => {
    const { compareBlocked, EXPECTED_BLOCKED } = await import('../../scripts/check-rls-visibility')
    const r = compareBlocked(EXPECTED_BLOCKED, [...EXPECTED_BLOCKED, 'BrandNewTable'])
    expect(r.ok).toBe(false)
    expect(r.unexpectedlyBlocked).toEqual(['BrandNewTable'])
    expect(r.unexpectedlyOpen).toEqual([])
  })

  it('민감 테이블이 열리면 실패로 잡는다', async () => {
    const { compareBlocked, EXPECTED_BLOCKED } = await import('../../scripts/check-rls-visibility')
    const opened = EXPECTED_BLOCKED.filter((t) => t !== 'FcmToken')
    const r = compareBlocked(EXPECTED_BLOCKED, opened)
    expect(r.ok).toBe(false)
    expect(r.unexpectedlyOpen).toEqual(['FcmToken'])
  })
})

describe('RLS_BLOCKED_SQL — 전체 행 가시성 기준(fail-closed)', () => {
  it('permissive 정책은 qual 이 무조건 true 인 것만 인정한다 (USING(false)·조건부 제외)', async () => {
    const { RLS_BLOCKED_SQL } = await loadRlsModule()
    // permissive 분기: qual 이 정확히 'true' 인 정책이 없으면 차단
    expect(RLS_BLOCKED_SQL).toContain("p.permissive = 'PERMISSIVE'")
    expect(RLS_BLOCKED_SQL).toContain("btrim(coalesce(p.qual, '')) = 'true'")
    expect(RLS_BLOCKED_SQL).toMatch(/NOT EXISTS\s*\(\s*SELECT 1\s*FROM pg_policies/)
  })

  it('restrictive 정책이 전체 행을 열지 않으면 차단으로 본다', async () => {
    const { RLS_BLOCKED_SQL } = await loadRlsModule()
    expect(RLS_BLOCKED_SQL).toContain("p.permissive = 'RESTRICTIVE'")
    expect(RLS_BLOCKED_SQL).toContain("btrim(coalesce(p.qual, '')) <> 'true'")
  })

  it('SELECT 권한이 없으면 차단으로 본다', async () => {
    const { RLS_BLOCKED_SQL } = await loadRlsModule()
    expect(RLS_BLOCKED_SQL).toContain("NOT has_table_privilege(current_user, c.oid, 'SELECT')")
  })

  it('cmd 는 SELECT/ALL 만, role 은 현재 role(멤버십) 또는 PUBLIC 만 인정한다', async () => {
    const { RLS_BLOCKED_SQL } = await loadRlsModule()
    expect(RLS_BLOCKED_SQL).toContain("p.cmd IN ('SELECT', 'ALL')")
    expect(RLS_BLOCKED_SQL).toContain("pg_has_role(current_user, r, 'MEMBER')")
    expect(RLS_BLOCKED_SQL).toContain("r = 'public'")
  })

  it('BYPASSRLS/superuser 로 실행하면 차단 목록이 비도록 한다', async () => {
    const { RLS_BLOCKED_SQL } = await loadRlsModule()
    expect(RLS_BLOCKED_SQL).toContain('rolbypassrls OR r.rolsuper')
  })
})

describe('기존 /board 카드 회귀', () => {
  it('현재 카드 SQL 은 차단 6개를 참조하지 않는다 (판정 변화 없음)', async () => {
    const { findBlockedTables } = await loadRlsModule()
    const { EXPECTED_BLOCKED } = await import('../../scripts/check-rls-visibility')
    const { CARDS } = await import('../../scripts/ops-board/cards/cards')
    const blocked = new Set<string>(EXPECTED_BLOCKED)
    const dbCards = CARDS.filter((c) => c.probes?.db)
    expect(dbCards.length).toBeGreaterThan(0)
    for (const c of dbCards) {
      expect(findBlockedTables(c.probes!.db!.sql, blocked)).toEqual([])
    }
  })

  it('예상 차단 6개가 정확히 유지된다', async () => {
    const { EXPECTED_BLOCKED } = await import('../../scripts/check-rls-visibility')
    expect([...EXPECTED_BLOCKED].sort()).toEqual([
      'AdminAccount',
      'AppHandoffToken',
      'FcmToken',
      'PushSubscription',
      'SurveyResponse',
      'VoteBallot',
    ])
  })
})
