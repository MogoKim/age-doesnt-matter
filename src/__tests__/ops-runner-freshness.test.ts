import { describe, expect, it } from 'vitest'
import {
  EXPECTED_LAUNCHD_ROOT,
  LAUNCHD_RUNNERS,
  formatVerdictDetail,
  isActiveWriteRunner,
  judgeRunnerFreshness,
  launchdGrade,
  parseSyncLogTail,
  SYNC_LOG_MARKER,
  UNKNOWN_LAUNCHD_GRADE,
  unknownFreshness,
  type RunnerCheckInput,
  type SyncEvidence,
  type WorktreeFreshness,
} from '../../scripts/ops-runner-manifest'

/**
 * P0-1B — ops-doctor freshness guard 회귀 테스트.
 *
 * 이 파일의 존재 이유는 단 하나다: **O1 사고를 다시 통과시키지 않는 것.**
 * 판정이 순수 함수라 실제 launchd/worktree를 건드리지 않고 사고 상황을 재현할 수 있다.
 */

/** 정상 상태 기준선 — 각 테스트는 여기서 필요한 필드만 덮어쓴다 */
const healthyProd: WorktreeFreshness = {
  root: 'prod',
  path: '/Users/yanadoo/Documents/unao-prod',
  exists: true,
  isGitRepo: true,
  branch: 'main',
  headSha: '019b47e5',
  dirtyCount: 0,
  hasUpstream: true,
  ahead: 0,
  behind: 0,
  divergedFromRemote: false,
  headAgeHours: 2,
  syncIntervalHours: 24,
}

function input(over: Partial<RunnerCheckInput> = {}): RunnerCheckInput {
  return {
    name: 'com.unao.naver-cafe-sheet-scraper',
    grade: 'publish',
    what: '시트 → 고객 글 발행 (+Sheet write)',
    workDirRoot: 'prod',
    envWorkDirRoot: 'prod',
    freshness: healthyProd,
    ...over,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. O1 사고 재현 — 이 테스트가 깨지면 재발 방지 장치가 무력화된 것이다
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('O1 사고 재현 — unao-ops 140 behind + sheet-scraper', () => {
  /** 사고 당시 상태: git으로 잘 추적되면서 140커밋 뒤처진 worktree */
  const staleOps: WorktreeFreshness = {
    root: 'ops',
    path: '/Users/yanadoo/Documents/unao-ops',
    exists: true,
    isGitRepo: true,      // ← 기존 ops-doctor는 이것만 보고 PASS를 냈다
    branch: 'ops/main',
    headSha: 'a486f029',
    dirtyCount: 0,        // ← dirty도 아니었다. 그래서 더 안 보였다
    hasUpstream: true,
    ahead: 0,
    behind: 140,
    divergedFromRemote: true,
    headAgeHours: 21 * 24,   // 2026-07-30 → 3주 전 (실측)
    syncIntervalHours: null, // unao-ops에는 자동 sync 장치가 없다
  }

  const o1 = input({
    workDirRoot: 'ops',
    envWorkDirRoot: 'ops',
    freshness: staleOps,
  })

  it('반드시 FATAL이다', () => {
    expect(judgeRunnerFreshness(o1).level).toBe('FATAL')
  })

  it('메시지에 active write runner · unao-ops · behind 140이 들어간다', () => {
    const v = judgeRunnerFreshness(o1)
    const full = `${v.message}\n${formatVerdictDetail(v)}`

    expect(full).toContain('active write runner')
    expect(full).toContain('unao-ops')
    expect(full).toContain('140')
    // 운영자가 무엇을 해야 하는지가 반드시 있어야 한다
    expect(v.detail.action).toBeTruthy()
  })

  it('"git 추적 중"은 더 이상 통과 근거가 아니다', () => {
    // isGitRepo=true 인데도 FATAL이어야 한다. 이것이 O1의 교훈이다.
    expect(o1.freshness.isGitRepo).toBe(true)
    expect(judgeRunnerFreshness(o1).level).toBe('FATAL')
  })

  it('dirty가 0이어도 behind만으로 잡힌다', () => {
    expect(o1.freshness.dirtyCount).toBe(0)
    expect(judgeRunnerFreshness(o1).code).toBe('ops_write_runner')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. FATAL 조건
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('FATAL — active write runner', () => {
  it('sync 유예(48h)를 넘겨 뒤처지면 FATAL — 커밋 수는 detail.gap에 남는다', () => {
    const v = judgeRunnerFreshness(input({
      // 100h 된 코드 = sync 24h × 유예 2배(48h)를 넘겼다 → sync가 고장난 상태
      freshness: { ...healthyProd, behind: 3, divergedFromRemote: true, headAgeHours: 100 },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('stale_write_runner')
    expect(v.detail.gap).toContain('3커밋')
    expect(v.message).toContain('sync')
  })

  it('sync 유예 안이면 WARN — 매일 FATAL이 울리면 guard가 무력해진다', () => {
    const v = judgeRunnerFreshness(input({
      // 5h 된 코드: merge 직후 ~ 다음 03:00 sync 사이의 정상 상태다
      freshness: { ...healthyProd, behind: 1, divergedFromRemote: true, headAgeHours: 5 },
    }))
    expect(v.level).toBe('WARN')
    expect(v.detail.action).toContain('sync')
    // publish 등급인데 'stale_readonly_runner'로 나오면 code 필터가 write runner를 놓친다
    expect(v.code).toBe('stale_write_within_grace')
  })

  it('sync 장치가 없는 worktree는 뒤처짐 자체가 FATAL — 스스로 회복하지 못한다', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'other',
      envWorkDirRoot: 'other',
      freshness: {
        ...healthyProd, root: 'other', path: '/tmp/no-sync',
        behind: 1, divergedFromRemote: true, headAgeHours: 1, syncIntervalHours: null,
      },
    }))
    expect(v.level).toBe('FATAL')
  })

  it('커밋 수를 못 세도(fetch 금지) 원격과 다르면 잡는다', () => {
    const v = judgeRunnerFreshness(input({
      // 실측 상황: ls-remote로 SHA는 알지만 원격 커밋 객체가 로컬에 없어 rev-list가 실패한다
      freshness: {
        ...healthyProd, behind: null, divergedFromRemote: true, headAgeHours: 200,
        reason: '원격 커밋이 로컬에 없어 개수 미상',
      },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.detail.gap).toContain('셀 수 없다')
  })

  it('dirty worktree면 FATAL', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...healthyProd, dirtyCount: 5 },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('dirty_write_runner')
  })

  it('개발 작업트리를 실행하면 FATAL', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'DEV',
      freshness: { ...healthyProd, root: 'DEV', path: '/Users/yanadoo/Documents/New_Claude_agenotmatter' },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('dev_write_runner')
  })

  it('WorkingDirectory와 UNAO_WORKDIR가 다르면 FATAL', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'prod',
      envWorkDirRoot: 'other',
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('workdir_mismatch')
  })

  it('기대 루트가 아니면 FATAL', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'other',
      envWorkDirRoot: 'other',
      freshness: { ...healthyProd, root: 'other', path: '/tmp/somewhere' },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('unexpected_root')
  })

  it('worktree 자체를 확인할 수 없으면 FATAL', () => {
    const v = judgeRunnerFreshness(input({
      freshness: unknownFreshness('/Users/yanadoo/Documents/unao-prod', 'prod', '디렉토리 없음'),
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('freshness_unknown')
    expect(v.detail.reason).toBe('디렉토리 없음')
  })

  it('behind가 null이어도 0으로 간주하지 않는다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...healthyProd, behind: null, divergedFromRemote: null, syncIntervalHours: null, reason: 'upstream 없음' },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.detail.behind).toBe('(unknown)')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 2b. remote unknown 정책 (P0-1B 후속 보정)
 *
 *   네트워크·인증 실패로 ls-remote가 안 되는 순간 운영 runner 15개가 전부
 *   FATAL이 됐다. 실제로는 아무 문제 없는 상태였다.
 *   매번 울리는 FATAL은 아무도 보지 않게 되어 결국 O1을 다시 놓치게 만든다.
 *   그래서 "스스로 회복 가능한가 + 코드가 충분히 젊은가"로 FATAL/WARN을 가른다.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('remote unknown — sync 유예로 FATAL/WARN을 가른다', () => {
  /** 원격만 못 봤을 뿐 나머지는 전부 정상인 상태 */
  const remoteUnknownProd: WorktreeFreshness = {
    ...healthyProd,
    divergedFromRemote: null,   // ls-remote 실패
    behind: null,
    ahead: null,
    reason: '원격 조회 실패(네트워크/인증)',
  }

  it('WARN — unao-prod · dirty 0 · sync 있음 · 나이 48h 이내', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...remoteUnknownProd, headAgeHours: 30, syncIntervalHours: 24 },
    }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('remote_unknown_within_grace')
    expect(v.detail.action).toContain('네트워크')
  })

  it('FATAL — 원격 미상 + sync 장치 없음 (스스로 회복하지 못한다)', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'other',
      envWorkDirRoot: 'other',
      freshness: {
        ...remoteUnknownProd, root: 'other', path: '/tmp/no-sync',
        headAgeHours: 1, syncIntervalHours: null,
      },
    }))
    expect(v.level).toBe('FATAL')
  })

  it('FATAL — 원격 미상 + sync 있으나 나이 48h 초과 (sync가 고장났다)', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...remoteUnknownProd, headAgeHours: 72, syncIntervalHours: 24 },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('freshness_unknown')
    expect(v.message).toContain('sync')
  })

  it('FATAL — 원격 미상 + 나이조차 모름', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...remoteUnknownProd, headAgeHours: null, syncIntervalHours: 24 },
    }))
    expect(v.level).toBe('FATAL')
  })

  it('FATAL — 원격 미상이어도 dirty면 dirty가 먼저 잡힌다', () => {
    // dirty 검사가 remote unknown 분기보다 앞서야 WARN에 삼켜지지 않는다
    const v = judgeRunnerFreshness(input({
      freshness: { ...remoteUnknownProd, dirtyCount: 2, headAgeHours: 10 },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('dirty_write_runner')
  })

  it('FATAL — 원격 미상이어도 unao-ops면 ops가 먼저 잡힌다 (O1 방어선)', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'ops',
      envWorkDirRoot: 'ops',
      freshness: { ...remoteUnknownProd, root: 'ops', path: '/Users/yanadoo/Documents/unao-ops', syncIntervalHours: null },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('ops_write_runner')
  })

  it('read-only runner는 원격 미상이어도 PASS — 검사 대상이 아니다', () => {
    const v = judgeRunnerFreshness(input({
      grade: 'read-only',
      freshness: remoteUnknownProd,
    }))
    expect(v.level).toBe('PASS')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. WARN 조건 — read-only는 뒤처져도 장애가 아니다
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('WARN — read-only / diagnostic runner', () => {
  it('read-only runner가 behind > 0 이면 WARN', () => {
    const v = judgeRunnerFreshness(input({
      name: 'com.unaeo.opsboard',
      grade: 'read-only',
      what: '운영 보드',
      freshness: { ...healthyProd, behind: 12, divergedFromRemote: true },
    }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('stale_readonly_runner')
  })

  it('dev-tool은 unao-ops를 봐도 FATAL이 아니다', () => {
    const v = judgeRunnerFreshness(input({
      name: 'com.unaoeo.figma-ws',
      grade: 'dev-tool',
      what: 'Figma WS',
      workDirRoot: 'ops',
      envWorkDirRoot: 'ops',
      freshness: { ...healthyProd, root: 'ops', behind: 140, divergedFromRemote: true, syncIntervalHours: null },
    }))
    expect(v.level).toBe('WARN')
  })

  it('fallback 래퍼는 값이 정상이면 WARN에 그친다', () => {
    const v = judgeRunnerFreshness(input({ usesFallbackWrapper: true }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('fallback_wrapper')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. PASS 조건 — 정상을 정상으로 판정해야 false positive가 없다
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('PASS — 정상 상태', () => {
  it('prod · behind 0 · dirty 0 이면 PASS', () => {
    const v = judgeRunnerFreshness(input())
    expect(v.level).toBe('PASS')
    expect(v.code).toBe('ok')
  })

  it('현재 운영 launchd 16개 전부 PASS여야 한다 (2026-08-20 실측 상태 재현)', () => {
    const operational = Object.entries(LAUNCHD_RUNNERS).filter(([, s]) => s.grade !== 'dev-tool')
    expect(operational.length).toBeGreaterThanOrEqual(16)

    for (const [label, spec] of operational) {
      const v = judgeRunnerFreshness({
        name: label,
        grade: spec.grade,
        what: spec.what,
        workDirRoot: 'prod',
        envWorkDirRoot: 'prod',
        freshness: healthyProd,
      })
      expect(v.level, `${label} 이 PASS가 아니다`).toBe('PASS')
    }
  })

  it('read-only runner는 dirty여도 FATAL이 아니다', () => {
    const v = judgeRunnerFreshness(input({
      grade: 'read-only',
      freshness: { ...healthyProd, dirtyCount: 3 },
    }))
    expect(v.level).toBe('PASS')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. 등급 분류 — §18-5 와 어긋나면 guard가 헛돈다
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * 4-B. 코드 리뷰 BLOCKER 재현 (2026-08-21)
 *
 * 아래 3건은 전부 **판정 함수 바깥**(수집·필터)에 있던 구멍이라
 * 기존 33개 테스트로는 원리적으로 잡히지 않았다.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('BLOCKER-2 재현 — ProgramArguments의 stale 경로', () => {
  it('workDir·env는 prod지만 ProgramArguments가 unao-ops면 FATAL', () => {
    const v = judgeRunnerFreshness(input({
      // plist 3곳 중 2곳은 완벽히 정상이다. 실행되는 스크립트만 구 경로다.
      workDirRoot: 'prod',
      envWorkDirRoot: 'prod',
      freshness: healthyProd,      // prod worktree는 clean·최신
      programArgRoots: ['ops'],
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('arg_path_write_runner')
    expect(v.message).toContain('ProgramArguments')
  })

  it('ProgramArguments가 DEV면 FATAL — 미커밋 코드가 실행된다', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'prod', envWorkDirRoot: 'prod',
      freshness: healthyProd,
      programArgRoots: ['DEV'],
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('dev_write_runner')
  })

  it('workDir이 ops면 arg가 아니라 ops_write_runner로 잡힌다 (원인별 조치가 다르다)', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'ops', envWorkDirRoot: 'ops',
      freshness: { ...healthyProd, root: 'ops', syncIntervalHours: null },
      programArgRoots: ['ops'],
    }))
    expect(v.code).toBe('ops_write_runner')
  })

  it('stdout/stderr만 구 경로면 WARN — 로그 목적지는 실행 코드가 아니다', () => {
    const v = judgeRunnerFreshness(input({ logRoots: ['ops'] }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('log_path_stale')
  })

  it('로그 경로 WARN이 실행 경로 FATAL을 가리지 않는다', () => {
    const v = judgeRunnerFreshness(input({
      programArgRoots: ['ops'],
      logRoots: ['ops'],
    }))
    expect(v.level).toBe('FATAL')
  })

  it('prod 로그 경로는 WARN이 아니다', () => {
    const v = judgeRunnerFreshness(input({ logRoots: ['prod', 'prod'] }))
    expect(v.level).toBe('PASS')
  })
})

describe('BLOCKER-3 재현 — dirtyCount가 null', () => {
  it('publish runner는 dirty 미상이면 PASS가 아니다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...healthyProd, dirtyCount: null },
    }))
    expect(v.level).not.toBe('PASS')
    expect(v.code).toBe('dirty_unknown_write_runner')
  })

  it('"모름"을 0으로 바꾸지 않는다 — 원격이 최신이어도 통과시키지 않는다', () => {
    const v = judgeRunnerFreshness(input({
      // behind 0 · diverged false = 원격 기준으로는 완벽하다. 그래도 PASS가 아니다.
      freshness: { ...healthyProd, dirtyCount: null, behind: 0, divergedFromRemote: false },
    }))
    expect(v.level).toBe('FATAL')
  })

  it('read-only runner는 dirty 미상이어도 FATAL이 아니다', () => {
    const v = judgeRunnerFreshness(input({
      grade: 'read-only',
      freshness: { ...healthyProd, dirtyCount: null },
    }))
    expect(v.level).not.toBe('FATAL')
  })
})

describe('등급 미상 정책 — allowlist 누락이 guard 무력화가 되면 안 된다', () => {
  it('등급표에 빠진 잡이 unao-ops를 가리키면 FATAL이다 (기본 등급 db-write)', () => {
    const v = judgeRunnerFreshness({
      name: 'com.unao.brand-new-publisher',
      grade: UNKNOWN_LAUNCHD_GRADE,
      what: '(등급 미상)',
      workDirRoot: 'ops',
      envWorkDirRoot: 'ops',
      freshness: { ...healthyProd, root: 'ops', behind: 140, divergedFromRemote: true, syncIntervalHours: null },
    })
    expect(v.level).toBe('FATAL')
  })

  it('기본 등급은 active write runner여야 한다 — read-only면 검사 자체를 건너뛴다', () => {
    expect(isActiveWriteRunner(UNKNOWN_LAUNCHD_GRADE)).toBe(true)
  })
})

describe('dev-tool 정책 — 개발 도구가 개발 워크트리를 쓰는 건 정상이다', () => {
  it('dev-tool이 DEV 워크트리를 실행해도 FATAL이 아니다 (상시 오탐 방지)', () => {
    const v = judgeRunnerFreshness(input({
      name: 'com.unaoeo.figma-use-mcp',
      grade: 'dev-tool',
      what: 'Figma MCP (개발 도구)',
      workDirRoot: 'DEV',
      envWorkDirRoot: 'DEV',
      freshness: { ...healthyProd, root: 'DEV' },
      programArgRoots: ['DEV'],
    }))
    expect(v.level).not.toBe('FATAL')
  })

  it('dev-tool이 아니면 DEV는 여전히 FATAL이다 — 면제는 dev-tool 한 등급뿐', () => {
    for (const grade of ['publish', 'db-write', 'ops-data', 'read-only', 'notification'] as const) {
      const v = judgeRunnerFreshness(input({ grade, freshness: { ...healthyProd, root: 'DEV' } }))
      expect(v.level, `${grade} 가 DEV에서 FATAL이 아니다`).toBe('FATAL')
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 4-C. P0-1C — sync 실행 흔적으로 stale을 판단한다
 *
 * headAgeHours는 "HEAD 커밋이 얼마나 오래됐는가"이지
 * "sync가 얼마나 밀렸는가"가 아니다. 둘은 다른 사실인데 하나로 판정했다.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** sync가 방금 정상 실행된 상태 — prod에만 존재한다 */
const syncHealthy: SyncEvidence = {
  logPath: '/Users/yanadoo/Documents/unao-prod/logs/unao-prod-sync.log',
  lastAttemptAgeHours: 7,
  lastOutcome: 'fast-forward',
}

describe('P0-1C — sync evidence가 headAgeHours보다 우선한다', () => {
  it('lastAttempt 7h · headAge 72h · stale → FATAL이 아니라 WARN', () => {
    // 주말 시나리오: 저장소가 조용하다 월요일 커밋이 나면 prod HEAD 나이가 이미 72h다.
    // 그런데 sync는 7시간 전에 정상 실행됐다. 여기서 FATAL을 내면 매주 월요일 오탐이고,
    // 매번 울리는 FATAL은 아무도 보지 않게 되어 결국 O1을 다시 놓친다.
    const v = judgeRunnerFreshness(input({
      freshness: {
        ...healthyProd,
        behind: 2, divergedFromRemote: true,
        headAgeHours: 72,          // ← 예전 기준이면 48h 초과라 FATAL이었다
        sync: syncHealthy,         // ← 실제 sync는 7시간 전에 돌았다
      },
    }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('stale_write_within_grace')
    expect(v.detail.graceBasis).toBe('sync 실행 흔적')
  })

  it('lastAttempt 51h → FATAL sync_not_running (유예 48h 초과)', () => {
    const v = judgeRunnerFreshness(input({
      freshness: {
        ...healthyProd,
        behind: 2, divergedFromRemote: true,
        headAgeHours: 2,           // ← 코드는 새것이다. 그래도 sync가 멈췄다
        sync: { ...syncHealthy, lastAttemptAgeHours: 51 },
      },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('sync_not_running')
    // 메시지가 "코드가 오래됐다"가 아니라 "sync가 안 돌았다"를 말해야 한다
    expect(v.message).toContain('마지막 sync 시도')
  })

  it('sync evidence가 null이면 기존 headAgeHours 폴백을 유지한다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: {
        ...healthyProd,
        behind: 2, divergedFromRemote: true,
        headAgeHours: 72, sync: null,
      },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('stale_write_runner')     // sync_not_running 이 아니다
    expect(v.detail.graceBasis).toContain('HEAD 커밋 나이')
  })

  it('sync 로그를 못 읽어 시각이 null이면 폴백하고 이유를 남긴다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: {
        ...healthyProd,
        behind: 1, divergedFromRemote: true, headAgeHours: 5,
        sync: { logPath: '/x/log', lastAttemptAgeHours: null, lastOutcome: null, reason: 'sync 로그 없음' },
      },
    }))
    expect(v.level).toBe('WARN')                  // headAge 5h → 유예 안
    expect(v.detail.syncReason).toBe('sync 로그 없음')
  })

  it('outcome unknown이면 WARN — 유예 안이어도 다음 회차가 위험하다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: {
        ...healthyProd,
        behind: 1, divergedFromRemote: true, headAgeHours: 5,
        sync: { ...syncHealthy, lastOutcome: 'unknown' },
      },
    }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('sync_outcome_unknown')
  })

  it('sync가 정상이어도 dirty가 우선한다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...healthyProd, dirtyCount: 3, sync: syncHealthy },
    }))
    expect(v.code).toBe('dirty_write_runner')
  })

  it('sync가 정상이어도 unao-ops 참조가 우선한다 (O1 방어선)', () => {
    const v = judgeRunnerFreshness(input({
      workDirRoot: 'ops', envWorkDirRoot: 'ops',
      freshness: { ...healthyProd, root: 'ops', sync: syncHealthy, syncIntervalHours: null },
    }))
    expect(v.code).toBe('ops_write_runner')
  })

  it('sync가 정상이어도 DEV 참조가 우선한다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: { ...healthyProd, root: 'DEV', sync: syncHealthy },
    }))
    expect(v.code).toBe('dev_write_runner')
  })

  it('sync 장치가 없는 경로는 evidence와 무관하게 뒤처짐 자체가 FATAL이다', () => {
    // unao-ops가 이 경우다. syncIntervalHours가 null이면 유예 개념이 성립하지 않는다.
    const v = judgeRunnerFreshness(input({
      freshness: {
        ...healthyProd, root: 'prod',
        behind: 140, divergedFromRemote: true,
        syncIntervalHours: null, headAgeHours: 2, sync: null,
      },
    }))
    expect(v.level).toBe('FATAL')
    expect(v.code).toBe('stale_write_runner')
  })

  it('원격 미상 분기도 같은 기준을 쓴다 — 한쪽만 고치면 오탐이 남는다', () => {
    const v = judgeRunnerFreshness(input({
      freshness: {
        ...healthyProd,
        divergedFromRemote: null,   // 원격 조회 실패
        headAgeHours: 72,           // 예전 기준이면 FATAL
        sync: syncHealthy,          // 실제 sync는 7시간 전
      },
    }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('remote_unknown_within_grace')
  })

  it('read-only runner는 sync evidence와 무관하게 FATAL이 아니다', () => {
    const v = judgeRunnerFreshness(input({
      grade: 'read-only',
      freshness: {
        ...healthyProd, behind: 5, divergedFromRemote: true,
        sync: { ...syncHealthy, lastAttemptAgeHours: 200 },
      },
    }))
    expect(v.level).toBe('WARN')
    expect(v.code).toBe('stale_readonly_runner')
  })
})

describe('parseSyncLogTail — 마지막 회차 결과만 읽는다', () => {
  const M = SYNC_LOG_MARKER

  it('Already up to date', () => {
    expect(parseSyncLogTail(`${M} · workdir=/x (UNAO_WORKDIR)\nAlready up to date.\n`)).toBe('up-to-date')
  })

  it('Fast-forward', () => {
    expect(parseSyncLogTail(
      `${M} · workdir=/x (UNAO_WORKDIR)\nUpdating 019b47e5..c1a74f24\nFast-forward\n docs/x.md | 396 +++\n`,
    )).toBe('fast-forward')
  })

  it('마커만 있고 결과가 없으면 unknown — 실행 중 죽었다', () => {
    // launchd-wrapper.mjs는 workdir 경로가 없으면 마커를 찍은 뒤 exit한다
    expect(parseSyncLogTail(`${M} · workdir=/x (UNAO_WORKDIR)\n`)).toBe('unknown')
  })

  it('마커가 없으면 null — 이 로그로는 아무것도 말할 수 없다', () => {
    expect(parseSyncLogTail('그냥 아무 텍스트\nFast-forward\n')).toBeNull()
  })

  it('빈 문자열은 null', () => {
    expect(parseSyncLogTail('')).toBeNull()
  })

  it('직전 회차 결과를 끌어오지 않는다 — 마지막 마커 이후만 본다', () => {
    // 이전 회차는 성공했지만 마지막 회차는 도중에 죽은 경우.
    // lastIndexOf를 쓰지 않으면 'fast-forward'로 잘못 읽는다.
    const tail =
      `${M} · workdir=/x (UNAO_WORKDIR)\nUpdating a..b\nFast-forward\n` +
      `${M} · workdir=/x (UNAO_WORKDIR)\n`
    expect(parseSyncLogTail(tail)).toBe('unknown')
  })

  it('tail이 회차 중간에서 잘려도 마지막 마커 기준으로 판정한다', () => {
    const tail = ` file.ts | 12 ++--\n${M} · workdir=/x (UNAO_WORKDIR)\nAlready up to date.\n`
    expect(parseSyncLogTail(tail)).toBe('up-to-date')
  })
})

describe('write 등급 분류', () => {
  it('publish · db-write · sheet-write · external-api · ops-data 는 active write runner다', () => {
    for (const g of ['publish', 'db-write', 'sheet-write', 'external-api', 'ops-data'] as const) {
      expect(isActiveWriteRunner(g), g).toBe(true)
    }
  })

  it('notification · read-only · dev-tool 은 active write runner가 아니다', () => {
    for (const g of ['notification', 'read-only', 'dev-tool'] as const) {
      expect(isActiveWriteRunner(g), g).toBe(false)
    }
  })

  it('사고 당사자 sheet-scraper는 publish 등급이다', () => {
    expect(launchdGrade('com.unao.naver-cafe-sheet-scraper')?.grade).toBe('publish')
  })

  it('cafe-crawler 10종이 전부 등급표에 있다', () => {
    const crawlers = Object.keys(LAUNCHD_RUNNERS).filter((k) => k.includes('cafe-crawler'))
    expect(crawlers).toHaveLength(10)
    for (const c of crawlers) expect(launchdGrade(c)?.grade).toBe('db-write')
  })

  it('등급표에 없는 label은 null을 돌려준다 (호출부가 WARN 처리한다)', () => {
    expect(launchdGrade('com.unao.does-not-exist')).toBeNull()
  })

  it('기대 실행 루트는 prod다 — 자동 sync 대상이 여기뿐이기 때문', () => {
    expect(EXPECTED_LAUNCHD_ROOT).toBe('prod')
  })
})
