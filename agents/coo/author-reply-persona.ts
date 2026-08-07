/**
 * 작성자 이메일 → 답글 페르소나 컨텍스트 (얇은 wrapper — PR-3, L-PERSONA-SSOT)
 *
 * 2026-08-07 PR-3: 내부 로직을 agents/core/persona-registry.ts로 위임했다.
 *   - export API(타입·함수 시그니처)는 전환 전과 **동일**하다. 호출부 수정 0.
 *   - 동작 결과도 전환 전과 **동일**하다 — 313건 스냅샷 회귀 테스트로 고정
 *     (src/__tests__/fixtures/author-reply-persona-snapshot.json, 전환 전 구현이 생성).
 *
 * 이전 구현(2026-07-15 페르소나 감사)이 하던 일:
 *   bot-{id}@unao.bot    → persona-data.ts (깊은 인격)
 *   curator-{id}@unao.bot → curator-shared.ts PERSONAS (얕은 정의)
 * 두 체계를 각각 역추적하던 분기는 registry가 흡수했다. 원본 파일은 아직 살아 있고
 * export 제거·CI 가드는 PR-7에서 처리한다.
 */
import { resolveByEmail, toAuthorReplyContext } from '../core/persona-registry.js'

export type { AuthorReplyPersonaContext } from '../core/persona-registry.js'
import type { AuthorReplyPersonaContext } from '../core/persona-registry.js'

/**
 * 알 수 없는 id(기능 봇 bot-job/humor/caregiving/health, 운영 계정, 오타)는 null.
 * 엉뚱한 인격으로 답하는 것을 막는 기존 동작 그대로다.
 */
export function resolveAuthorPersonaContext(email: string): AuthorReplyPersonaContext | null {
  return toAuthorReplyContext(resolveByEmail(email))
}
