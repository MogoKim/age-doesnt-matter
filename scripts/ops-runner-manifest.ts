/**
 * 운영 runner 등급 SSoT — 순수 상수 + 순수 판정 함수 (IO 없음, vitest 직접 로드 가능)
 *
 * 왜 필요한가 (O1 사고, 2026-08-20 이전):
 *   unao-ops가 origin/main보다 140커밋 뒤처진 상태에서
 *   launchd `naver-cafe-sheet-scraper`(= 고객 글 발행)가 그 경로를 실행했다.
 *   그런데 ops-doctor는 PASS를 냈다. 이유는 판정 기준이
 *   **"git으로 추적되는가"** 였기 때문이다.
 *   추적 여부와 코드 신선도는 아무 상관이 없다. 잘 추적되면서 3주 뒤처질 수 있다.
 *
 *   그래서 기준을 바꾼다:
 *     기존  "git repo인가"
 *     변경  "active write runner가 최신 정본 코드에 도달했는가"
 *
 * 이 파일이 IO를 하지 않는 이유:
 *   O1 사고를 fixture로 재현해야 하는데, 실제 launchd/worktree를 그 상태로 되돌릴 수는 없다.
 *   판정 로직이 순수하면 fixture 입력만으로 회귀를 고정할 수 있다.
 *   실제 값 수집(git·plist 조회)은 ops-doctor.ts가 담당한다.
 *
 * 근거 문서: docs/operations/m3-new-brand-readiness.md §18 (OPS-RUNNER-1)
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. write 등급
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * runner가 무엇을 바꾸는가.
 * active write runner 판정의 근거가 되므로 등급을 임의로 낮추지 않는다.
 */
export type WriteGrade =
  | 'publish'       // 고객 화면에 노출되는 글/댓글/콘텐츠 생성 · 발행 상태 변경
  | 'db-write'      // DB write (봇 댓글 · 크롤 결과 저장 등)
  | 'sheet-write'   // Google Sheet write
  | 'external-api'  // 외부 플랫폼 write (X · Threads · Instagram · Facebook · Ads)
  | 'ops-data'      // 운영 데이터 변경 (쿠키 · 동기화 · 스케줄 상태)
  | 'notification'  // 알림 발송만
  | 'read-only'     // 조회·진단만
  | 'dev-tool'      // 개발 도구. 운영 경로가 아니다

const ACTIVE_WRITE_GRADES: ReadonlySet<WriteGrade> = new Set<WriteGrade>([
  'publish',
  'db-write',
  'sheet-write',
  'external-api',
  'ops-data',
])

/**
 * active write runner인가 — stale 코드로 돌면 고객/운영에 실제 피해가 가는 등급.
 * notification·read-only·dev-tool은 뒤처져도 WARN에 그친다.
 */
export function isActiveWriteRunner(grade: WriteGrade): boolean {
  return ACTIVE_WRITE_GRADES.has(grade)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. 실행 루트
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 경로가 속한 실행 루트 라벨. ops-doctor는 아래 `pathRoot()` 하나만 쓴다. */
export type RunnerRoot = 'prod' | 'ops' | 'DEV' | 'main' | 'other' | '-'

/** 루트 디렉터리 실경로 — ops-doctor가 homedir 기준으로 채워 넘긴다 */
export interface RootDirs {
  prod: string
  ops: string
  DEV: string
  main: string
}

/**
 * 경로가 루트 안에 있는가.
 *
 * ⚠️ `startsWith(root)` 단독은 틀린다. `/Users/x/Documents/unao-prod-backup`이
 *    `unao-prod`로 분류돼 **자동 sync 대상(유예 48h)이라는 특권을 얻는다.**
 *    sync 장치가 없는 디렉터리가 유예를 받으면 stale이 FATAL 대신 WARN이 되고,
 *    그건 O1이 통과했던 완화 경로와 같은 성격이다. 경계를 명시적으로 본다.
 */
export function pathInRoot(dir: string, root: string): boolean {
  return dir === root || dir.startsWith(root.endsWith('/') ? root : `${root}/`)
}

/**
 * 경로 → 실행 루트. null/빈 문자열은 `'-'`(미지정)다.
 * ops-doctor의 rootOf()·rootOfDir() 두 갈래를 하나로 합친 것 —
 * 둘이 서로 다른 어휘를 쓰면서 `as RunnerRoot` 캐스트로 가려져 있었다.
 */
export function pathRoot(path: string | null | undefined, dirs: RootDirs): RunnerRoot {
  if (!path) return '-'
  if (pathInRoot(path, dirs.prod)) return 'prod'
  if (pathInRoot(path, dirs.ops)) return 'ops'
  if (pathInRoot(path, dirs.DEV)) return 'DEV'
  if (pathInRoot(path, dirs.main)) return 'main'
  return 'other'
}

/**
 * 운영 launchd가 실행해야 하는 유일한 루트.
 * unao-prod만이 03:00 `unao-prod-sync`로 자동 동기화된다(§18-4).
 * 다른 루트는 sync 장치가 없으므로 시간이 갈수록 반드시 뒤처진다.
 */
export const EXPECTED_LAUNCHD_ROOT: RunnerRoot = 'prod'

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. launchd runner 등급표 (§18-4 실측 기준)
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface RunnerSpec {
  grade: WriteGrade
  /** 사람이 읽을 설명 — FATAL 메시지에 그대로 실린다 */
  what: string
}

/**
 * launchd label → 등급.
 *
 * ⚠️ 여기 없는 label은 `UNKNOWN_LAUNCHD_GRADE`로 처리된다(등급 미상 = 보수적으로 WARN).
 *    새 잡을 추가하면 이 표에도 넣어야 한다. 넣지 않으면 freshness 검사에서 빠진다.
 */
export const LAUNCHD_RUNNERS: Readonly<Record<string, RunnerSpec>> = {
  // ── 카페 크롤러 10종 — CafePost DB write ──
  'com.unao.cafe-crawler-dawn': { grade: 'db-write', what: '카페 크롤 → DB 저장' },
  'com.unao.cafe-crawler-morning': { grade: 'db-write', what: '카페 크롤 → DB 저장' },
  'com.unao.cafe-crawler-lunch': { grade: 'db-write', what: '카페 크롤 → DB 저장' },
  'com.unao.cafe-crawler-afternoon': { grade: 'db-write', what: '카페 크롤 → DB 저장' },
  'com.unao.cafe-crawler-evening': { grade: 'db-write', what: '카페 크롤 → DB 저장' },
  'com.unao.cafe-crawler-09h30': { grade: 'db-write', what: '카페 크롤 → DB 저장' },
  'com.unao.cafe-crawler-17h30': { grade: 'db-write', what: '카페 크롤 → DB 저장' },
  'com.unao.cafe-crawler-popular-morning': { grade: 'db-write', what: '인기글 크롤 → DB 저장' },
  'com.unao.cafe-crawler-popular-afternoon': { grade: 'db-write', what: '인기글 크롤 → DB 저장' },
  'com.unao.cafe-crawler-popular-evening': { grade: 'db-write', what: '인기글 크롤 → DB 저장' },

  // ── 고객 발행 ── O1 사고 당사자가 여기 있다
  'com.unao.naver-cafe-sheet-scraper': { grade: 'publish', what: '시트 → 고객 글 발행 (+Sheet write)' },
  'com.unaeo.magazine-morning': { grade: 'publish', what: '매거진 생성 → 고객 발행' },
  'com.unaeo.magazine-late': { grade: 'publish', what: '매거진 생성 → 고객 발행' },

  // ── 운영 데이터 ──
  'com.unaeo.session-refresh': { grade: 'ops-data', what: '네이버 세션 쿠키 갱신' },
  'com.unao.unao-prod-sync': { grade: 'ops-data', what: '운영 clone 자동 동기화 (03:00)' },

  // ── 진단·개발 ──
  'com.unaeo.opsboard': { grade: 'read-only', what: '운영 보드 (조회 전용)' },
  'com.unaoeo.figma-use-mcp': { grade: 'dev-tool', what: 'Figma MCP (개발 도구)' },
  'com.unaoeo.figma-ws': { grade: 'dev-tool', what: 'Figma WS (개발 도구)' },
}

/**
 * 등급표에 없는 launchd label의 기본 등급.
 *
 * 🔴 예전 값은 `'read-only'`였다. 그건 틀렸다.
 *    read-only는 `isActiveWriteRunner()`가 false라, 등급표에서 빠진 잡이
 *    unao-ops를 가리켜도 WARN에서 끝났다. 즉 **allowlist 누락이 곧 guard 무력화**였고,
 *    이건 O1(확인되지 않은 것을 안전으로 간주)과 같은 실패 구조다.
 *
 *    모르는 잡은 "쓰기를 한다"고 가정한다. 오탐은 등급표에 한 줄 추가하면 사라지지만,
 *    미탐은 고객 화면에 구 코드가 나간 뒤에야 발견된다. 비용이 대칭이 아니다.
 */
export const UNKNOWN_LAUNCHD_GRADE: WriteGrade = 'db-write'

export function launchdGrade(label: string): RunnerSpec | null {
  return LAUNCHD_RUNNERS[label] ?? null
}

/**
 * 개발 도구인가 — 운영 경로가 아니므로 개발 워크트리를 실행하는 게 **정상**이다.
 * 이 등급만 `dev_write_runner` FATAL에서 면제된다(뒤처짐 WARN은 그대로 받는다).
 */
export function isDevToolRunner(grade: WriteGrade): boolean {
  return grade === 'dev-tool'
}

/**
 * 운영 launchd label prefix.
 *
 * 🔴 예전 ops-doctor는 `f.startsWith('com.unao.')` 하나로 걸렀다.
 *    그런데 실제 label은 세 갈래다 — `com.unao.` / `com.unaeo.` / `com.unaoeo.`.
 *    `com.unaeo.`(un**ae**o)는 `com.unao.` 뒤에 리터럴 점을 요구하는 조건에 걸려
 *    **magazine-morning·magazine-late(둘 다 publish 등급)와 session-refresh가
 *    검사 대상에서 통째로 빠졌다.** 등급표에는 있으니 검사되는 것처럼 보였다.
 */
export const OPERATIONAL_LABEL_PREFIXES: readonly string[] = [
  'com.unao.',
  'com.unaeo.',
  'com.unaoeo.',
]

/** plist 파일명 → launchd label (`.plist` 확장자만 떼면 된다) */
export function launchdLabelFromFile(file: string): string {
  return file.replace(/\.plist$/, '')
}

/**
 * 이 plist 파일을 freshness 검사 대상으로 삼는가.
 *
 * 판정 순서가 중요하다:
 *   1. `.plist`로 끝나지 않으면 launchd가 로드하지 않는다 → 제외
 *      (`...plist.bak-20260820` 같은 백업본이 여기서 걸러진다)
 *   2. 등급표에 있으면 **무조건 포함** — prefix 규칙이 바뀌어도 등급표가 이긴다
 *   3. 등급표에 없어도 운영 prefix면 포함 — 새 잡이 조용히 새는 것을 막는다
 */
export function isMonitoredLaunchdFile(file: string): boolean {
  if (!file.endsWith('.plist')) return false
  const label = launchdLabelFromFile(file)
  if (label in LAUNCHD_RUNNERS) return true
  return OPERATIONAL_LABEL_PREFIXES.some((p) => label.startsWith(p))
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. GHA runner 등급표 (§18-3 실측 기준)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ GHA는 worktree freshness 검사 대상이 **아니다**.
 *    GitHub Actions는 매 실행마다 checkout하므로 구조적으로 stale이 생기지 않는다.
 *    이 표는 등급 분류를 한곳에 모아두기 위한 기록물이다(§18 문서와 동기).
 */
export const GHA_RUNNERS: Readonly<Record<string, RunnerSpec>> = {
  'agents-scraper.yml': { grade: 'publish', what: '시트 스크래핑 → 고객 발행' },
  'agents-scraper-dawn.yml': { grade: 'publish', what: '새벽 스크래핑 → 고객 발행' },
  'agents-cafe-hourly-curation.yml': { grade: 'publish', what: '큐레이션 → 고객 발행' },
  'agents-cafe-popular-curation.yml': { grade: 'publish', what: '인기 큐레이션 → 고객 발행' },
  'agents-killer-post.yml': { grade: 'publish', what: '화제글 생성 → 고객 발행' },
  'agents-cafe-wave.yml': { grade: 'db-write', what: '봇 댓글 wave' },
  'agents-sheet-viral.yml': { grade: 'db-write', what: '봇 댓글 wave' },
  'agents-seed.yml': { grade: 'db-write', what: '시드봇 글·댓글' },
  'agents-seed-micro.yml': { grade: 'db-write', what: '시드봇 마이크로' },
  'agents-daily.yml': { grade: 'db-write', what: '일일 에이전트 (발행·봇댓글 포함 17 task)' },
  'agents-jobs.yml': { grade: 'db-write', what: '일자리 스크랩' },
  'agents-moderation.yml': { grade: 'db-write', what: '모더레이션' },
  'admin-kpi-snapshot.yml': { grade: 'db-write', what: 'KPI 스냅샷 저장' },
  'agents-social.yml': { grade: 'external-api', what: 'SNS 발행 (X·Threads·IG·FB·Ads)' },
  'agents-cafe.yml': { grade: 'notification', what: '브리핑 알림' },
  'agents-hourly.yml': { grade: 'notification', what: '헬스체크 알림' },
  'push-scheduled.yml': { grade: 'notification', what: '예약 푸시 발송' },
  'ci.yml': { grade: 'read-only', what: 'CI 가드 5종' },
  'lighthouse.yml': { grade: 'read-only', what: 'Lighthouse' },
  'post-deploy-qa.yml': { grade: 'read-only', what: '배포 후 QA' },
  'ops-daily-report.yml': { grade: 'read-only', what: '일일 리포트' },
  'prewarm-detail-pages.yml': { grade: 'read-only', what: '상세 페이지 프리웜' },
  'quarantine-check.yml': { grade: 'read-only', what: '격리 점검' },
  'agents-design.yml': { grade: 'read-only', what: '디자인 에이전트 (인자 미확정)' },
  'agents-weekly.yml': { grade: 'read-only', what: '주간 에이전트 (인자 미확정)' },
  'run-script.yml': { grade: 'read-only', what: '임의 스크립트 (dispatch 전용 · 권한 범위 미확인)' },
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. worktree freshness — 수집 결과 형태
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * worktree 한 곳의 신선도. ops-doctor가 git 조회로 채우고, 아래 판정 함수가 소비한다.
 *
 * ⚠️ `behind`는 **null일 수 있다**. 다음 두 경우가 다르다는 점이 중요하다:
 *    - behind === 0    : 최신임이 확인됐다
 *    - behind === null : 판정하지 못했다 (원격 조회 실패 · upstream 없음 등)
 *    active write runner에서 후자는 PASS가 아니다. 모르면 통과시키지 않는다.
 */
export interface WorktreeFreshness {
  root: RunnerRoot
  path: string
  exists: boolean
  isGitRepo: boolean
  branch: string | null
  headSha: string | null
  dirtyCount: number | null
  hasUpstream: boolean
  ahead: number | null
  behind: number | null
  /**
   * HEAD가 실제 원격 main과 **다른가** (SHA 직접 비교).
   *
   * ⚠️ `behind`와 별개로 필요하다. `git fetch` 없이는 원격 커밋 객체가 로컬에 없어
   *    `rev-list --count`가 실패한다(실측: fatal: Invalid revision range).
   *    그래서 "몇 커밋 뒤인지"는 몰라도 "다르다"는 확실히 알 수 있다.
   *    이 둘을 뭉뚱그리면 "모름"과 "뒤처짐"이 섞여 판정이 무너진다.
   */
  divergedFromRemote: boolean | null
  /** HEAD 커밋 이후 경과 시간(h). "몇 커밋"보다 "며칠 된 코드인가"가 운영 관점에서 정확하다 */
  headAgeHours: number | null
  /**
   * 이 worktree에 자동 동기화 장치가 있는가.
   * unao-prod만 03:00 `unao-prod-sync`가 돈다(§18-4). 나머지는 방치하면 영원히 뒤처진다.
   */
  syncIntervalHours: number | null
  /** 판정 근거를 못 구한 이유 — 메시지에 그대로 싣는다 */
  reason?: string
}

/** 아직 조사하지 않은 worktree — 판정 함수가 "모른다"를 구분할 수 있게 한다 */
export function unknownFreshness(path: string, root: RunnerRoot, reason: string): WorktreeFreshness {
  return {
    root, path, exists: false, isGitRepo: false, branch: null, headSha: null,
    dirtyCount: null, hasUpstream: false, ahead: null, behind: null,
    divergedFromRemote: null, headAgeHours: null, syncIntervalHours: null, reason,
  }
}

/** unao-prod-sync 주기 — 03:00 daily (§18-4) */
export const PROD_SYNC_INTERVAL_HOURS = 24

/**
 * sync 유예 배수.
 *
 * sync가 하루 1회이므로 최대 24h까지는 정상적으로 뒤처져 있을 수 있다.
 * 2배(48h)를 넘었다면 그건 "sync 대기 중"이 아니라 **sync가 고장난 것**이다.
 * 이 여유가 없으면 merge 직후부터 다음 03:00까지 매일 FATAL이 뜨고,
 * 그러면 아무도 FATAL을 보지 않게 되어 guard가 무력해진다.
 */
export const SYNC_GRACE_MULTIPLIER = 2

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. 판정 (순수 — 이 함수가 O1 회귀 테스트의 대상이다)
 * ═══════════════════════════════════════════════════════════════════════════ */

export type Verdict = 'PASS' | 'WARN' | 'FATAL'

/** 판정 사유 코드 — 테스트가 문자열 대신 이 코드로 단언한다 */
export type VerdictCode =
  | 'ok'
  | 'stale_write_runner'        // FATAL: active write runner가 behind > 0
  | 'dirty_write_runner'        // FATAL: active write runner가 dirty worktree
  | 'ops_write_runner'          // FATAL: active write runner가 unao-ops 참조
  | 'dev_write_runner'          // FATAL: active write runner가 개발 작업트리 참조
  | 'workdir_mismatch'          // FATAL: WorkingDirectory ≠ UNAO_WORKDIR
  | 'unexpected_root'           // FATAL: 기대 루트가 아님
  | 'freshness_unknown'         // FATAL: active write runner인데 신선도 판정 불가
  | 'dirty_unknown_write_runner' // FATAL: active write runner인데 dirty 여부조차 모름
  | 'arg_path_write_runner'     // FATAL: ProgramArguments의 실행 스크립트가 ops/DEV
  | 'remote_unknown_within_grace' // WARN: 원격 조회만 실패 — sync 있고 유예 안
  | 'stale_readonly_runner'     // WARN: 비-active runner가 behind > 0
  | 'stale_write_within_grace'  // WARN: active write runner가 뒤처졌으나 sync 유예 안
  | 'log_path_stale'            // WARN: stdout/stderr가 구 워크스페이스를 가리킨다
  | 'grade_unknown'             // WARN: 등급표에 없는 runner
  | 'fallback_wrapper'          // WARN: UNAO_WORKDIR 미설정 시 fallback 위험

export interface RunnerVerdict {
  level: Verdict
  code: VerdictCode
  /** 운영자가 바로 이해할 수 있는 한 줄 */
  message: string
  /** key=value 상세 — 요약 아래에 그대로 출력한다 */
  detail: Record<string, string>
}

export interface RunnerCheckInput {
  /** launchd label 또는 workflow 파일명 */
  name: string
  grade: WriteGrade
  what: string
  /** plist WorkingDirectory가 속한 루트 */
  workDirRoot: RunnerRoot
  /** plist EnvironmentVariables.UNAO_WORKDIR가 속한 루트 */
  envWorkDirRoot: RunnerRoot
  /** 실제로 실행되는 worktree의 신선도 */
  freshness: WorktreeFreshness
  /**
   * ProgramArguments 안의 **실행 스크립트 경로**가 속한 루트들.
   *
   * 🔴 이게 빠져서 미탐이 났다. WorkingDirectory·UNAO_WORKDIR이 둘 다 prod여도
   *    `ProgramArguments = [/bin/bash, ~/Documents/unao-ops/scripts/scrape.sh]`이면
   *    **실제로 도는 코드는 unao-ops다.** 예전 ops-doctor는 allRoots로 이걸 봤는데,
   *    freshness guard로 옮기면서 execDir(= env ?? workDir) 2개만 넘겨 탐지면이 좁아졌다.
   */
  programArgRoots?: readonly RunnerRoot[]
  /**
   * StandardOutPath·StandardErrorPath가 속한 루트들.
   * 실행 코드가 아니라 **로그 목적지**이므로 FATAL이 아니라 WARN이다.
   * 다만 구 워크스페이스를 가리키면 plist가 옛 경로에서 복사됐다는 신호라 흘리지 않는다.
   */
  logRoots?: readonly RunnerRoot[]
  /** 기대 루트 (기본 prod) */
  expectedRoot?: RunnerRoot
  /** launchd-alert.sh 처럼 UNAO_WORKDIR 미설정 시 fallback하는 래퍼를 쓰는가 */
  usesFallbackWrapper?: boolean
}

/**
 * runner 하나의 freshness를 판정한다.
 *
 * 설계 원칙 — **모르면 PASS시키지 않는다.**
 *   O1 사고는 "확인되지 않은 것을 PASS로 처리"해서 생겼다.
 *   그래서 판정 불가는 절대 PASS가 아니다. 다만 FATAL과 WARN은 구분한다:
 *     스스로 회복 가능(sync_source)하고 코드가 유예 안이면  → WARN
 *     그렇지 않으면                                        → FATAL
 *   네트워크 실패 한 번으로 운영 runner 15개가 전부 FATAL이 되면
 *   아무도 FATAL을 보지 않게 되어 결국 O1을 다시 놓친다.
 */
export function judgeRunnerFreshness(i: RunnerCheckInput): RunnerVerdict {
  const expected = i.expectedRoot ?? EXPECTED_LAUNCHD_ROOT
  const active = isActiveWriteRunner(i.grade)
  const f = i.freshness

  const detail: Record<string, string> = {
    runner: i.name,
    grade: i.grade,
    active: String(active),
    worktree: f.path,
    branch: f.branch ?? '(unknown)',
    head: f.headSha ?? '(unknown)',
    behind: f.behind === null ? '(unknown)' : String(f.behind),
    dirty: f.dirtyCount === null ? '(unknown)' : String(f.dirtyCount),
    expected: expected,
  }
  if (f.reason) detail.reason = f.reason

  // 실제로 코드가 도는 경로들 — plist 3곳(WorkingDirectory·UNAO_WORKDIR·ProgramArguments)과
  // 수집된 worktree의 루트를 한 묶음으로 본다. 어느 하나라도 구 경로면 구 코드가 돈다.
  const argRoots = i.programArgRoots ?? []
  const execRoots: RunnerRoot[] = [i.workDirRoot, i.envWorkDirRoot, f.root, ...argRoots]
  const logRoots = i.logRoots ?? []
  if (argRoots.length > 0) detail.argRoots = [...new Set(argRoots)].join(',')
  if (logRoots.length > 0) detail.logRoots = [...new Set(logRoots)].join(',')

  // ── (1) 개발 작업트리 ──
  //     미커밋 코드가 그대로 돈다. ProgramArguments의 스크립트 경로까지 본다.
  //     ⚠️ dev-tool만 면제한다. Figma MCP 같은 개발 도구가 개발 워크트리를 실행하는 건
  //        정상이다. 여기서 FATAL을 내면 상시 오탐이 되고, 매일 울리는 FATAL은
  //        아무도 보지 않게 되어 결국 진짜 O1을 놓친다(이 파일 §7 주석과 같은 이유).
  //        면제는 이 FATAL 한 줄뿐 — 뒤처짐 WARN은 dev-tool도 그대로 받는다.
  if (!isDevToolRunner(i.grade) && execRoots.includes('DEV')) {
    return {
      level: 'FATAL', code: 'dev_write_runner',
      message: `${i.name}: 개발 작업트리를 실행한다 — 미커밋 코드가 운영에 나간다`,
      detail: { ...detail, action: `WorkingDirectory·UNAO_WORKDIR·ProgramArguments를 ${expected} 경로로 변경 후 launchctl reload` },
    }
  }

  // ── (2) WorkingDirectory ↔ UNAO_WORKDIR 불일치 ──
  //    둘이 다르면 어느 쪽 코드가 도는지 plist만 봐서는 알 수 없다.
  if (active && i.workDirRoot !== '-' && i.envWorkDirRoot !== '-' && i.workDirRoot !== i.envWorkDirRoot) {
    return {
      level: 'FATAL', code: 'workdir_mismatch',
      message: `${i.name}: WorkingDirectory(${i.workDirRoot}) ≠ UNAO_WORKDIR(${i.envWorkDirRoot}) — 실행 경로가 모호하다`,
      detail: { ...detail, workDir: i.workDirRoot, envWorkDir: i.envWorkDirRoot, action: '두 값을 같은 경로로 통일 후 launchctl reload' },
    }
  }

  // ── (3) active write runner가 unao-ops 참조 ── 🔴 O1 사고 조건
  //    기존 코드는 여기서 "git 추적 중이면 PASS"를 냈다. 그게 사고를 통과시켰다.
  if (active && execRoots.includes('ops')) {
    const behindLabel = f.behind === null ? '판정 불가' : `${f.behind}`
    // ProgramArguments만 ops인 경우는 원인이 다르다 — 조치 문구도 달라야 한다
    const viaArgsOnly =
      argRoots.includes('ops') &&
      i.workDirRoot !== 'ops' && i.envWorkDirRoot !== 'ops' && f.root !== 'ops'
    if (viaArgsOnly) {
      return {
        level: 'FATAL', code: 'arg_path_write_runner',
        message: `${i.name}: WorkingDirectory는 ${i.workDirRoot}지만 ProgramArguments가 unao-ops 스크립트를 실행한다 — 도는 코드는 unao-ops다`,
        detail: { ...detail, what: i.what, action: `ProgramArguments의 스크립트 경로를 ${expected}로 바꾼다` },
      }
    }
    return {
      level: 'FATAL', code: 'ops_write_runner',
      message: `${i.name}: active write runner가 unao-ops(stale worktree)를 실행한다 — behind ${behindLabel}`,
      detail: { ...detail, what: i.what, action: `runner를 정지하거나 ${expected}(자동 sync 대상) 경로로 재지정` },
    }
  }

  // ── (4) 기대 루트가 아님 ──
  if (active && f.root !== expected && f.root !== '-') {
    return {
      level: 'FATAL', code: 'unexpected_root',
      message: `${i.name}: active write runner가 기대 루트(${expected})가 아닌 ${f.root}를 실행한다`,
      detail: { ...detail, action: `${expected} 경로로 재지정` },
    }
  }

  // ── (5) worktree 자체가 없거나 git이 아님 ── 무엇이 도는지 알 방법이 없다
  if (active && (!f.exists || !f.isGitRepo)) {
    return {
      level: 'FATAL', code: 'freshness_unknown',
      message: `${i.name}: active write runner의 worktree를 확인할 수 없다 (존재=${f.exists} · git=${f.isGitRepo})`,
      detail: { ...detail, action: 'worktree 존재와 git 추적을 확인한다. 확인 전까지 최신이라고 가정하지 않는다' },
    }
  }

  // ── (6) dirty ── 미커밋 코드가 고객에게 나간다
  //     ⚠️ (7)보다 먼저 본다. dirty는 원격 조회 성공 여부와 무관하게 FATAL이어야 하는데,
  //        (7)의 grace 경로가 먼저 걸리면 dirty가 WARN에 삼켜진다.
  //     ⚠️ null(모름)을 0(깨끗함)으로 바꾸지 않는다. 수집부는 `git status` 실패를
  //        null로 정확히 남기는데, 판정부가 `?? 0`으로 덮으면 그 순간 "모름"이 "안전"이 된다.
  //        `git status`가 실패하는 상황(인덱스 lock·권한·손상)은 오히려 worktree에
  //        이상이 있을 때 생긴다. 그 순간 PASS가 나오면 안 된다.
  if (active) {
    if (f.dirtyCount === null) {
      return {
        level: 'FATAL', code: 'dirty_unknown_write_runner',
        message: `${i.name}: active write runner의 미커밋 여부를 확인할 수 없다 — git status 실패`,
        detail: { ...detail, action: 'worktree에서 git status가 왜 실패하는지 확인한다. 확인 전까지 깨끗하다고 가정하지 않는다' },
      }
    }
    if (f.dirtyCount > 0) {
      return {
        level: 'FATAL', code: 'dirty_write_runner',
        message: `${i.name}: active write runner가 미커밋 ${f.dirtyCount}건인 worktree를 실행한다`,
        detail: { ...detail, action: '운영 경로의 미커밋 변경을 정리한다. 손댄 이유를 먼저 확인할 것' },
      }
    }
  }

  // ── (7) 원격 신선도만 모름 ── 여기가 P0-1B 후속 보정 지점이다
  //
  //     보정 이유: 네트워크·인증 실패로 ls-remote가 안 되는 순간
  //     운영 runner 15개가 전부 FATAL이 됐다. 실제로는 아무 문제도 없는 상태였다.
  //     매번 울리는 FATAL은 아무도 보지 않게 되어 O1을 다시 놓치게 만든다.
  //
  //     그래서 "모른다"를 두 경우로 나눈다:
  //       스스로 회복 가능한가(sync_source) + 코드가 충분히 젊은가(grace) → WARN
  //       둘 중 하나라도 아니면                                          → FATAL
  //     O1은 sync_source가 없고 3주 된 코드였으므로 어느 쪽으로도 FATAL이다.
  if (active && f.divergedFromRemote === null) {
    const limit = f.syncIntervalHours === null ? null : f.syncIntervalHours * SYNC_GRACE_MULTIPLIER
    const ageLabel = f.headAgeHours === null ? '나이 불명' : `${Math.floor(f.headAgeHours)}시간 된 코드`
    const d = { ...detail, age: ageLabel, what: i.what }

    // sync 장치가 없으면 뒤처져도 스스로 회복하지 못한다 — 모르는 채로 둘 수 없다
    if (f.syncIntervalHours === null) {
      return {
        level: 'FATAL', code: 'freshness_unknown',
        message: `${i.name}: 원격 신선도를 알 수 없는데 자동 동기화 장치도 없다 — ${ageLabel}`,
        detail: { ...d, action: `${expected}(자동 sync 대상) 경로로 재지정하거나 runner를 정지한다` },
      }
    }

    // sync가 있어도 코드가 유예를 넘겼으면 sync가 고장난 것이다
    if (f.headAgeHours === null || (limit !== null && f.headAgeHours > limit)) {
      return {
        level: 'FATAL', code: 'freshness_unknown',
        message: `${i.name}: 원격 신선도를 알 수 없고 ${ageLabel}다 — 자동 sync(${f.syncIntervalHours}h)가 동작하지 않는다`,
        detail: { ...d, syncLimit: limit === null ? '(unknown)' : `${limit}h`, action: 'unao-prod-sync(03:00) 실행 로그를 확인한다' },
      }
    }

    // 기대 루트 · dirty 0 · sync 있음 · 유예 안 — 일시적 조회 실패로 본다
    return {
      level: 'WARN', code: 'remote_unknown_within_grace',
      message: `${i.name}: 원격 조회 실패로 신선도 미확정 — ${ageLabel}, sync 유예(${limit}h) 안이다`,
      detail: { ...d, action: '네트워크·인증을 확인한다. 코드 나이가 유예를 넘기면 FATAL이 된다' },
    }
  }

  // ── (7) 원격과 다름 ── O1의 본질
  //
  //     심각도는 **커밋 수가 아니라 HEAD 코드의 나이**로 가른다.
  //     이유: fetch 없이는 커밋 수를 못 세는 경우가 흔하고(§WorktreeFreshness),
  //           운영 관점에서 중요한 것도 "몇 커밋"이 아니라 "며칠 된 코드가 도는가"다.
  const stale = (f.behind ?? 0) > 0 || f.divergedFromRemote === true
  if (stale) {
    const gapLabel = f.behind !== null && f.behind > 0
      ? `${f.behind}커밋 뒤`
      : '원격과 다름(커밋 수는 fetch 없이 셀 수 없다)'
    const ageLabel = f.headAgeHours === null ? '나이 불명' : `${Math.floor(f.headAgeHours)}시간 된 코드`
    const d = { ...detail, gap: gapLabel, age: ageLabel, what: i.what }

    if (!active) {
      return {
        level: 'WARN', code: 'stale_readonly_runner',
        message: `${i.name}: ${gapLabel} · ${ageLabel} (등급 ${i.grade} — 즉시 장애는 아니다)`,
        detail: d,
      }
    }

    const limit = f.syncIntervalHours === null ? null : f.syncIntervalHours * SYNC_GRACE_MULTIPLIER
    const withinGrace = limit !== null && f.headAgeHours !== null && f.headAgeHours <= limit

    // sync 장치가 없으면 스스로 회복하지 못한다 — 뒤처짐 자체가 사고다 (O1이 이 경우다)
    if (f.syncIntervalHours === null) {
      return {
        level: 'FATAL', code: 'stale_write_runner',
        message: `${i.name}: active write runner가 자동 동기화 없는 worktree의 구 코드를 실행한다 — ${gapLabel} · ${ageLabel}`,
        detail: { ...d, action: `${expected}(자동 sync 대상) 경로로 재지정하거나 runner를 정지한다` },
      }
    }

    // sync 장치가 있는데도 유예를 넘겼다 = sync가 고장났다
    if (!withinGrace) {
      return {
        level: 'FATAL', code: 'stale_write_runner',
        message: `${i.name}: active write runner가 ${ageLabel}를 실행한다 — 자동 sync(${f.syncIntervalHours}h)가 동작하지 않는다`,
        detail: { ...d, syncLimit: `${limit}h`, action: 'unao-prod-sync(03:00) 실행 로그를 확인한다. 급하면 수동 pull' },
      }
    }

    // 유예 안이면 정상적인 sync 대기 상태다. 여기서 FATAL을 내면 매일 울려 guard가 무력해진다.
    // ⚠️ 코드는 `stale_write_within_grace`다. 예전엔 `stale_readonly_runner`를 돌려줬는데,
    //    publish 등급 runner가 "readonly" 코드로 보고돼 정의와 어긋났다.
    //    대시보드·알림이 code로 필터링하면 "read-only니까 무시"에 write runner가 섞인다.
    return {
      level: 'WARN', code: 'stale_write_within_grace',
      message: `${i.name}: ${gapLabel} · ${ageLabel} — sync 유예(${limit}h) 안이다`,
      detail: { ...d, action: `다음 sync(${f.syncIntervalHours}h 주기)로 해소된다. 유예를 넘기면 FATAL이 된다` },
    }
  }

  // ── (8) fallback 래퍼 ── 현재 값은 정상이나 env가 지워지면 구 경로로 샌다
  if (active && i.usesFallbackWrapper) {
    return {
      level: 'WARN', code: 'fallback_wrapper',
      message: `${i.name}: launchd-alert.sh 사용 — UNAO_WORKDIR가 지워지면 구 워크스페이스로 fallback한다 (현재 값은 정상)`,
      detail: { ...detail, action: 'launchd-wrapper.mjs로 통일 검토 (§19 P1-1)' },
    }
  }

  // ── (9) 로그 경로가 구 워크스페이스 ──
  //     stdout/stderr는 실행 코드가 아니다. 그래서 FATAL이 아니라 WARN이다.
  //     그러나 plist가 옛 경로에서 복사됐다는 신호이고, 그 plist의 다른 필드도
  //     같이 낡았을 수 있다. 조용히 넘기지 않는다.
  const staleLogRoots = [...new Set(logRoots.filter((r) => r === 'ops' || r === 'DEV'))]
  if (staleLogRoots.length > 0) {
    return {
      level: 'WARN', code: 'log_path_stale',
      message: `${i.name}: 로그 경로가 ${staleLogRoots.join(',')}를 가리킨다 — 실행 코드는 정상이나 plist가 구 경로에서 복사된 흔적이다`,
      detail: { ...detail, action: 'StandardOutPath·StandardErrorPath를 현재 운영 경로로 정리한다' },
    }
  }

  return {
    level: 'PASS', code: 'ok',
    message: `${i.name}: ${expected} · behind 0 · dirty 0`,
    detail,
  }
}

/** FATAL/WARN 메시지 아래에 붙일 상세 블록 — 운영자가 바로 조치할 수 있게 key=value로 편다 */
export function formatVerdictDetail(v: RunnerVerdict, indent = '      '): string {
  return Object.entries(v.detail)
    .map(([k, val]) => `${indent}${k}=${val}`)
    .join('\n')
}
