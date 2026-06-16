/**
 * A/B 실험 중앙 레지스트리 — 단일 진실의 원천(SSOT)
 *
 * 새 실험 추가 표준 절차:
 *  1) 이 파일에 ExperimentDef 추가 (목적·배경·가설·확인방법 자연어 필수 — 다음 사람이 이해하게)
 *  2) 컴포넌트에서 getExperimentVariant(id) 호출 (직접 해시 만들지 말 것 — assign.ts만 사용)
 *  3) trackEvent(exposureEvent, { [variantProperty]: variant }) 로 노출 기록
 *  4) 배포 → 어드민 /admin/ab-tests 에서 상태 ACTIVE + 담당·시작일 입력
 *  5) 신뢰 배지가 "유의미(95%)" 뜨면 어드민에 결론 작성 + 종료
 *
 * variant.key 는 EventLog properties 에 그대로 저장되므로 한 번 정하면 변경 금지.
 */

export interface ExperimentVariant {
  /** EventLog properties 에 저장되는 값 (변경 금지) */
  key: string
  /** 어드민 표시명 (짧게) */
  label: string
  /** 어드민 상세 설명 — 이 variant가 실제로 무엇인지(문구 전문·동작) */
  description: string
  /** 배정 가중치 (정수, 합으로 분배) */
  weight: number
}

export interface ExperimentDef {
  id: string
  name: string
  /** 목적 — 왜 하나 */
  purpose: string
  /** 배경 — 어떤 문제/맥락에서 */
  background: string
  /** 가설 */
  hypothesis: string
  /** 확인방법 — 어떤 이벤트로 어떻게 측정하나 */
  howToVerify: string
  owner: string
  variants: ExperimentVariant[]
  /** 노출 이벤트명 (EventLog eventName) */
  exposureEvent: string
  /** 전환 이벤트명 (같은 sessionId join 으로 전환 판정) */
  conversionEvent: string
  /** 이벤트 properties 에서 이 실험의 variant 를 담는 키 */
  variantProperty: string
  /** 기존 하드코딩 배정과의 호환: localStorage 키 (없으면 exp_{id}) */
  legacyStorageKey?: string
  /** 기존 해시 분기 호환: 해시에 더하는 오프셋 (예: 타이밍 실험은 +7 로 콘텐츠와 직교) */
  hashOffset?: number
  /**
   * 실험 시작 시각 (epoch ms). 이 시각 전에는 assign.ts 가 variant 배정·노출·렌더를 모두 막는다(빈 문자열 반환).
   * 배포와 실험 시작을 분리하는 클라이언트 게이트. 어드민 ExperimentState.startedAt 과 동일 시각으로 맞춘다.
   * (status 는 어드민 기록·집계 상태일 뿐 클라이언트 중단 장치가 아니다 — 즉시 중단은 weight=0 또는 코드 배포)
   */
  startsAt?: number
}

// [2026-06-09] f01_signup_content(문구 A/B/C)·f01_signup_timing(타이밍 A/B) 실험 종료.
//   UT 정성 근거로 위너 확정 → 코드 고정: 문구=C 공감형 / 타이밍=read_complete(85%).
//   과거 기록은 git 히스토리 + docs/features/REGISTRY.md ARCHIVED 참조.
// [2026-06-13] twa01_entry_gate(TWA 첫 진입 가입 게이트) 종료 — A(게이트 없음) 위너 확정.
//   근거: 가입자·비회원 재방문 모두 A 우세(비회원 D1 18.3% vs 6.7%, 통계 유의). hard 게이트(C)는
//   가입수만 부풀리고 "다시 올 구경꾼"의 재방문을 소각 → 진성 효율 KPI에서 손해. 게이트 코드 제거, A/B 인프라 유지.
//   상세: docs/features/F16-twa-gate-experiment-archive.md
// [2026-06-16] exp1_related_flow — 글 상세 본문 직후 "다음에 읽기 좋은 이야기" 카드(A/B 50:50).
//   winner 판단은 어드민 RetentionPanel(3화면 도달률·D1·세션 page_view·inline 카드클릭) 기준.
//   conversionEvent=sign_up 은 ExperimentDef 타입 필수값일 뿐 — sign_up 엔 related_flow 가 실리지 않으므로
//   기존 가입 전환 카드(ExperimentCard)는 어드민에서 표시하지 않는다(가입 전환율 0/무의미 값 오해 방지).
//   배정·노출은 startsAt 이후에만 발생.
export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'exp1_related_flow',
    name: '글 상세 — 다음에 읽기 좋은 이야기 카드',
    purpose: '본문 직후 관련글 3개 카드로 다음 글 이동을 유도해 3화면 도달률·D1을 높인다',
    background:
      '웹 유입 D1 1~3%(앱 12%의 1/10). 첫날 3화면+ 둘러보면 D1 12.7%. 현재 관련글은 맨 아래(광고·댓글 뒤)에만 있어 도달 전 이탈.',
    hypothesis:
      '광고① 다음에 "다음에 읽기 좋은 이야기" 3개를 노출하면 다음 글 클릭↑ → 3화면 도달↑ → D1↑. 광고·댓글·하단 관련글은 보존.',
    howToVerify:
      'winner 판단은 어드민 RetentionPanel(3화면 도달률·D1·세션 page_view·inline 카드클릭) 기준. sign_up 엔 related_flow 가 안 실려 가입 전환 카드는 표시하지 않는다(오해 방지). AdSense RPM 은 variant 분리 불가 → 전체 수익 가드레일.',
    owner: '창업자',
    // 시작 시각(KST) = 2026-06-16 17:30. 이 시각 전엔 배정/노출/B카드 비활성(assign.ts 게이트).
    // 어드민 ExperimentState.startedAt 도 동일 시각(2026-06-16 17:30 KST)으로 설정해야 집계 컷이 일치한다.
    startsAt: Date.parse('2026-06-16T17:30:00+09:00'),
    variants: [
      { key: 'A', label: 'A 대조군(현행)', description: '본문 직후 카드 없음 — 관련글은 하단에만(현행 유지)', weight: 50 },
      { key: 'B', label: 'B 본문직후 카드', description: '광고① 다음에 "다음에 읽기 좋은 이야기" 3개 카드 노출(하단 관련글도 유지)', weight: 50 },
    ],
    exposureEvent: 'exp1_exposure',
    // ExperimentDef 타입 필수값 — sign_up 엔 related_flow 가 안 실리므로 가입 전환 카드는 어드민에서 미표시(RetentionPanel 로만 판단).
    conversionEvent: 'sign_up',
    variantProperty: 'related_flow',
  },
]

export function getExperiment(id: string): ExperimentDef | undefined {
  return EXPERIMENTS.find((e) => e.id === id)
}
