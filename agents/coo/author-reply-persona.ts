/**
 * 작성자 이메일 → 답글 페르소나 컨텍스트 변환 (순수 — DB/SDK 의존 없음, vitest 직접 로드 가능)
 *
 * 배경(2026-07-15 페르소나 감사): 발행 작성자가 두 체계로 분리 —
 *  - bot-{id}@unao.bot  : persona-data.ts (깊은 인격 — SHEET 발행·seed 댓글)
 *  - curator-{id}@unao.bot : curator-shared.ts PERSONAS (CONTENT_CURATE·popular 발행)
 * 기존 author-reply는 bot-* regex만 역추적해 curator-* 글의 실회원 댓글(~15%)이 조용히 skip됐다.
 * 이 helper가 두 체계를 모두 프롬프트 입력 형태로 변환한다. curator id는 숫자 포함(s028 등) 허용.
 */
import { getPersona, getAllPersonaIds } from '../seed/persona-data.js'
import { PERSONAS as CURATOR_PERSONAS } from '../cafe/curator-shared.js'

export interface AuthorReplyPersonaContext {
  /** 관측용 — bot은 대문자 id, curator는 'curator-{id}' */
  personaId: string
  nickname: string
  personality: string
  style: string
  speechPatterns: string[]
}

export function resolveAuthorPersonaContext(email: string): AuthorReplyPersonaContext | null {
  const botId = email.match(/^bot-([a-z0-9]+)@unao\.bot$/i)?.[1]?.toUpperCase()
  if (botId) {
    // getPersona는 unknown id에 PERSONAS.A로 fallback하므로 명시 검증 — 엉뚱한 인격으로 답하는 것 방지
    if (!getAllPersonaIds().includes(botId)) return null
    const p = getPersona(botId)
    return {
      personaId: botId,
      nickname: p.nickname,
      personality: p.personality,
      style: p.style,
      speechPatterns: p.speech_patterns,
    }
  }

  const curatorId = email.match(/^curator-([a-z0-9]+)@unao\.bot$/i)?.[1]
  if (curatorId) {
    const p = CURATOR_PERSONAS.find(x => x.id.toLowerCase() === curatorId.toLowerCase())
    if (!p) return null // 알 수 없는 curator id — skip
    return {
      personaId: `curator-${p.id}`,
      nickname: p.nickname,
      // curator 페르소나는 personality 필드가 없어 style+topics+quirks로 요약 합성
      personality: `${p.style}. 주로 ${p.topics.slice(0, 3).join(', ')} 이야기를 하고, ${p.quirks.slice(0, 2).join(' / ')} 같은 습관이 있다`,
      style: p.style,
      speechPatterns: p.patterns,
    }
  }

  return null
}
