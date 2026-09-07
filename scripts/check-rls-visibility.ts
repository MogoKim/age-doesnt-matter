// RLS 가시성 가드 — ops_board_ro 가 읽을 수 있는 테이블 집합이 의도와 같은지 검사한다.
//
// 배경: RLS 가 켜져 있는데 현재 role 이 **전체 행을 읽을 수 없는** 테이블은
//       에러 없이 0행(또는 일부 행)을 돌려준다.
//       그래서 "데이터 없음"과 "안 보임"이 구분되지 않아 진단이 조용히 틀린다.
//       db-probe.ts 는 "이 쿼리"를 막지만, 가려진 테이블이 **새로 생기는 것** 자체는 못 잡는다.
//       이 스크립트가 그 drift 를 잡는다.
//       판정 기준(RLS_BLOCKED_SQL)은 db-probe.ts 와 같은 모듈을 쓴다 — 두 곳이 어긋나지 않게 한다.
//
// 두 방향을 모두 실패로 본다.
//   ① 예상 밖 테이블이 차단됨  → 새 테이블이 정책 없이 추가된 경우(진단이 조용히 틀어진다)
//   ② 예상 차단 테이블이 열림  → 민감 테이블이 실수로 열린 경우(이쪽이 더 위험하다)
//
// 실행: npx tsx scripts/check-rls-visibility.ts
import { config } from 'dotenv'
import pg from 'pg'
import { RLS_BLOCKED_SQL } from './ops-board/probes/rls-visibility.js'

config({ path: '.env.local' })

const TIMEOUT_MS = 10_000

/**
 * 의도적으로 차단해 둔 테이블.
 *
 * 앞의 3개는 마스킹 view 로 대체 예정이라 직접 정책을 붙이지 않는다.
 * 뒤의 3개는 영구 차단 — 읽기만으로도 악용 가능한 자격증명이 들어 있다.
 *   PushSubscription : endpoint + p256dh + auth → 해당 브라우저로 푸시 발송 가능
 *   FcmToken         : token → 앱 푸시 발송 가능
 *   AppHandoffToken  : nonce → 세션 탈취 경로
 */
export const EXPECTED_BLOCKED = [
  'AdminAccount',
  'SurveyResponse',
  'VoteBallot',
  'PushSubscription',
  'FcmToken',
  'AppHandoffToken',
] as const

export interface RlsVisibilityReport {
  expectedBlocked: string[]
  actualBlocked: string[]
  /** 예상에 없는데 차단된 테이블 — 정책 없이 추가된 신규 테이블 */
  unexpectedlyBlocked: string[]
  /** 예상 차단인데 열려 있는 테이블 — 민감 테이블 노출 */
  unexpectedlyOpen: string[]
  ok: boolean
}

/** 순수 비교 로직 — DB 없이 테스트할 수 있게 분리한다. */
export function compareBlocked(expected: readonly string[], actual: readonly string[]): RlsVisibilityReport {
  const exp = new Set(expected)
  const act = new Set(actual)
  const unexpectedlyBlocked = [...act].filter((t) => !exp.has(t)).sort()
  const unexpectedlyOpen = [...exp].filter((t) => !act.has(t)).sort()
  return {
    expectedBlocked: [...exp].sort(),
    actualBlocked: [...act].sort(),
    unexpectedlyBlocked,
    unexpectedlyOpen,
    ok: unexpectedlyBlocked.length === 0 && unexpectedlyOpen.length === 0,
  }
}

async function main(): Promise<void> {
  const url = process.env.OPS_BOARD_READONLY_URL
  if (!url) {
    // secret 없는 환경(1단계·CI)에서 깨지지 않게 한다 — db-probe.ts 의 db-url-missing 과 같은 방침.
    console.log('SKIP: OPS_BOARD_READONLY_URL 미설정 — RLS 가시성 검사를 건너뜁니다.')
    process.exit(0)
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: TIMEOUT_MS,
    query_timeout: TIMEOUT_MS,
    statement_timeout: TIMEOUT_MS,
  })

  let actual: string[]
  try {
    await client.connect()
    const res = await client.query(RLS_BLOCKED_SQL)
    actual = (res.rows as { t: string }[]).map((r) => r.t)
  } catch (err) {
    // 조회 자체가 실패하면 "이상 없음"으로 통과시키지 않는다.
    console.error(`FAIL: RLS 가시성 조회 실패 — ${(err as Error).message.split('\n')[0].slice(0, 160)}`)
    process.exit(1)
    return
  } finally {
    await client.end().catch(() => {})
  }

  const report = compareBlocked(EXPECTED_BLOCKED, actual)
  console.log(JSON.stringify(report, null, 2))

  if (report.unexpectedlyBlocked.length > 0) {
    console.error(
      `FAIL: 예상 밖으로 차단된 테이블 ${report.unexpectedlyBlocked.length}개 — ` +
        `${report.unexpectedlyBlocked.join(', ')}\n` +
        '  → RLS 정책 없이 추가된 테이블입니다. 진단이 이 테이블을 "0행"으로 오판합니다.',
    )
  }
  if (report.unexpectedlyOpen.length > 0) {
    console.error(
      `FAIL: 차단돼 있어야 하는데 열린 테이블 ${report.unexpectedlyOpen.length}개 — ` +
        `${report.unexpectedlyOpen.join(', ')}\n` +
        '  → 민감 테이블이 ops_board_ro 에 노출됐습니다. 즉시 정책을 확인하세요.',
    )
  }
  if (report.ok) console.log('PASS: 차단 테이블 집합이 예상과 일치합니다.')

  process.exit(report.ok ? 0 : 1)
}

// 직접 실행일 때만 동작한다. 테스트가 compareBlocked 를 import 해도 process.exit 이 걸리지 않게 한다.
if (process.argv[1]?.includes('check-rls-visibility')) {
  void main()
}
