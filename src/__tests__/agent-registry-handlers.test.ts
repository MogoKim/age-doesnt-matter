import { describe, expect, it } from 'vitest'

import { HANDLER_REGISTRY, HANDLER_GROUPS } from '@/lib/agent-registry'
import { extractHandlers, extractWorkflowKeys } from '../../scripts/check-cron-links'

/**
 * 어드민 레지스트리 ↔ runner.ts HANDLERS 정합성.
 *
 * 계약은 한 방향뿐이다 — **registry ⊆ runner**. runner 에 없는 키를 레지스트리에 두면
 * 어드민 현황 탭이 없는 작업을 돌아가는 것처럼 보여준다. 반대 방향(runner ⊆ registry)은
 * 계약이 아니므로 여기서 강제하지 않는다.
 *
 * HANDLER_GROUPS 는 레지스트리를 팀별로 묶어 보여주는 뷰라, 키 집합이 레지스트리와
 * **정확히 같아야** 한다. 어긋나면 어드민에서 항목이 사라지거나 두 번 뜬다.
 */

const handlerKeys = new Set(extractHandlers().map((h) => h.key))
const registryKeys = HANDLER_REGISTRY.map((h) => h.key)

describe('HANDLER_REGISTRY ⊆ runner HANDLERS', () => {
  it('레지스트리의 모든 키가 실제 핸들러로 존재한다', () => {
    const ghosts = registryKeys.filter((k) => !handlerKeys.has(k))
    expect(ghosts, `runner 에 없는 레지스트리 키: ${ghosts.join(', ')}`).toEqual([])
  })

  it('레지스트리 키에 중복이 없다', () => {
    const dupes = registryKeys.filter((k, i) => registryKeys.indexOf(k) !== i)
    expect(dupes, `중복 키: ${dupes.join(', ')}`).toEqual([])
  })
})

describe('HANDLER_GROUPS 는 레지스트리의 뷰다', () => {
  const groupKeys = HANDLER_GROUPS.flatMap((g) => g.keys)

  it('그룹 키 집합이 레지스트리 키 집합과 정확히 같다', () => {
    // 그룹에만 있으면 어드민이 없는 항목을 그리고, 레지스트리에만 있으면 어디에도 안 뜬다.
    const onlyInGroups = [...new Set(groupKeys)].filter((k) => !registryKeys.includes(k)).sort()
    const onlyInRegistry = registryKeys.filter((k) => !groupKeys.includes(k)).sort()
    expect({ onlyInGroups, onlyInRegistry }).toEqual({ onlyInGroups: [], onlyInRegistry: [] })
  })

  it('그룹 전체에서 키 중복이 없다', () => {
    // 두 팀에 같은 키가 들어가면 어드민에 두 번 뜬다.
    const dupes = groupKeys.filter((k, i) => groupKeys.indexOf(k) !== i)
    expect(dupes, `중복 키: ${dupes.join(', ')}`).toEqual([])
  })
})

describe('삭제된 핸들러의 잔재', () => {
  const DELETED = [
    'cmo:knowledge-responder', 'cmo:social-poster-visual',
    // R4 ORG_THEATER 10개 (2026-09-08) — 재등록 방지선
    'cdo:engagement-optimizer', 'ceo:morning-cycle', 'ceo:morning-sns-briefing',
    'ceo:weekly-report', 'cfo:revenue-tracker', 'cpo:feature-tracker',
    'cpo:journey-analyzer', 'cpo:persona-diversity-checker', 'cpo:ux-analyzer',
    'strategist:user-deep-analysis',
    // R4 SUPERSEDED 4개 (2026-09-08) — 대체 경로가 있어 제거됨
    'cdo:kpi-collector', 'cfo:cost-tracker', 'cto:arch-review', 'cto:garbage-collect',
    'cto:qa-verify',
    // R4 GROWTH_LEGACY 13개 (2026-09-08) — 재등록 방지선
    'cmo:trend-analyzer', 'cmo:source-expander', 'cmo:content-gap-finder', 'cmo:humor-curator',
    'cmo:caregiving-curator', 'cmo:channel-seeder', 'cmo:google-ads-report', 'cmo:social-poster',
    'cmo:social-metrics', 'cmo:threads-token-refresh', 'cmo:seo-optimizer', 'cmo:band-manager',
    'cmo:health-anxiety-responder',
    // R4 SEED 봇 + COO 참여 유도 11개 (2026-09-09) — 재등록 방지선
    'seed:scheduler', 'seed:micro', 'seed:killer-post', 'seed:viral-waves',
    'coo:comment-activator', 'coo:reply-chain-driver', 'coo:connection-facilitator',
    'coo:author-reply-dryrun', 'coo:job-matcher', 'coo:persona-matcher-dryrun',
    'controversy-chain:execute',
    // 합성 댓글 경로 (2026-09-09) — 봇 댓글 생성 재등록 방지선
    'cafe_crawler:wave-process', 'cafe_crawler:user-post-wave-process',
    // B-5 관측·리포트 (2026-09-09)
    'design:ads-loop',
    // R4 B-3 외부 카페·Google Sheet 공급망 17개 (2026-09-09) — 재등록 방지선
    'community:sheet-scrape', 'community:dawn-sheet-scrape', 'community:dawn-sheet-cleanup',
    'community:fmkorea-scrape', 'community:navercafe-scrape',
    'cafe_crawler:image-route', 'cafe_crawler:content-curate', 'cafe_crawler:popular-curate',
    'cafe_crawler:brief-monitor', 'cafe_crawler:daily-brief-fallback', 'cafe_crawler:evening-brief-safety',
    'cafe_crawler:cafe-pipeline', 'cafe_crawler:trend-analysis', 'cafe_crawler:magazine-generate',
    'cafe_crawler:popular-sync', 'cafe_crawler:external-crawl', 'cafe:session-refresh',
  ] as const

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

  it('어떤 워크플로우도 이 키를 실제로 호출하지 않는다', () => {
    // 죽은 job 이 남아 있으면 dispatch 시 runner 가 "알 수 없는 핸들러"로 죽는다.
    //
    // 파일 하나만 읽거나 `key.split(':')[1]` 로 본문을 문자열 검색하면 두 방향으로 틀린다 —
    // 다른 워크플로우의 살아 있는 호출을 놓치고, 주석·설명·역사 문구까지 실패로 잡는다.
    // `extractWorkflowKeys` 는 `.github/workflows/**` 전체를 줄 단위로 읽어 주석을 걸러내고
    // **실제 tsx 실행 형태만** `agent:task` 키로 뽑으므로, 이 계약에 정확히 맞는 도구다.
    const called = extractWorkflowKeys()
    const alive = DELETED.filter((key) => called.has(key))
    expect(alive, `워크플로우가 아직 호출하는 삭제된 키: ${alive.join(', ')}`).toEqual([])
  })
})
