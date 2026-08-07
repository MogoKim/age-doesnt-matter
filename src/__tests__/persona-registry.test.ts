/**
 * 페르소나 SSoT registry — 전수 동일성 (PR-2 / L-PERSONA-SSOT)
 *
 * 이 테스트가 PR-2의 PASS 기준이다. registry가 기존 어댑터 2종의 출력을
 * 전수 재현하지 못하면 경로를 갈아탈 수 없다(PR-3~6 착수 불가).
 */
import { describe, it, expect } from 'vitest'
import { resolveAuthorPersonaContext } from '../../agents/coo/author-reply-persona'
import { buildAllProfiles } from '../../agents/coo/persona-matcher-profiles'
import {
  buildRegistry, resolveByEmail, listPersonas, toAuthorReplyContext, toPersonaProfile,
  type PersonaEntry,
} from '../../agents/core/persona-registry'

const registry = buildRegistry()
const personas = listPersonas()

describe('registry 구성', () => {
  it('seed 79 + curator 225 + system 4 + official 1 = 309', () => {
    const by = (r: PersonaEntry['role']) => registry.filter(e => e.role === r).length
    expect(registry.filter(e => e.origin === 'seed')).toHaveLength(79)
    expect(registry.filter(e => e.origin === 'curator')).toHaveLength(225)
    expect(by('system_feed')).toBe(4)
    expect(by('official_operator')).toBe(1)
    expect(registry).toHaveLength(309)
  })

  it('id·email 중복 없음', () => {
    expect(new Set(registry.map(e => e.id)).size).toBe(registry.length)
    expect(new Set(registry.map(e => e.email.toLowerCase())).size).toBe(registry.length)
  })

  it('필수 정체성 필드 누락 0', () => {
    for (const e of registry) {
      expect(e.id, e.email).toBeTruthy()
      expect(e.displayName, e.email).toBeTruthy()
      expect(e.ageBand, e.email).toBeTruthy()
      expect(e.familyStatus, e.email).toBeTruthy()
      expect(e.identityConfidence, e.email).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(e.boardsAllowed), e.email).toBe(true)
    }
  })
})

describe('어댑터1 (author-reply-persona) 전수 동일성', () => {
  it('인격체 304명 전원 동일', () => {
    const diffs: string[] = []
    for (const e of personas) {
      const legacy = resolveAuthorPersonaContext(e.email)
      const next = toAuthorReplyContext(e)
      if (JSON.stringify(legacy) !== JSON.stringify(next)) diffs.push(e.email)
    }
    expect(diffs).toEqual([])
    expect(personas).toHaveLength(304)
  })

  it('기능 봇·운영 계정은 기존과 동일하게 null (의도적 제외)', () => {
    for (const e of registry.filter(x => x.role !== 'persona')) {
      expect(resolveAuthorPersonaContext(e.email), e.email).toBeNull()
      expect(toAuthorReplyContext(e), e.email).toBeNull()
    }
  })

  it('registry에 없는 이메일은 양쪽 모두 null', () => {
    for (const bogus of ['bot-zzz@unao.bot', 'curator-zzz@unao.bot', 'someone@example.com']) {
      expect(resolveAuthorPersonaContext(bogus)).toBeNull()
      expect(toAuthorReplyContext(resolveByEmail(bogus))).toBeNull()
    }
  })
})

describe('어댑터2 (persona-matcher-profiles) 전수 동일성', () => {
  const legacyProfiles = buildAllProfiles()

  it('프로필 수 동일', () => {
    expect(toPersonaProfile).toBeTypeOf('function')
    expect(personas.map(toPersonaProfile)).toHaveLength(legacyProfiles.length)
  })

  it('key별 전 필드 동일', () => {
    const next = new Map(personas.map(e => [e.id, toPersonaProfile(e)]))
    const diffs: string[] = []
    for (const lp of legacyProfiles) {
      const np = next.get(lp.key)
      if (!np) { diffs.push(`${lp.key}: registry 누락`); continue }
      if (JSON.stringify(lp) !== JSON.stringify(np)) {
        const fields = (Object.keys(lp) as (keyof typeof lp)[])
          .filter(k => JSON.stringify(lp[k]) !== JSON.stringify(np[k]))
        diffs.push(`${lp.key}: ${fields.join(',')}`)
      }
    }
    expect(diffs).toEqual([])
  })
})

describe('기능 봇 처리 (동작 변경 없음 확인)', () => {
  it('bot-job — 채용 피드, author-reply 대상 아님', () => {
    const e = resolveByEmail('bot-job@unao.bot')!
    expect(e.role).toBe('system_feed')
    expect(e.replyEligible).toBe(false)
    expect(e.canWritePost).toBe(true)
    expect(e.canWriteComment).toBe(false)
    expect(e.canWriteAuthorReply).toBe(false)
    expect(e.boardsAllowed).toEqual(['JOB'])
    expect(e.needsReview).toBe(false) // 판단 완료
  })

  it('dormant 3종 — 활성화하지 않음 + 검수 대기 표시', () => {
    for (const id of ['humor', 'caregiving', 'health']) {
      const e = resolveByEmail(`bot-${id}@unao.bot`)!
      expect(e.role, id).toBe('system_feed')
      expect(e.replyEligible, id).toBe(false)
      expect(e.canWriteAuthorReply, id).toBe(false)
      expect(e.needsReview, id).toBe(true)
    }
  })
})

describe('정체성 승격 (ageBand · familyStatus)', () => {
  it('seed 79명은 explicit — age 원본 보유', () => {
    const seed = registry.filter(e => e.origin === 'seed')
    expect(seed.every(e => e.identitySource === 'explicit')).toBe(true)
    expect(seed.every(e => e.identityConfidence === 1)).toBe(true)
    expect(seed.every(e => e.ageBand !== 'unknown')).toBe(true)
    expect(seed.every(e => e.needsReview === false)).toBe(true)
  })

  it('curator 225명은 declared(meta) 또는 inferred', () => {
    const cur = registry.filter(e => e.origin === 'curator')
    expect(cur.every(e => e.identitySource === 'declared' || e.identitySource === 'inferred')).toBe(true)
    const declared = cur.filter(e => e.identitySource === 'declared')
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.every(e => e.identityConfidence === 0.9)).toBe(true)
  })

  it('needsReview는 관측 전용 — 배정 권한을 막지 않는다', () => {
    for (const e of personas.filter(x => x.needsReview)) {
      expect(e.canWritePost || e.legacy.reactionOnly, e.email).toBe(true)
      expect(e.canWriteComment, e.email).toBe(true)
      expect(e.replyEligible, e.email).toBe(true)
    }
  })
})

describe('스크래퍼봇 가드 (BI~BW)', () => {
  it('reactionOnly는 원글 작성 불가, 댓글은 가능', () => {
    const ro = personas.filter(e => e.legacy.reactionOnly)
    expect(ro).toHaveLength(15)
    for (const e of ro) {
      expect(e.canWritePost, e.email).toBe(false)
      expect(e.canWriteComment, e.email).toBe(true)
    }
  })
})
