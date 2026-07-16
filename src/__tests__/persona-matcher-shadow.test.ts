import { describe, it, expect } from 'vitest'
import { resolveMatcherMode } from '../../agents/cafe/persona-matcher-shadow-policy'
import { buildAllProfiles } from '../../agents/coo/persona-matcher-profiles'

/** CONTENT_CURATE persona matcher shadow — 모드 파싱·풀 제한 계약 고정 (2026-07-16 창업자 승인) */

describe('resolveMatcherMode — 안전 기본값 계약', () => {
  it('미설정/빈값/오타는 전부 off (안전 기본값)', () => {
    expect(resolveMatcherMode(undefined)).toBe('off')
    expect(resolveMatcherMode('')).toBe('off')
    expect(resolveMatcherMode('true')).toBe('off')
    expect(resolveMatcherMode('SHADOWW')).toBe('off')
  })
  it('shadow는 대소문자·공백 무관 인식', () => {
    expect(resolveMatcherMode('shadow')).toBe('shadow')
    expect(resolveMatcherMode(' Shadow ')).toBe('shadow')
  })
  it('on은 1단계 미지원 — shadow로 강등 (작성자 변경 코드 없음, 운영은 shadow만 허용)', () => {
    expect(resolveMatcherMode('on')).toBe('shadow')
  })
})

describe('A안 풀 제한 — curator 225만', () => {
  const pool = buildAllProfiles().filter(p => p.origin === 'curator')
  it('curator 풀에 bot-*/reaction_only가 섞이지 않음', () => {
    expect(pool.length).toBeGreaterThanOrEqual(200)
    expect(pool.every(p => p.key.startsWith('curator-'))).toBe(true)
    expect(pool.every(p => !p.reactionOnly)).toBe(true)
  })
  it('CONTENT_CURATE 기존 작성자 세계 유지 — 이메일이 curator-*@unao.bot', () => {
    expect(pool.every(p => /^curator-[a-z0-9]+@unao\.bot$/.test(p.authorEmail))).toBe(true)
  })
})
