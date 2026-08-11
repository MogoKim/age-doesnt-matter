/**
 * seed 경로 registry 전환 회귀 가드 (PR-4 / L-PERSONA-SSOT)
 *
 * generator.ts가 persona-data.ts를 직접 보던 경로를 끊고 registry를 통해 보게 바꿨다.
 * registry는 변환하지 않고 원본 함수를 그대로 재수출하므로, 동일성은 "같은 참조"로
 * 구조적으로 보장된다. 이 테스트가 그 계약을 고정한다.
 *
 * ⚠️ PR-4는 SSoT 완료가 아니다. registry의 재수출은 PR-7(원본 export 제거 + CI 가드)
 * 전까지의 임시 bridge다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as registry from '../../agents/core/persona-registry'
import * as personaData from '../../agents/seed/persona-data'

const ROOT = join(__dirname, '../..')
const generatorSrc = readFileSync(join(ROOT, 'agents/seed/generator.ts'), 'utf8')
const registrySrc = readFileSync(join(ROOT, 'agents/core/persona-registry.ts'), 'utf8')

describe('registry seed bridge — 원본과 동일', () => {
  it('79명 전수 동일 (registry 경유 vs 원본 직접)', () => {
    const ids = personaData.getAllPersonaIds()
    expect(ids).toHaveLength(79)
    const diffs: string[] = []
    for (const id of ids) {
      const viaRegistry = registry.getPersona(id)
      const viaOrigin = personaData.getPersona(id)
      if (JSON.stringify(viaRegistry) !== JSON.stringify(viaOrigin)) diffs.push(id)
      // 같은 객체 참조여야 한다 — 복사본이면 변환이 끼어든 것
      if (viaRegistry !== viaOrigin) diffs.push(`${id}(참조불일치)`)
    }
    expect(diffs).toEqual([])
  })

  it('getAllPersonaIds 배열 순서·내용 동일', () => {
    expect(registry.getAllPersonaIds()).toEqual(personaData.getAllPersonaIds())
  })

  it('getPersona 함수 참조 동일 (래핑 없음)', () => {
    expect(registry.getPersona).toBe(personaData.getPersona)
  })

  it('getAllPersonaIds 함수 참조 동일 (래핑 없음)', () => {
    expect(registry.getAllPersonaIds).toBe(personaData.getAllPersonaIds)
  })

  it('unknown id fallback 동작 보존 (PERSONAS.A)', () => {
    expect(registry.getPersona('__NOPE__')).toBe(personaData.getPersona('__NOPE__'))
    expect(registry.getPersona('__NOPE__').nickname).toBe(personaData.getPersona('A').nickname)
  })
})

describe('generator 전환 — 직접 의존 제거', () => {
  it("generator.ts에 './persona-data.js' 직접 import 0", () => {
    expect(generatorSrc).not.toContain("from './persona-data.js'")
    expect(generatorSrc).not.toContain('from "./persona-data.js"')
  })

  it('generator.ts가 registry를 통해 가져온다', () => {
    expect(generatorSrc).toContain("from '../core/persona-registry.js'")
    expect(generatorSrc).toMatch(/import \{[^}]*getPersona[^}]*\} from '\.\.\/core\/persona-registry\.js'/)
  })

  it('죽은 re-export 제거됨 (repo 소비자 0이었음)', () => {
    expect(generatorSrc).not.toContain('export { getAllPersonaIds, getPersona }')
    expect(generatorSrc).not.toContain('re-export for scheduler.ts')
  })

  it('생성 로직은 그대로 export된다 (PR-4 범위 밖)', () => {
    for (const sym of ['generatePost', 'generateComment', 'generateReply', 'getBotUser', 'DESIRE_PERSONA_MAP']) {
      expect(generatorSrc, sym).toContain(sym)
    }
  })
})

describe('임시 bridge임을 코드가 밝힌다', () => {
  it('registry에 PR-7 제거 예정이 명시돼 있다', () => {
    expect(registrySrc).toContain('Temporary bridge for PR-4 seed migration')
    expect(registrySrc).toContain('removed in PR-7')
  })

  it('bridge는 변환하지 않는다 — 원본을 그대로 재수출', () => {
    expect(registrySrc).toMatch(/export \{ getPersona, getAllPersonaIds, type Persona \} from '\.\.\/seed\/persona-data\.js'/)
  })
})
