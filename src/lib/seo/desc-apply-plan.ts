/**
 * REWRITE_BRAND_COPY 적용 계획 — **순수 로직**.
 *
 * PR #468 이 확정한 CSV(`docs/operations/data/2026-09-11-seo-brand-copy-rewrite.csv`)를
 * 구조적으로 파싱해 "무엇을 쓸 것인가"를 결정한다. 여기에는 DB 접근도 I/O 도 없다.
 * 실행은 `scripts/seo-desc-apply.ts` 가 하고, 이 파일은 **판단만** 한다.
 *
 * 설계 원칙은 하나다 — **fail-closed(전부 아니면 전무).**
 * 행별로 건너뛰고 나머지를 계속 쓰면 어느 글이 옛 문구고 어느 글이 새 문구인지 알 수 없는
 * 중간 상태가 남는다. 그래서 이 모듈의 검증 함수는 "쓸 수 있는 행 목록"이 아니라
 * **"전체를 써도 되는가 / 안 되는가"** 를 돌려준다.
 *
 * 문서: `docs/operations/2026-09-11-seo-brand-copy-rewrite.md` §7
 */

import { createHash } from 'node:crypto'

/**
 * 확정 CSV 의 SHA-256 **전체값**.
 *
 * 앞 12자만 보면 우연한 충돌은 막아도 의도적 조작은 못 막는다. write 직전에
 * 전체값을 다시 계산해 대조하고, 다르면 **아무것도 쓰지 않는다.**
 * CSV 를 고칠 일이 생기면 이 상수도 같이 고쳐야 한다 — 그게 의도다.
 */
export const CSV_SHA256 =
  '17f44bb785ac12464f425c6c5f432ca288ce26de8726c7aa70a0eff303887280'

/**
 * Prisma 인터랙티브 트랜잭션 옵션.
 *
 * 기본값(maxWait 2s / timeout 5s)에 기대면 안 된다. 이 작업은 `updateMany` 를
 * **50회 순차** 실행하므로, 왕복 지연이 조금만 늘어도 5초를 넘겨 트랜잭션이
 * 중단된다. 중단 자체는 rollback 이라 안전하지만, 운영자는 "왜 실패했는지"
 * 모른 채 재시도하게 된다. 근거와 값은 운영 문서 §4-F 에 적었다.
 */
export const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * CSV 파일 전체 무결성 — write 전에 반드시 통과해야 한다.
 *
 * 한 글자만 달라도 던진다. 출력만 하고 넘어가면 검증이 아니라 장식이다.
 */
export function assertCsvIntegrity(raw: string): void {
  const actual = sha256(raw)
  if (actual !== CSV_SHA256) {
    throw new Error(
      `CSV SHA-256 불일치 — 확정본이 아니다.\n` +
      `  기대: ${CSV_SHA256}\n  실제: ${actual}\n` +
      `  CSV 가 바뀌었다면 정정안을 다시 검토해야 한다. 이 도구로 쓰지 마라.`,
    )
  }
}

/** CSV 한 행 중 이 도구가 쓰는 열만. 나머지 열은 읽되 판단에 쓰지 않는다. */
export interface RewriteRow {
  id: string
  boardType: string
  rewriteDecision: string
  applyEligible: string
  currentSeoTitle: string
  currentSeoDescription: string
  proposedSeoDescription: string
  proposedSeoTitle: string
  currentSeoTitleSha256_12: string
  currentSeoDescriptionSha256_12: string
}

/** 실제로 write 할 한 건. */
export interface ApplyTarget {
  id: string
  /** 낙관적 잠금 조건이자 롤백 목표값 */
  expectedSeoTitle: string | null
  expectedSeoDescription: string | null
  /** apply 모드에서 쓸 값 */
  nextSeoDescription: string | null
}

/** production 에서 읽어온 현재 값. */
export interface LiveRow {
  id: string
  /** 공개 면 전제 — JOB 이 아니면 이 정정안의 대상이 아니다 */
  boardType: string
  /** 공개 면 전제 — 숨겨졌거나 삭제된 글에 SEO 문구를 쓰지 않는다 */
  status: string
  seoTitle: string | null
  seoDescription: string | null
}

/**
 * 적용 대상이 만족해야 하는 공개 상태.
 *
 * `as const` 로 리터럴 타입을 유지한다 — Prisma 의 `boardType`·`status` 는 enum 이라
 * 넓은 `string` 을 주면 `where` 타입이 맞지 않는다.
 */
export const REQUIRED_BOARD_TYPE = 'JOB' as const
export const REQUIRED_STATUS = 'PUBLISHED' as const

export type Mode = 'apply' | 'rollback'

/** 이 도구가 건드리는 유일한 분류. 다른 값은 전부 적용 제외다. */
export const ELIGIBLE_DECISION = 'REWRITE_BRAND_COPY'

/** PR #468 이 확정한 수치. 어긋나면 CSV 가 바뀐 것이므로 실행하지 않는다. */
export const EXPECTED_TOTAL_ROWS = 59
export const EXPECTED_APPLY_ROWS = 50
export const EXPECTED_DECISION_COUNTS: Readonly<Record<string, number>> = {
  REWRITE_BRAND_COPY: 50,
  BRAND_COPY_PARTIAL_HOLD_REVIEW: 1,
  BRAND_COPY_HOLD_REVIEW: 4,
  OFFICIAL_NAME_ONLY_REVIEW: 3,
  SOURCE_TITLE_ONLY_REVIEW: 1,
}

/** 확인 토큰 — `--execute` 만으로는 쓰지 않는다. */
export const CONFIRM_TOKEN: Readonly<Record<Mode, string>> = {
  apply: 'APPLY-SEO-DESC-50',
  rollback: 'ROLLBACK-SEO-DESC-50',
}

/**
 * RFC 4180 CSV 파서.
 *
 * 정규식으로 쉼표를 자르면 따옴표 안의 쉼표에서 조용히 깨진다. 이 CSV 의
 * `currentSeoDescription` 은 쉼표와 줄바꿈을 모두 포함할 수 있으므로 상태 기계로 읽는다.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  // BOM 제거 — 엑셀에서 저장하면 붙는다
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
      } else field += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === ',') { row.push(field); field = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  if (quoted) throw new Error('CSV 파싱 실패: 닫히지 않은 따옴표')

  const [header, ...body] = rows
  if (!header) throw new Error('CSV 파싱 실패: 헤더 없음')
  return body
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => {
      if (r.length !== header.length) {
        throw new Error(`CSV 파싱 실패: 열 수 불일치 (기대 ${header.length}, 실제 ${r.length})`)
      }
      return Object.fromEntries(header.map((h, i) => [h, r[i]]))
    })
}

const REQUIRED_COLUMNS = [
  'id', 'boardType', 'rewriteDecision', 'applyEligible',
  'currentSeoTitle', 'currentSeoDescription', 'proposedSeoDescription', 'proposedSeoTitle',
  'currentSeoTitleSha256_12', 'currentSeoDescriptionSha256_12',
] as const

export function toRewriteRows(records: Record<string, string>[]): RewriteRow[] {
  if (records.length) {
    const missing = REQUIRED_COLUMNS.filter((c) => !(c in records[0]))
    if (missing.length) throw new Error(`CSV 열 누락: ${missing.join(', ')}`)
  }
  return records as unknown as RewriteRow[]
}

/**
 * CSV 를 빈 문자열/`null` 구분해 DB 값으로 바꾼다.
 *
 * CSV 는 `null` 을 표현할 수 없어 빈 문자열로 적는다. 이 프로젝트의 `seoDescription` 은
 * 어드민에서 공백을 넣으면 `null` 이 되므로(admin.content.ts), 빈 문자열은 `null` 로 읽는다.
 * 두 값을 섞으면 drift 판정이 조용히 어긋난다.
 */
export function csvToDbValue(v: string): string | null {
  return v === '' ? null : v
}

export interface PlanIssue { code: string; detail: string }

/**
 * 오류 메시지에 쓰는 **비식별 표기**.
 *
 * 실패 경로의 로그가 가장 널리 공유된다(캡처해서 붙여넣게 된다).
 * 그래서 정상 경로뿐 아니라 **오류 경로에서도** 원본 post id 를 찍지 않는다.
 */
function tag(id: string): string {
  return `post#${fingerprint(id)}`
}

export interface Plan {
  ok: boolean
  issues: PlanIssue[]
  targets: ApplyTarget[]
  /** 적용 제외 행 수 — 보고용 */
  excluded: number
  decisionCounts: Record<string, number>
}

/**
 * CSV 전체를 검증하고 write 대상 50건을 만든다.
 *
 * 여기서 하나라도 어긋나면 `ok=false` 이고, 호출부는 **아무것도 쓰지 않는다.**
 */
export function buildPlan(rows: RewriteRow[], mode: Mode): Plan {
  const issues: PlanIssue[] = []
  const push = (code: string, detail: string) => issues.push({ code, detail })

  if (rows.length !== EXPECTED_TOTAL_ROWS) {
    push('ROW_COUNT', `CSV 전체 행이 ${EXPECTED_TOTAL_ROWS} 이 아니다 (실제 ${rows.length})`)
  }

  const decisionCounts: Record<string, number> = {}
  for (const r of rows) decisionCounts[r.rewriteDecision] = (decisionCounts[r.rewriteDecision] ?? 0) + 1
  for (const [k, v] of Object.entries(EXPECTED_DECISION_COUNTS)) {
    if ((decisionCounts[k] ?? 0) !== v) {
      push('DECISION_COUNT', `${k} 가 ${v} 가 아니다 (실제 ${decisionCounts[k] ?? 0})`)
    }
  }
  const unknown = Object.keys(decisionCounts).filter((k) => !(k in EXPECTED_DECISION_COUNTS))
  if (unknown.length) push('DECISION_UNKNOWN', `모르는 분류: ${unknown.join(', ')}`)

  const eligible = rows.filter((r) => r.applyEligible === 'true')
  if (eligible.length !== EXPECTED_APPLY_ROWS) {
    push('ELIGIBLE_COUNT', `applyEligible=true 가 ${EXPECTED_APPLY_ROWS} 이 아니다 (실제 ${eligible.length})`)
  }

  // applyEligible 과 분류가 어긋나면 보류 행이 실행 입력에 섞였다는 뜻이다
  for (const r of rows) {
    const shouldBeEligible = r.rewriteDecision === ELIGIBLE_DECISION
    if ((r.applyEligible === 'true') !== shouldBeEligible) {
      push('ELIGIBLE_MISMATCH', `applyEligible 과 rewriteDecision 이 어긋난다: ${tag(r.id)}`)
    }
  }

  const ids = eligible.map((r) => r.id)
  const uniq = new Set(ids)
  if (uniq.size !== ids.length) {
    push('DUPLICATE_ID', `적용 대상에 중복 id 가 있다 (고유 ${uniq.size} / 전체 ${ids.length})`)
  }
  if (ids.some((id) => !id)) push('EMPTY_ID', '적용 대상에 빈 id 가 있다')

  for (const r of eligible) {
    if (r.boardType !== 'JOB') push('BOARD_TYPE', `적용 대상에 JOB 이 아닌 행이 있다: ${tag(r.id)}`)
    if (r.proposedSeoDescription === '') push('EMPTY_PROPOSAL', `제안 문구가 비어 있다: ${tag(r.id)}`)
    // seoTitle 은 어떤 경우에도 write 대상이 아니다 — 제안값이 있으면 CSV 가 바뀐 것이다
    if (r.proposedSeoTitle !== '') push('TITLE_PROPOSAL', `seoTitle 제안값이 있다(write 금지): ${tag(r.id)}`)
    if (r.proposedSeoDescription === r.currentSeoDescription) {
      push('NO_OP', `현재 값과 제안 값이 같다: ${tag(r.id)}`)
    }
    // 행별 해시를 **다시 계산**한다. CSV 열을 손대면 여기서 걸린다.
    if (sha256(r.currentSeoTitle).slice(0, 12) !== r.currentSeoTitleSha256_12) {
      push('HASH_MISMATCH', `currentSeoTitle 해시가 맞지 않는다: ${tag(r.id)}`)
    }
    if (sha256(r.currentSeoDescription).slice(0, 12) !== r.currentSeoDescriptionSha256_12) {
      push('HASH_MISMATCH', `currentSeoDescription 해시가 맞지 않는다: ${tag(r.id)}`)
    }
  }

  const targets: ApplyTarget[] = eligible.map((r) => {
    const current = csvToDbValue(r.currentSeoDescription)
    const proposed = csvToDbValue(r.proposedSeoDescription)
    return {
      id: r.id,
      expectedSeoTitle: csvToDbValue(r.currentSeoTitle),
      // apply 는 현재값이 기대값이고, rollback 은 제안값(=이미 반영된 값)이 기대값이다
      expectedSeoDescription: mode === 'apply' ? current : proposed,
      nextSeoDescription: mode === 'apply' ? proposed : current,
    }
  })

  return {
    ok: issues.length === 0,
    issues,
    targets,
    excluded: rows.length - eligible.length,
    decisionCounts,
  }
}

/** null 과 빈 문자열을 같다고 보지 않는다. 정규화(trim·공백 축약)도 하지 않는다. */
export function exactEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

export interface DriftReport {
  ok: boolean
  issues: PlanIssue[]
  /** 이미 목표값인 행 — apply 재실행 시 여기에 걸린다 */
  alreadyApplied: number
}

/**
 * production 현재값과 기대값을 대조한다.
 *
 * **하나라도 어긋나면 전체를 막는다.** 값이 달라졌다는 것은 그 사이 누군가 고쳤거나
 * 재수집이 덮어썼다는 뜻이고, 그러면 이 정정안의 전제가 깨진 것이다.
 */
export function detectDrift(targets: ApplyTarget[], live: LiveRow[], mode: Mode = 'apply'): DriftReport {
  const issues: PlanIssue[] = []
  const push = (code: string, detail: string) => issues.push({ code, detail })

  if (live.length !== targets.length) {
    push('LIVE_COUNT', `조회 결과가 ${targets.length} 건이 아니다 (실제 ${live.length})`)
  }

  const byId = new Map<string, LiveRow>()
  for (const row of live) {
    if (byId.has(row.id)) push('LIVE_DUPLICATE', `조회 결과에 중복 id 가 있다: ${tag(row.id)}`)
    byId.set(row.id, row)
  }

  let alreadyApplied = 0
  for (const t of targets) {
    const row = byId.get(t.id)
    if (!row) { push('MISSING', `production 에 없는 id: ${tag(t.id)}`); continue }
    if (row.boardType !== REQUIRED_BOARD_TYPE) {
      push('DRIFT_BOARD_TYPE', `boardType 이 ${REQUIRED_BOARD_TYPE} 가 아니다: ${tag(t.id)}`)
    }
    if (row.status !== REQUIRED_STATUS) {
      push('DRIFT_STATUS', `status 가 ${REQUIRED_STATUS} 가 아니다: ${tag(t.id)}`)
    }
    if (!exactEquals(row.seoTitle, t.expectedSeoTitle)) {
      push('DRIFT_TITLE', `seoTitle 이 CSV current 값과 다르다: ${tag(t.id)}`)
    }
    if (!exactEquals(row.seoDescription, t.expectedSeoDescription)) {
      // 이미 목표값이면 "재실행"이다 — 그래도 전제가 깨진 것이므로 막는다
      if (exactEquals(row.seoDescription, t.nextSeoDescription)) {
        alreadyApplied++
        push('ALREADY_APPLIED', mode === 'apply'
          ? `이미 정정안이 적용돼 있다(재실행 추정): ${tag(t.id)}`
          : `되돌릴 것이 없다 — 아직 적용 전이거나 이미 롤백됐다: ${tag(t.id)}`)
      } else {
        push('DRIFT_DESCRIPTION', `seoDescription 이 CSV current 값과 다르다: ${tag(t.id)}`)
      }
    }
  }

  // 대상에 없는 id 가 조회 결과에 섞였는지
  const targetIds = new Set(targets.map((t) => t.id))
  for (const row of live) {
    if (!targetIds.has(row.id)) push('LIVE_EXTRA', `대상 밖 id 가 조회됐다: ${tag(row.id)}`)
  }

  return { ok: issues.length === 0, issues, alreadyApplied }
}

/**
 * 로그용 지문.
 *
 * post id 도 그대로 찍지 않는다 — 로그가 공유될 때 어떤 글인지 바로 드러나지 않게 한다.
 * 대조가 필요하면 CSV 와 같은 방식으로 다시 계산하면 된다.
 */
export function fingerprint(value: string): string {
  return sha256(value).slice(0, 10)
}
