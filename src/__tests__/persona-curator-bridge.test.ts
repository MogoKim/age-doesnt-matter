/**
 * curator-users 경로 registry 전환 회귀 가드 (PR-5a / L-PERSONA-SSOT)
 *
 * curator-users.ts가 curator-shared.ts에서 PERSONAS/PersonaMatch를 직접 가져오던 경로를
 * 끊고 registry를 통해 보게 바꿨다. registry는 변환하지 않고 원본을 그대로 재수출하므로
 * 동일성은 "같은 참조"로 구조적으로 보장된다.
 *
 * ⚠️ PR-5a는 curator 계열 전체 전환이 아니다. content-curator · popular-curator는
 * persona 외 텍스트 유틸·보드 라우팅도 함께 쓰기 때문에 PR-7(persona 블록 분리)에서 다룬다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as registry from '../../agents/core/persona-registry'
// PR-7e: facade(curator-shared) 제거. 비교 대상은 정의 원본이다.
// namespace import는 ALLOW — 'registry vs 원본 동일성' 증명이 이 파일의 존재 이유다.
import * as curatorPersonas from '../../agents/cafe/curator-personas'

const ROOT = join(__dirname, '../..')
const curatorUsersSrc = readFileSync(join(ROOT, 'agents/cafe/curator-users.ts'), 'utf8')
const registrySrc = readFileSync(join(ROOT, 'agents/core/persona-registry.ts'), 'utf8')

describe('registry curator bridge — 원본과 동일', () => {
  it('225명 전수 동일 (registry 경유 vs 원본 직접)', () => {
    expect(curatorPersonas.PERSONAS).toHaveLength(225)
    expect(registry.PERSONAS).toHaveLength(curatorPersonas.PERSONAS.length)
    const diffs: string[] = []
    for (let i = 0; i < curatorPersonas.PERSONAS.length; i++) {
      const a = registry.PERSONAS[i]
      const b = curatorPersonas.PERSONAS[i]
      if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${b.id}(값)`)
      if (a !== b) diffs.push(`${b.id}(참조)`)
    }
    expect(diffs).toEqual([])
  })

  it('PERSONAS 배열 참조 동일 (복사본 아님)', () => {
    expect(registry.PERSONAS).toBe(curatorPersonas.PERSONAS)
  })

  it('id 목록·순서 동일', () => {
    expect(registry.PERSONAS.map(p => p.id)).toEqual(curatorPersonas.PERSONAS.map(p => p.id))
  })

  it('PersonaMatch 타입 계약 유지 (필수 필드 존재)', () => {
    const p = registry.PERSONAS[0]
    for (const f of ['id', 'nickname', 'board', 'style', 'patterns', 'topics', 'quirks', 'examples'] as const) {
      expect(p, f).toHaveProperty(f)
    }
    expect(typeof p.id).toBe('string')
    expect(typeof p.nickname).toBe('string')
    expect(Array.isArray(p.patterns)).toBe(true)
  })
})

describe('id → nickname fallback (getCuratorBotUser 로직 보존)', () => {
  /** curator-users.ts:11 과 동일한 식 — registry 경유로도 같은 값이 나와야 한다 */
  const lookup = (src: typeof registry.PERSONAS, id: string) =>
    src.find(p => p.id === id)?.nickname ?? id

  it('알려진 id는 nickname 반환 — 전수 동일', () => {
    const diffs: string[] = []
    for (const p of curatorPersonas.PERSONAS) {
      if (lookup(registry.PERSONAS, p.id) !== lookup(curatorPersonas.PERSONAS, p.id)) diffs.push(p.id)
    }
    expect(diffs).toEqual([])
  })

  it('알 수 없는 id는 id 자신으로 fallback — 양쪽 동일', () => {
    for (const bogus of ['__NOPE__', 'ZZZ999', '']) {
      expect(lookup(registry.PERSONAS, bogus)).toBe(lookup(curatorPersonas.PERSONAS, bogus))
      expect(lookup(registry.PERSONAS, bogus)).toBe(bogus)
    }
  })
})

describe('curator-users 전환 — 직접 의존 제거', () => {
  it("curator-users.ts에 './curator-shared' 직접 import 0", () => {
    expect(curatorUsersSrc).not.toContain("from './curator-shared.js'")
    expect(curatorUsersSrc).not.toContain('from "./curator-shared.js"')
  })

  it('registry를 통해 가져온다', () => {
    expect(curatorUsersSrc).toMatch(
      /import \{ PERSONAS, type PersonaMatch \} from '\.\.\/core\/persona-registry\.js'/,
    )
  })

  it('DB 로직은 그대로다 (PR-5a 범위 밖)', () => {
    for (const sym of [
      'getCuratorBotUser', 'countTodayPostsByPersona', 'AUTHOR_DAILY_POST_CAP',
      'prisma.user.upsert', 'P2002', 'nickname conflict',
    ]) {
      expect(curatorUsersSrc, sym).toContain(sym)
    }
  })
})

describe('임시 bridge임을 코드가 밝힌다', () => {
  it('registry에 임시 bridge / 제거 예정이 명시돼 있다', () => {
    expect(registrySrc).toContain('Temporary bridge for curator persona migration')
    expect(registrySrc).toContain('removed in PR-7e')
  })

  it('curator-shared에는 persona 심볼 re-export가 없다 (PR-7e 회귀 가드)', () => {
    const sharedSrc = readFileSync(join(ROOT, 'agents/cafe/curator-shared.ts'), 'utf8')
    const PERSONA_SYMS = [
      'PERSONAS', 'PersonaMatch', 'DESIRE_PERSONA_MAP', 'MENOPAUSE_CURATOR_PERSONA_IDS',
      'isMenopauseCuratorPersona', 'personasForRoutingBoard', 'personaIdsForRoutingBoard',
      'personaBoardForRouting', 'matchPersona',
    ]
    // export { … } from './curator-personas.js' 형태가 남아 있으면 facade가 되살아난 것
    for (const m of sharedSrc.matchAll(/export\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const names = m[1].split(',').map(x => x.trim().replace(/^type /, '')).filter(Boolean)
      expect(names.filter(n => PERSONA_SYMS.includes(n))).toEqual([])
    }
    // star re-export도 금지 — 심볼을 숨긴 채 같은 효과를 낸다
    expect(sharedSrc).not.toMatch(/export\s*\*\s*from\s*'\.\/curator-personas\.js'/)
  })

  it('registry는 조립·재수출 모두 정의 원본을 본다 (facade 경유 0)', () => {
    // 멀티라인 `export { … } from '…'` 블록까지 잡으려면 줄바꿈을 넘어야 한다
    const mods = [...registrySrc.matchAll(/(?:import|export)\s[\s\S]*?from\s*'([^']+)'/g)].map(m => m[1])
    expect(mods.filter(m => m.includes('curator-shared'))).toEqual([])
    // 조립용 import(L21) + 재수출 블록 = 최소 2회
    expect(mods.filter(m => m.includes('curator-personas')).length).toBeGreaterThanOrEqual(2)
  })

  it('bridge는 변환하지 않는다 — 정의 원본(curator-personas)을 그대로 재수출', () => {
    // PR-7c: facade(curator-shared)를 거치지 않고 정의 원본에서 직접 재수출한다.
    expect(registrySrc).toMatch(/from '\.\.\/cafe\/curator-personas\.js'/)
    // 재수출 블록 안에 PR-7c가 요구한 9심볼이 전부 있다
    const block = registrySrc.match(/export \{([^}]*)\} from '\.\.\/cafe\/curator-personas\.js'/)
    expect(block).not.toBeNull()
    const names = (block![1]).split(',').map(x => x.trim().replace(/^type /, '')).filter(Boolean)
    for (const sym of [
      'PERSONAS', 'PersonaMatch', 'DESIRE_PERSONA_MAP', 'MENOPAUSE_CURATOR_PERSONA_IDS',
      'isMenopauseCuratorPersona', 'personasForRoutingBoard', 'personaIdsForRoutingBoard',
      'personaBoardForRouting', 'matchPersona',
    ]) {
      expect(names).toContain(sym)
    }
  })

  it('발행 경로(content/popular-curator)는 persona를 registry에서만 가져온다', () => {
    // PR-7c 회귀 가드: curator-shared로 되돌아가면 여기서 잡힌다
    const PERSONA_SYMS = [
      'PERSONAS', 'PersonaMatch', 'DESIRE_PERSONA_MAP', 'matchPersona',
      'personaBoardForRouting', 'personaIdsForRoutingBoard', 'personasForRoutingBoard',
    ]
    for (const f of ['agents/cafe/content-curator.ts', 'agents/cafe/popular-curator.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
        const names = m[1].split(',').map(x => x.trim().replace(/^type /, '')).filter(Boolean)
        const hit = names.filter(n => PERSONA_SYMS.includes(n))
        if (m[2].includes('curator-shared')) expect(hit).toEqual([])
        // 정의 원본 직접 import도 금지 — registry가 유일한 진입점이다
        if (m[2].includes('curator-personas')) expect(hit).toEqual([])
      }
    }
  })
})
