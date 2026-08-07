/**
 * author-reply registry 전환 회귀 가드 (PR-3 / L-PERSONA-SSOT)
 *
 * ⚠️ 이 테스트의 기준값은 **전환 전 구현**(origin/main 32fd4695의
 * author-reply-persona.ts)이 생성한 스냅샷이다. registry로 만든 값이 아니다.
 * 따라서 "registry vs registry" 비교가 아니라 진짜 회귀 가드로 동작한다.
 *
 * 스냅샷 생성 시 계정 목록도 registry가 아니라 원본 2종
 * (persona-data.ts getAllPersonaIds / curator-shared.ts PERSONAS)에서 뽑았다.
 */
import { describe, it, expect } from 'vitest'
import { resolveAuthorPersonaContext } from '../../agents/coo/author-reply-persona'
import snapshot from './fixtures/author-reply-persona-snapshot.json'

type SnapEntry = {
  email: string
  result: { personaId: string; nickname: string; personality: string; style: string; speechPatterns: string[] } | null
}
const entries = snapshot.entries as SnapEntry[]

describe('전환 전 스냅샷 대비 동작 동일성', () => {
  it('스냅샷이 전환 전 구현에서 생성됐음을 명시', () => {
    expect(snapshot._generatedFrom).toContain('전환 전 구현')
    expect(entries.length).toBe(snapshot._counts.total)
  })

  it('313건 전원 동일 (non-null 305 · null 8)', () => {
    const diffs: string[] = []
    for (const e of entries) {
      const now = resolveAuthorPersonaContext(e.email)
      if (JSON.stringify(now) !== JSON.stringify(e.result)) {
        diffs.push(`${e.email}: before=${JSON.stringify(e.result)?.slice(0, 60)} after=${JSON.stringify(now)?.slice(0, 60)}`)
      }
    }
    expect(diffs).toEqual([])
    expect(entries.filter(e => e.result !== null)).toHaveLength(305)
    expect(entries.filter(e => e.result === null)).toHaveLength(8)
  })

  it('의도적 null이 그대로 null — 기능 봇 4 + 운영 1', () => {
    for (const email of [
      'bot-job@unao.bot', 'bot-humor@unao.bot', 'bot-caregiving@unao.bot',
      'bot-health@unao.bot', 'official@unao.bot',
    ]) {
      const snap = entries.find(e => e.email === email)!
      expect(snap.result, `스냅샷 ${email}`).toBeNull()
      expect(resolveAuthorPersonaContext(email), `전환 후 ${email}`).toBeNull()
    }
  })

  it('알 수 없는 이메일도 그대로 null', () => {
    for (const email of ['bot-zzz@unao.bot', 'curator-zzz@unao.bot', 'someone@example.com']) {
      expect(resolveAuthorPersonaContext(email), email).toBeNull()
    }
  })

  it('대소문자 무시 동작 유지 (BOT-A@UNAO.BOT)', () => {
    const snap = entries.find(e => e.email === 'BOT-A@UNAO.BOT')!
    expect(snap.result).not.toBeNull()
    expect(resolveAuthorPersonaContext('BOT-A@UNAO.BOT')).toEqual(snap.result)
  })

  it('필드 5개가 전부 보존됨 (personaId·nickname·personality·style·speechPatterns)', () => {
    const sample = entries.find(e => e.result !== null)!
    const now = resolveAuthorPersonaContext(sample.email)!
    expect(Object.keys(now).sort()).toEqual(
      ['nickname', 'personaId', 'personality', 'speechPatterns', 'style'],
    )
    expect(now.speechPatterns).toEqual(sample.result!.speechPatterns)
    expect(now.personality).toBe(sample.result!.personality)
  })

  it('seed와 curator 양쪽 체계가 모두 살아 있음', () => {
    const seed = entries.filter(e => e.result?.personaId && !e.result.personaId.startsWith('curator-'))
    const curator = entries.filter(e => e.result?.personaId.startsWith('curator-'))
    expect(seed.length).toBeGreaterThanOrEqual(79)
    expect(curator).toHaveLength(225)
    for (const e of [seed[0], curator[0]]) {
      expect(resolveAuthorPersonaContext(e.email)).toEqual(e.result)
    }
  })
})
