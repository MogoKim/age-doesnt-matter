/**
 * curator 페르소나 보강 메타 — shadow matcher 전용 명시 필드 (2026-07-19 창업자 승인)
 *
 * 배경: 07-19 shadow 채점 PASS율 47% — 원인은 휴리스틱 분류의 구조적 결손:
 *   FAMILY 7/INLAW 2/CARE 3명뿐, lightTone 과반응 87%, reserve 오분류 55%,
 *   H 시리즈(유머 관찰 계열)가 이름 키워드로 HEALTH 오분류 → 무거운 간병 글에 유머 페르소나 배정.
 * 원칙: curator-shared.ts 225명 정의는 무수정 — 우선순위 군집(건강/간병 → 가족/부부/시댁 → 은퇴/돈)만
 *   이 파일에서 override. 여기 없는 페르소나는 기존 휴리스틱 그대로.
 * 사용처: persona-matcher-profiles.ts (shadow matcher 전용 — 발행 경로 무영향)
 */
import type { TopicGroup } from '../coo/persona-matcher-policy.js'
import type { FamilyStatus } from '../coo/persona-matcher-profiles.js'

export interface CuratorPersonaMeta {
  topicGroups: TopicGroup[]
  /** 무거운 사연(간병/사별/학대/소송 등) 배정 가능 여부 — false면 heavy 글에서 hard 제외 */
  heavyOk: boolean
  /** 'light'=유머/자조 톤(건강 글 배정 제한 축과 연동), 'normal'=일반 */
  tone: 'light' | 'normal'
  familyStatus?: FamilyStatus
}

export const CURATOR_PERSONA_META: Record<string, CuratorPersonaMeta> = {
  // ── 1순위: 건강/간병/무거운 가족 고민 ──────────────────────────
  AK: { topicGroups: ['HEALTH', 'CARE_SOLO'], heavyOk: true, tone: 'normal' }, // 건강걱정많아 — 간병·요양·의료비·치매 (유일한 진성 간병 계열)
  CK: { topicGroups: ['CARE_SOLO', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 혼자도좋아
  DB: { topicGroups: ['CARE_SOLO'], heavyOk: true, tone: 'normal' }, // 혼자도괜찮아 — 외로움 솔직하게
  DU: { topicGroups: ['CARE_SOLO', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 나홀로웃음
  S053: { topicGroups: ['CARE_SOLO', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 혼밥도맛나
  DP: { topicGroups: ['HEALTH'], heavyOk: true, tone: 'normal' }, // 당뇨관리일기 — 진성 건강 관리
  AU: { topicGroups: ['FAMILY_SPOUSE', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 할말있어요 — 황당 가족 사건 유머

  // H 시리즈 재분류 — 건강 '자조 유머'는 가벼운 건강 수다만 (무거운 글 제외), 관찰 유머는 실제 주제로
  H010: { topicGroups: ['HEALTH', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 무릎이먼저
  H015: { topicGroups: ['HEALTH', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 계단이무서워
  H006: { topicGroups: ['HEALTH', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 노안소동
  H009: { topicGroups: ['HEALTH', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 깜빡깜빡여사
  H011: { topicGroups: ['HEALTH', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 다이어트내일부터
  H016: { topicGroups: ['HEALTH', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 병원웃음사냥 — 병원 일상 가벼운 글만
  H013: { topicGroups: ['HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 안경어디뒀지 — HEALTH 아님
  H014: { topicGroups: ['HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 늦잠대장 — HEALTH 아님
  H012: { topicGroups: ['HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 리모컨어디
  H021: { topicGroups: ['HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 한줄드립러
  H022: { topicGroups: ['HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 짧고굵게
  H023: { topicGroups: ['HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 리액션장인

  // 생활건강 진성 후보 보충 — H 유머 재분류로 얇아진 HEALTH 풀 (갱년기/임플란트류 질문 커버)
  CU: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 건강밥상연구
  S011: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 온천순례중
  S013: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 둘레길걷는날
  S064: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 아침스트레칭
  S065: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 물한잔습관
  S066: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 계단오르기중
  S067: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 저염밥상
  S069: { topicGroups: ['HEALTH', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 호흡명상시간
  L014: { topicGroups: ['RETIRE_MONEY', 'HEALTH'], heavyOk: true, tone: 'normal' }, // 건보료고민

  // ── 2순위: 가족/부부/남편/시댁 ────────────────────────────────
  AR: { topicGroups: ['FAMILY_SPOUSE', 'RETIRE_MONEY'], heavyOk: true, tone: 'normal', familyStatus: 'married' }, // 은퇴부부일상 — 갈등·화해 진지 가능
  AX: { topicGroups: ['FAMILY_SPOUSE', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light', familyStatus: 'married' }, // 남편관찰일기
  CJ: { topicGroups: ['FAMILY_SPOUSE', 'LOCAL_DAILY'], heavyOk: false, tone: 'normal', familyStatus: 'married' }, // 부부여행예찬
  S031: { topicGroups: ['FAMILY_SPOUSE', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal', familyStatus: 'married' }, // 영감님이랑산책
  H002: { topicGroups: ['FAMILY_SPOUSE', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light', familyStatus: 'married' }, // 영감님관찰중
  H001: { topicGroups: ['INLAW', 'FAMILY_SPOUSE'], heavyOk: false, tone: 'light', familyStatus: 'married' }, // 며느리관찰기
  S028: { topicGroups: ['INLAW', 'FAMILY_SPOUSE'], heavyOk: true, tone: 'normal', familyStatus: 'married' }, // 며느리랑장보기
  H020: { topicGroups: ['INLAW', 'LOCAL_DAILY'], heavyOk: false, tone: 'light', familyStatus: 'married' }, // 김장전쟁기 — 명절 집안일
  H003: { topicGroups: ['FAMILY_SPOUSE', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light', familyStatus: 'married' }, // 손주말받아쓰기

  // H 관찰 유머 — 동네/생활로 재분류 (HEALTH 오분류 해소)
  H004: { topicGroups: ['LOCAL_DAILY', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 옆집기웃이
  H005: { topicGroups: ['LOCAL_DAILY', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 마트관찰단
  H007: { topicGroups: ['LOCAL_DAILY', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 경로당소식통
  H008: { topicGroups: ['LOCAL_DAILY', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 동네목격담
  H017: { topicGroups: ['LOCAL_DAILY', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 시장빵터짐
  H018: { topicGroups: ['LOCAL_DAILY', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 모임빵빵
  H019: { topicGroups: ['LOCAL_DAILY', 'HUMOR_LIGHT'], heavyOk: false, tone: 'light' }, // 버스극장

  // ── 3순위: 은퇴/연금/돈 ──────────────────────────────────────
  B: { topicGroups: ['RETIRE_MONEY', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 순자언니
  AD: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 연금공부해요
  AE: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 퇴직금IRP연구
  AF: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 보험꼼꼼히
  AG: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 부동산은퇴족
  AI: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 세금절약비법
  AJ: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 집걱정많아
  AN: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 연금생활자
  AQ: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 재테크공부
  AS: { topicGroups: ['RETIRE_MONEY', 'LOCAL_DAILY'], heavyOk: true, tone: 'normal' }, // 생활비기록
  CA: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 적금체질
  CB: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 주식입문자
  CD: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 연금저축연구
  CE: { topicGroups: ['RETIRE_MONEY'], heavyOk: true, tone: 'normal' }, // 부동산정보통
}
