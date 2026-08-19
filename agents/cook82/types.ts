/**
 * 82cook 후보 큐 — 공용 타입 (M2-7 설계 C·D절)
 *
 * 이 큐는 Google Sheet와 **독립된 상태 기계**다.
 * Sheet 상태값(PENDING/PUBLISHED/…)을 재사용하지 않는 이유는,
 * 나중에 Sheet를 걷어내고 DB 큐로 옮길 때 상태값이 따라 죽으면 안 되기 때문이다.
 *
 * 레이어 경계:
 *   L1 collector  → RawCandidate   (write 없음)
 *   L2 gate/queue → QueueEntry     (write 없음)
 *   L3 bridge     → Sheet append   (유일한 write 지점)
 */

/** 큐 상태 12종. SENT_TO_SHEET 이전은 전부 파일 조작뿐이다. */
export type CandidateStatus =
  | 'COLLECTED' // 수집만 됨, 미판정
  | 'PASS_CANDIDATE' // gate 통과, 승인 대기
  | 'REVIEW' // 사람 판단 필요
  | 'REJECT' // 자동 탈락 (종점)
  | 'APPROVED' // 창업자 승인 — 사람만 진입 가능
  | 'DECLINED' // 창업자 반려 (종점)
  | 'HOLD' // 승인됐으나 발행 속도 조절 대기
  | 'SENT_TO_SHEET' // Sheet 행 생성 완료 — ★ 유일한 외부 write
  | 'PUBLISHED' // 실제 발행 확인
  | 'FAILED_AT_SHEET' // Sheet 이후 실패
  | 'HIDDEN' // 발행 후 내부 판단 비공개
  | 'TAKEDOWN' // 외부 요청 삭제
  | 'EXPIRED' // 미검토 자동 만료

/** 사람만 진입시킬 수 있는 상태 — 코드 경로로 자동 전이 금지 */
export const HUMAN_ONLY_STATUSES: readonly CandidateStatus[] = ['APPROVED', 'DECLINED', 'HOLD']

/** gate 판정 3분류 */
export type GateDecision = 'PASS' | 'REVIEW' | 'REJECT'

/** 연예 유형. E5(범죄·의혹)·E6(정치연계)만 차단 대상이다. */
export type EntertainmentType =
  | 'E1_나이·신상'
  | 'E2_결혼·이혼·근황'
  | 'E3_외모·성형·신체'
  | 'E4_작품·방송'
  | 'E5_범죄·의혹'
  | 'E6_정치연계'
  | 'E7_기타언급'

/** 발행 대상 보드 — agents/community/sheet-board-routing.ts SSoT를 따른다 */
export type SuggestedBoard = 'STORY' | 'HUMOR' | 'LIFE2' | 'MENOPAUSE'

/** 댓글 신호. 승격 신호이지 구제 신호가 아니다(REJECT를 되돌리지 않는다). */
export type CommentSignal = 'none' | 'weak' | 'mid' | 'strong'

/** 댓글 반응 유형 — 라벨만 기록한다. 댓글 전문 저장·재게시 금지. */
export type CommentTone = '경험담' | '공감' | '싸움' | '정치' | '비난' | '정보' | '연예수다'

/** L1 수집 레이어 출력. 목록에서 얻을 수 있는 것만 담는다. */
export interface RawCandidate {
  /** 82cook read.php num 기반 불변 PK — `cook82:15:{num}` */
  candidateId: string
  sourceUrl: string
  /** source trace — 수집원 추적 */
  sourceSite: 'cook82'
  /** bn=15 외 값이면 파이프라인을 정지시킨다 */
  sourceBoard: string
  collectorVersion: string
  /** 원문 제목. rewrite 금지. */
  title: string
  listPage: number
  collectedAt: string
  commentCount: number
  /** 목록 파싱 성공률이 낮아 null을 허용한다 */
  viewCount: number | null
}

/** gate 판정 결과 — 순수 함수 출력 */
export interface GateResult {
  decision: GateDecision
  gateVersion: string
  /** 사람이 읽을 판정 근거 */
  gateReason: string
  riskFlags: string[]
  nsScore: number
  ffScore: number
  entertainmentType: EntertainmentType | null
  suggestedBoard: SuggestedBoard
}

/** 상태 전이 1건 — rollback 근거 */
export interface StatusTransition {
  from: CandidateStatus
  to: CandidateStatus
  at: string
  by: string
  reason: string
}

/** L2 큐 레이어 출력 = 큐의 1행 */
export interface QueueEntry extends RawCandidate, GateResult {
  status: CandidateStatus
  /** 2중 중복키: URL 정규화 해시 + 제목 정규화 해시 */
  duplicateKey: string
  dupSource: 'queue' | 'sheet' | null
  commentSignal: CommentSignal
  commentTone: CommentTone | null
  detailFetchedAt: string | null
  reviewNote: string | null
  approvedBy: string | null
  approvedAt: string | null
  sentToSheetAt: string | null
  sheetTabName: string | null
  statusHistory: StatusTransition[]
}

/** gate 판정 → 초기 큐 상태 */
export function decisionToStatus(decision: GateDecision): CandidateStatus {
  switch (decision) {
    case 'PASS':
      return 'PASS_CANDIDATE'
    case 'REVIEW':
      return 'REVIEW'
    case 'REJECT':
      return 'REJECT'
    default: {
      const unreachable: never = decision
      throw new Error(`Unknown gate decision: ${unreachable}`)
    }
  }
}

/** 댓글 수 → 신호 등급 (M2-7 E절, 82cook 250건 실측 분포 기준) */
export function toCommentSignal(commentCount: number): CommentSignal {
  if (commentCount >= 6) return 'strong'
  if (commentCount >= 3) return 'mid'
  if (commentCount >= 1) return 'weak'
  return 'none'
}
