// DB read-only probe (2단계) — OPS_BOARD_READONLY_URL(읽기 전용 role)로만 접속.
// 안전장치 3중: ①읽기 전용 DB role(권한이 write 거부) ②SELECT 외 쿼리 거부(코드 가드) ③SQL은 카드 하드코딩(사용자 입력 아님).
import pg from 'pg'
import type { ProbeResult } from './probe.types.js'
import { nowIso } from './probe.types.js'

const TIMEOUT_MS = 10_000

/**
 * read-only count 쿼리 실행. 반드시 `SELECT ... AS n` 형태(단일 정수 n 반환).
 * - 성공: ok=true, signal=`count=N`, detail.count=N
 * - URL 미설정: ok=null (1단계 상태 — DB proof 비활성)
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
