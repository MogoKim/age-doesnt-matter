/**
 * 페르소나 통합 프로필 어댑터 — 순수 (DB/SDK 의존 없음, vitest 직접 로드 가능)
 *
 * 배경(2026-07-15 페르소나 감사 + 창업자 결정):
 *  - bot-*(깊은 필드) / curator-*(얕은 필드) 두 체계를 matcher가 쓸 수 있는 단일
 *    PersonaProfile로 변환한다.
 *  - curator 정의는 가족상태·나이대 필드가 없어 텍스트 휴리스틱으로 추론하고,
 *    추론 불가는 'unknown'으로 남긴다(unknown은 hard 제외가 아니라 검수 플래그 재료).
 *  - 과거 글 authorId 재매핑 금지 — 이 어댑터는 신규 matcher 판단 전용이다.
 *  - BI~BW는 스크래퍼봇 전용(댓글/좋아요만, 글 작성 없음) → reactionOnly, 원글 배정 불가.
 *
 * [PR-7d] 원본(persona-data.ts · curator-shared.ts)을 직접 읽던 조립 로직을 걷어내고
 * SSoT 진입점(agents/core/persona-registry.ts)에서 받는다. 위 규칙은 전부 registry의
 * buildSeedEntry / buildCuratorEntry / toPersonaProfile로 옮겨가 그대로 살아 있고,
 * 출력은 전환 전과 byte-identical이다(src/__tests__/persona-matcher-profiles-registry.test.ts).
 *
 * 타입·휴리스틱(FamilyStatus · PersonaProfile · inferFamilyStatus)도 registry가 정본이며
 * 여기서는 재수출만 한다 — 기존 소비자(persona-matcher-policy · curator-persona-meta ·
 * 테스트)의 import 경로를 바꾸지 않기 위해서다. 정리는 PR-7e.
 *
 * 의존 방향은 단방향이다: profiles → registry (registry는 profiles를 import하지 않는다).
 */
import { listPersonas, toPersonaProfile, type PersonaProfile } from '../core/persona-registry.js'

export {
  inferFamilyStatus,
  type FamilyStatus,
  type PersonaProfile,
} from '../core/persona-registry.js'

/**
 * 전체 작성자 페르소나 풀 (bot 79 + curator 225).
 *
 * 전환 전에는 여기서 gender!=='여' 페르소나를 제외했는데, seed 79명이 전원 '여'라
 * 실질 제외가 0건이었다(registry 주석 참조). registry의 listPersonas()는 role==='persona'만
 * 남기므로 기능 봇·운영 계정은 애초에 들어오지 않는다 — 결과 304건이 전환 전과 동일하다.
 */
export function buildAllProfiles(): PersonaProfile[] {
  return listPersonas().map(toPersonaProfile)
}
