/**
 * wave / user-post-wave 경로 registry 전환 회귀 가드 (PR-6 / L-PERSONA-SSOT)
 *
 * 두 파일이 persona-data.ts를 직접 보던 경로를 끊고 registry를 통해 보게 바꿨다.
 * registry는 PR-4에서 만든 seed bridge를 그대로 재사용한다 — 새 bridge·adapter 0개.
 * 동일성은 "같은 함수 참조"로 구조적으로 보장된다.
 *
 * ⚠️ 5분 주기 대량 생성 경로다. 원본 export 제거와 CI 가드는 PR-7에서 닫는다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as registry from '../../agents/core/persona-registry'
import * as personaData from '../../agents/seed/persona-data'

const ROOT = join(__dirname, '../..')
const waveSrc = readFileSync(join(ROOT, 'agents/cafe/wave-processor.ts'), 'utf8')
const userWaveSrc = readFileSync(join(ROOT, 'agents/cafe/user-post-wave-processor.ts'), 'utf8')
const registrySrc = readFileSync(join(ROOT, 'agents/core/persona-registry.ts'), 'utf8')

describe('registry bridge — 함수 참조 동일 (래핑 없음)', () => {
  it('getAllPersonaIds 참조 동일', () => {
    expect(registry.getAllPersonaIds).toBe(personaData.getAllPersonaIds)
  })

  it('getPersona 참조 동일', () => {
    expect(registry.getPersona).toBe(personaData.getPersona)
  })

  it('getAllPersonaIds() 79건 순서·내용 동일', () => {
    const viaRegistry = registry.getAllPersonaIds()
    const viaOrigin = personaData.getAllPersonaIds()
    expect(viaRegistry).toHaveLength(79)
    expect(viaRegistry).toEqual(viaOrigin)
  })

  it('getPersona(id).nickname 79건 전수 동일', () => {
    const diffs: string[] = []
    for (const id of personaData.getAllPersonaIds()) {
      if (registry.getPersona(id).nickname !== personaData.getPersona(id).nickname) diffs.push(id)
      if (registry.getPersona(id) !== personaData.getPersona(id)) diffs.push(`${id}(참조)`)
    }
    expect(diffs).toEqual([])
  })
})

describe('wave 후보 풀 — 필터 결과 동일', () => {
  it('COMMENTER_PERSONA_IDS 동일 (wave-processor:33 재현)', () => {
    // const COMMENTER_PERSONA_IDS = getAllPersonaIds()
    expect(registry.getAllPersonaIds()).toEqual(personaData.getAllPersonaIds())
  })

  it('ALL_PERSONA_IDS 동일 (user-post-wave:37 재현 — EN*·N\\d* 제외)', () => {
    const filter = (ids: string[]) => ids.filter(id => !id.startsWith('EN') && !/^N\d/.test(id))
    const viaRegistry = filter(registry.getAllPersonaIds())
    const viaOrigin = filter(personaData.getAllPersonaIds())
    expect(viaRegistry).toEqual(viaOrigin)
    // 필터가 실제로 무언가를 거르는지도 고정 — 전량 통과면 검증 의미가 없다
    expect(viaRegistry.length).toBeLessThanOrEqual(registry.getAllPersonaIds().length)
    expect(viaRegistry.every(id => !id.startsWith('EN') && !/^N\d/.test(id))).toBe(true)
  })

  it('필터 후 Set 크기 동일 (user-post-wave:65 재현)', () => {
    const f = (ids: string[]) => new Set(ids.filter(id => !id.startsWith('EN') && !/^N\d/.test(id)))
    expect(f(registry.getAllPersonaIds()).size).toBe(f(personaData.getAllPersonaIds()).size)
  })
})

describe('두 파일 전환 — 직접 의존 제거', () => {
  it("wave-processor.ts에 persona-data 직접 import 0", () => {
    expect(waveSrc).not.toContain("from '../seed/persona-data.js'")
    expect(waveSrc).not.toContain('from "../seed/persona-data.js"')
  })

  it("user-post-wave-processor.ts에 persona-data 직접 import 0", () => {
    expect(userWaveSrc).not.toContain("from '../seed/persona-data.js'")
    expect(userWaveSrc).not.toContain('from "../seed/persona-data.js"')
  })

  it('둘 다 registry를 통해 가져온다', () => {
    expect(waveSrc).toMatch(/import \{ getAllPersonaIds \} from '\.\.\/core\/persona-registry\.js'/)
    expect(userWaveSrc).toMatch(/import \{ getAllPersonaIds, getPersona \} from '\.\.\/core\/persona-registry\.js'/)
  })
})

describe('범위 밖 로직 보존', () => {
  it('wave 생성/라우팅 심볼 유지', () => {
    for (const sym of ['getBotUser', 'replaceCafeReferences', 'COMMENTER_PERSONA_IDS']) {
      expect(waveSrc, sym).toContain(sym)
    }
  })

  it('legacy / v2 path 둘 다 살아 있다', () => {
    expect(waveSrc).toContain('legacy')
    expect(waveSrc).toMatch(/v2-E|COMMENT_WAVE_V2_ENABLED/)
  })

  it('user-post-wave 생성 심볼 유지', () => {
    for (const sym of ['getBotUser', 'generateUserPostComment', 'ALL_PERSONA_IDS', 'notifyAuthorOfBotComment']) {
      expect(userWaveSrc, sym).toContain(sym)
    }
  })
})

describe('새 bridge·adapter를 만들지 않았다', () => {
  it('registry는 PR-4 seed bridge를 그대로 재사용한다', () => {
    expect(registrySrc).toMatch(
      /export \{ getPersona, getAllPersonaIds, type Persona \} from '\.\.\/seed\/persona-data\.js'/,
    )
  })

  it('PR-6 전용 bridge가 추가되지 않았다', () => {
    expect(registrySrc).not.toContain('PR-6')
    // seed(PR-4) + curator(PR-5a) + SEED_PERSONAS 별칭(PR-7a) — PR-6은 하나도 더하지 않았다.
    // PR-7a에서 scripts/one-time-fix-posts.ts를 옮기며 seed PERSONAS 별칭이 추가돼 2→3이 됐다.
    const bridges = registrySrc.match(/^export \{[^}]*\} from '\.\.\//gm) ?? []
    expect(bridges).toHaveLength(3)
  })
})
