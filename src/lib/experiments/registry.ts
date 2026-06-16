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
}

// [2026-06-09] f01_signup_content(문구 A/B/C)·f01_signup_timing(타이밍 A/B) 실험 종료.
//   UT 정성 근거로 위너 확정 → 코드 고정: 문구=C 공감형 / 타이밍=read_complete(85%).
//   과거 기록은 git 히스토리 + docs/features/REGISTRY.md ARCHIVED 참조.
// [2026-06-13] twa01_entry_gate(TWA 첫 진입 가입 게이트) 종료 — A(게이트 없음) 위너 확정.
//   근거: 가입자·비회원 재방문 모두 A 우세(비회원 D1 18.3% vs 6.7%, 통계 유의). hard 게이트(C)는
//   가입수만 부풀리고 "다시 올 구경꾼"의 재방문을 소각 → 진성 효율 KPI에서 손해. 게이트 코드 제거, A/B 인프라 유지.
//   상세: docs/features/F16-twa-gate-experiment-archive.md
// 현재 운영 중인 실험 없음. 새 실험은 이 배열에 ExperimentDef 추가(파일 상단 표준 절차 참조).
export const EXPERIMENTS: ExperimentDef[] = []

export function getExperiment(id: string): ExperimentDef | undefined {
  return EXPERIMENTS.find((e) => e.id === id)
}
