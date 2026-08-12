/**
 * PR-7d — persona-matcher-profiles가 registry 경유로 바뀌어도 출력이 그대로인지 고정한다.
 *
 * ⚠️ 비교 대상은 **전환 전에 떠 둔 fixture**다. 여기서 registry를 다시 계산해 비교하면
 * registry vs registry가 되어 아무것도 증명하지 못한다(PR-3에서 지적된 함정).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildAllProfiles, inferFamilyStatus } from '../../agents/coo/persona-matcher-profiles'
import * as registry from '../../agents/core/persona-registry'

type Fixture = {
  profiles: ReturnType<typeof buildAllProfiles>
  infer: Array<[string, string]>
}
const fixture: Fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'src/__tests__/fixtures/persona-matcher-profiles-snapshot.json'), 'utf8'),
)

describe('buildAllProfiles — 전환 전 fixture와 byte-identical', () => {
  const now = buildAllProfiles()

  it('건수가 304건(bot 79 + curator 225)으로 같다', () => {
    expect(now).toHaveLength(fixture.profiles.length)
    expect(now).toHaveLength(304)
  })

  it('직렬화 결과가 완전히 같다', () => {
    expect(JSON.stringify(now)).toBe(JSON.stringify(fixture.profiles))
  })

  it('key별 전 필드가 같다 (어긋난 필드를 이름으로 보고)', () => {
    const byKey = new Map(now.map(p => [p.key, p]))
    const diffs: string[] = []
    for (const old of fixture.profiles) {
      const cur = byKey.get(old.key)
      if (!cur) { diffs.push(`${old.key}: 누락`); continue }
      const fields = (Object.keys(old) as Array<keyof typeof old>)
        .filter(k => JSON.stringify(old[k]) !== JSON.stringify(cur[k]))
      if (fields.length) diffs.push(`${old.key}: ${fields.join(',')}`)
    }
    expect(diffs).toEqual([])
  })

  it('origin 분포가 같다', () => {
    const dist = (ps: typeof now) => ps.reduce<Record<string, number>>((m, p) => { m[p.origin] = (m[p.origin] ?? 0) + 1; return m }, {})
    expect(dist(now)).toEqual(dist(fixture.profiles))
  })

  it('reactionOnly(BI~BW 스크래퍼봇)가 그대로 유지된다', () => {
    const olds = fixture.profiles.filter(p => p.reactionOnly).map(p => p.key).sort()
    expect(now.filter(p => p.reactionOnly).map(p => p.key).sort()).toEqual(olds)
    expect(olds.length).toBeGreaterThan(0)
  })
})

describe('inferFamilyStatus — 휴리스틱 불변', () => {
  it('fixture 케이스 결과가 같다', () => {
    for (const [text, expected] of fixture.infer) expect(inferFamilyStatus(text)).toBe(expected)
  })

  it('사별/이혼/혼자 신호가 기혼 신호보다 앞선다 (calibration 5 유지)', () => {
    expect(inferFamilyStatus('남편을 먼저 보내고 아들과 산다')).toBe('widowed')
    expect(inferFamilyStatus('이혼 후 딸과 지낸다')).toBe('divorced')
    expect(inferFamilyStatus('혼자 산 지 10년, 손주 얘기만 듣는다')).toBe('solo')
  })
})

describe('의존 방향 — profiles → registry 단방향', () => {
  it('registry가 profiles의 것을 그대로 재수출한다 (참조 동일)', () => {
    expect(inferFamilyStatus).toBe(registry.inferFamilyStatus)
  })

  it('registry는 persona-matcher-profiles를 import하지 않는다', () => {
    const src = readFileSync(join(process.cwd(), 'agents/core/persona-registry.ts'), 'utf8')
    const imports = [...src.matchAll(/^\s*import\s[^\n]*from\s*'([^']+)'/gm)].map(m => m[1])
    expect(imports.filter(m => m.includes('persona-matcher-profiles'))).toEqual([])
  })

  it('profiles는 원본(persona-data · curator-shared)을 직접 import하지 않는다', () => {
    const src = readFileSync(join(process.cwd(), 'agents/coo/persona-matcher-profiles.ts'), 'utf8')
    const imports = [...src.matchAll(/^\s*import\s[^\n]*from\s*'([^']+)'/gm)].map(m => m[1])
    expect(imports.filter(m => /persona-data|curator-shared|curator-personas/.test(m))).toEqual([])
    expect(imports).toContain('../core/persona-registry.js')
  })
})
