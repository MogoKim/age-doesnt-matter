import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { HANDLER_REGISTRY, HANDLER_GROUPS } from '@/lib/agent-registry'
import { extractHandlers } from '../../scripts/check-cron-links'

/**
 * 어드민 레지스트리 ↔ runner.ts HANDLERS 정합성.
 *
 * runner 에 없는 키를 레지스트리에 두면 어드민 현황 탭이 **없는 작업을 돌아가는 것처럼**
 * 보여준다. 실제로 `cmo:knowledge-responder` 와 `cmo:social-poster-visual` 은
 * 2026-05-15 에 코드가 지워졌는데도 레지스트리에 남아 GHA 작업으로 표시됐고,
 * 워크플로우에도 죽은 job 이 그대로 있었다. 세 곳이 서로 다른 사실을 말한 셈이다.
 *
 * 방향은 **registry ⊆ runner 한쪽만** 고정한다. 반대(runner ⊆ registry)는 계약이 아니다 —
 * 어드민에 굳이 띄우지 않는 핸들러가 있다(실측: runner 79 · registry 53).
 */

const handlerKeys = new Set(extractHandlers().map((h) => h.key))
const registryKeys = HANDLER_REGISTRY.map((h) => h.key)

describe('HANDLER_REGISTRY ⊆ runner HANDLERS', () => {
  it('레지스트리의 모든 키가 실제 핸들러로 존재한다', () => {
    const ghosts = registryKeys.filter((k) => !handlerKeys.has(k))
    expect(ghosts, `runner 에 없는 레지스트리 키: ${ghosts.join(', ')}`).toEqual([])
  })

  it('HANDLER_GROUPS 의 모든 키도 실제 핸들러로 존재한다', () => {
    const ghosts = HANDLER_GROUPS.flatMap((g) => g.keys).filter((k) => !handlerKeys.has(k))
    expect(ghosts, `runner 에 없는 그룹 키: ${ghosts.join(', ')}`).toEqual([])
  })

  it('레지스트리 키에 중복이 없다', () => {
    expect(registryKeys).toHaveLength(new Set(registryKeys).size)
  })

  it('반대 방향은 계약이 아니다 — runner 가 레지스트리보다 크다', () => {
    // 이 테스트는 "registry ⊆ runner 만 고정한다"는 결정을 눈에 보이게 남긴다.
    // 언젠가 1:1 로 맞추기로 하면 여기가 먼저 깨진다.
    expect(handlerKeys.size).toBeGreaterThan(registryKeys.length)
  })
})

describe('삭제된 두 핸들러의 잔재', () => {
  const DELETED = ['cmo:knowledge-responder', 'cmo:social-poster-visual'] as const

  it('runner 에 없다', () => {
    for (const key of DELETED) expect(handlerKeys.has(key), key).toBe(false)
  })

  it('레지스트리·그룹 어디에도 없다', () => {
    const groupKeys = HANDLER_GROUPS.flatMap((g) => g.keys)
    for (const key of DELETED) {
      expect(registryKeys, key).not.toContain(key)
      expect(groupKeys, key).not.toContain(key)
    }
  })

  it('워크플로우에도 없다', () => {
    // 죽은 job 이 남아 있으면 dispatch 시 runner 가 "알 수 없는 핸들러"로 죽는다.
    const yaml = readFileSync('.github/workflows/agents-social.yml', 'utf-8')
    for (const key of DELETED) {
      expect(yaml, key).not.toContain(key.split(':')[1])
    }
  })
})
