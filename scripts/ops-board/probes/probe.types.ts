// 거울 보드 probe 공통 타입
// 핵심 원칙: ok=null(판정불가)을 false(미완료)와 절대 혼동하지 않는다.

/** true=충족, false=명확히 미충족, null=판정 불가(조회 실패/타임아웃) */
export type ProbeStatus = boolean | null

export interface ProbeResult {
  /** 'git' | 'ci' | 'http' */
  kind: ProbeKind
  ok: ProbeStatus
  /** 'commit-exists' | 'ci-success' | 'cache-HIT' 등 사람이 읽는 신호 */
  signal: string
  /**
   * 증거 요약만. 토큰/env/DB URL/GitHub token 절대 금지(화이트리스트된 값만).
   * SSE로 브라우저에 그대로 나가므로 민감정보가 들어오면 안 된다.
   */
  detail: Record<string, string | number | boolean | null>
  checkedAt: string
  durationMs: number
  error?: string
}

export type ProbeKind = 'git' | 'ci' | 'http' | 'db'

// 보드 컬럼 = 창업자의 5분류 (probe가 자동으로 이 중 하나에 배치)
export type Column = '완료됨' | '배포완료-적용확인' | '지금가능' | '백로그' | '제외'

export interface CardProbeResults {
  git?: ProbeResult
  ci?: ProbeResult
  http?: ProbeResult[]
  db?: ProbeResult
}

export function nowIso(): string {
  return new Date().toISOString()
}
