// DB read-only probe (2단계) — OPS_BOARD_READONLY_URL(읽기 전용 role)로만 접속.
// 안전장치 3중: ①읽기 전용 DB role(권한이 write 거부) ②SELECT 외 쿼리 거부(코드 가드) ③SQL은 카드 하드코딩(사용자 입력 아님).
//
// [RLS 가드] RLS가 켜져 있고 현재 role에 유효한 SELECT 정책이 없는 테이블은
// 쿼리가 **에러 없이 0행**을 돌려준다. 그대로 두면 "데이터가 0건"과 "안 보여서 0건"이
// 같은 결론(ok:true, count=0)이 되어 카드가 잘못 판정된다.
// probe.types.ts의 대원칙("ok=null(판정불가)을 false와 절대 혼동하지 않는다")을 DB probe에도 적용한다.
import pg from 'pg'
import type { ProbeResult } from './probe.types.js'
import { nowIso } from './probe.types.js'

const TIMEOUT_MS = 10_000

/**
 * RLS로 가려진 테이블 목록을 구하는 쿼리.
 *
 * 단순히 `policy_count = 0`으로 보면 안 된다. 정책이 있어도
 * ①대상 role이 다르거나 ②cmd가 SELECT/ALL이 아니면 읽기에는 무효다.
 * 그래서 `pg_policies.roles`에 현재 role(그룹 멤버십 포함) 또는 PUBLIC이 있고
 * cmd가 SELECT 또는 ALL인 정책만 "유효"로 센다.
 */
const RLS_BLOCKED_SQL = `
  SELECT c.relname AS t
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND NOT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = c.relname
        AND p.cmd IN ('SELECT', 'ALL')
        AND EXISTS (
          SELECT 1 FROM unnest(p.roles) AS r
          WHERE r = 'public' OR pg_has_role(current_user, r, 'MEMBER')
        )
    )
`

type RlsPreflight =
  | { ok: true; blocked: Set<string> }
  | { ok: false; error: string }

/** 프로세스당 1회만 조회한다(카드 수만큼 반복하지 않기 위함). */
let preflightCache: RlsPreflight | null = null

/** 테스트 전용 — 모듈 캐시 초기화. 운영 코드에서 호출하지 않는다. */
export function __resetRlsPreflightCacheForTest(): void {
  preflightCache = null
}

/**
 * SQL이 참조하는 테이블명을 뽑는다.
 *
 * 카드 SQL은 전부 하드코딩이며 큰따옴표 식별자를 쓴다(`FROM "Post"` / `JOIN "Comment" c`).
 * 따옴표 없는 이름은 Postgres가 소문자로 접어버려 PascalCase 테이블과 매칭되지 않으므로
 * 애초에 동작하지 않는다 → 따옴표 있는 것만 추출한다.
 */
export function extractTableNames(sql: string): string[] {
  const found = new Set<string>()
  const re = /\b(?:from|join)\s+"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) found.add(m[1])
  return [...found]
}

/** 참조 테이블 중 RLS로 가려진 것만 돌려준다. */
export function findBlockedTables(sql: string, blocked: Set<string>): string[] {
  return extractTableNames(sql).filter((t) => blocked.has(t))
}

async function loadRlsPreflight(client: pg.Client): Promise<RlsPreflight> {
  if (preflightCache) return preflightCache
  try {
    const res = await client.query(RLS_BLOCKED_SQL)
    const blocked = new Set<string>((res.rows as { t: string }[]).map((r) => r.t))
    preflightCache = { ok: true, blocked }
  } catch (err) {
    // 사전검증 실패는 "안전한 쪽"으로 떨어뜨린다 — ok:true로 통과시키지 않는다.
    preflightCache = { ok: false, error: (err as Error).message.split('\n')[0].slice(0, 120) }
  }
  return preflightCache
}

/**
 * read-only count 쿼리 실행. 반드시 `SELECT ... AS n` 형태(단일 정수 n 반환).
 * - 성공: ok=true, signal=`count=N`, detail.count=N
 * - URL 미설정: ok=null (1단계 상태 — DB proof 비활성)
 * - RLS로 가려진 테이블 참조: ok=null, signal='rls-blocked' (0행을 확정값으로 오판하지 않기 위함)
 * - RLS 사전검증 실패: ok=null, signal='rls-precheck-failed'
 * - 조회 실패/타임아웃: ok=null (판정불가, false로 떨구지 않음)
 */
export async function dbCount(label: string, sql: string, params: unknown[] = []): Promise<ProbeResult> {
  const start = Date.now()
  const url = process.env.OPS_BOARD_READONLY_URL

  if (!url) {
    return {
      kind: 'db', ok: null, signal: 'db-url-missing',
      detail: { label }, checkedAt: nowIso(), durationMs: 0,
      error: 'OPS_BOARD_READONLY_URL 미설정(1단계)',
    }
  }
  // 코드 레벨 가드: SELECT 외 차단 (role이 1차 방어, 이건 2차)
  if (!/^\s*select\b/i.test(sql)) {
    return {
      kind: 'db', ok: null, signal: 'non-select-blocked',
      detail: { label }, checkedAt: nowIso(), durationMs: 0,
      error: 'SELECT 외 쿼리 거부',
    }
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: TIMEOUT_MS,
    query_timeout: TIMEOUT_MS,
    statement_timeout: TIMEOUT_MS,
  })
  try {
    await client.connect()

    // RLS 사전검증 — 가려진 테이블을 참조하면 실행 자체를 하지 않는다.
    const pre = await loadRlsPreflight(client)
    if (!pre.ok) {
      return {
        kind: 'db', ok: null, signal: 'rls-precheck-failed',
        detail: { label }, checkedAt: nowIso(), durationMs: Date.now() - start,
        error: `RLS 사전검증 실패: ${pre.error}`,
      }
    }
    const blockedTables = findBlockedTables(sql, pre.blocked)
    if (blockedTables.length > 0) {
      return {
        kind: 'db', ok: null, signal: 'rls-blocked',
        detail: { label, blockedTables: blockedTables.join(',') },
        checkedAt: nowIso(), durationMs: Date.now() - start,
        error: `RLS 정책 없음(0행이 아니라 판정불가): ${blockedTables.join(', ')}`,
      }
    }

    const res = await client.query(sql, params)
    const n = Number(res.rows[0]?.n ?? 0)
    return {
      kind: 'db', ok: true, signal: `count=${n}`,
      detail: { label, count: n }, checkedAt: nowIso(), durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      kind: 'db', ok: null, signal: 'db-error',
      detail: { label }, checkedAt: nowIso(), durationMs: Date.now() - start,
      error: (err as Error).message.split('\n')[0].slice(0, 120),
    }
  } finally {
    await client.end().catch(() => {})
  }
}
