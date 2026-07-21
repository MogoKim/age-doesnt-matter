/**
 * 매거진 SEO 키워드 — full 수집 러너 (2패스 + 병합 + checkpoint)
 *
 * // LOCAL ONLY — 1회성 수집 실행. cron/GitHub Actions/runner.ts 미등록. DB write 없음.
 *                 import 시 자동 실행 안 함(아래 isMain 가드). `npx tsx ...run-full-collect.ts`로만 실행.
 *
 * Pass A: SEED_KEYWORDS 52개 · 축소 매트릭스 · depth2 · cap200 · throttle900
 * Pass B: 부부성건강 시드 · includeSyllable:true · depth2 · cap200 · throttle900 (커버리지 보강)
 * 병합  : normalized 기준 dedup(demandSignal 합산 + relatedKeywords 합집합 + score 재계산)
 * 백업  : 100 fetch마다 .keyword-universe.checkpoint.json (성공 완료 시 삭제 / 실패·차단 시 보존)
 * 산출  : agents/magazine/data/keyword-universe.json (raw universe 전량, no_publish 포함)
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import {
  AutocompleteBlockedError,
  expandKeywords,
  fetchAutocomplete,
  type CheckpointState,
  type ExpandStats,
} from './autocomplete-collector.js'
import { SEED_KEYWORDS } from './seeds.js'
import { computeScore, DEFAULT_SCORE_PARAMS } from './scorer.js'
import type { KeywordNode } from './scorer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const OUTPUT_PATH = path.join(DATA_DIR, 'keyword-universe.json')
const CHECKPOINT_PATH = path.join(DATA_DIR, '.keyword-universe.checkpoint.json')

const RUN_PARAMS = { maxDepth: 2, perClusterCap: 200, throttleMs: 900 }
const CHECKPOINT_EVERY = 100

/** normalized 기준 병합 — demandSignal 합산 + relatedKeywords 합집합 + score 재계산 */
function mergeByNormalized(nodes: KeywordNode[]): KeywordNode[] {
  const map = new Map<string, KeywordNode>()
  for (const n of nodes) {
    const existing = map.get(n.normalized)
    if (!existing) {
      map.set(n.normalized, { ...n, relatedKeywords: [...n.relatedKeywords] })
      continue
    }
    existing.demandSignal += n.demandSignal
    for (const r of n.relatedKeywords) {
      if (!existing.relatedKeywords.includes(r)) existing.relatedKeywords.push(r)
    }
  }
  const out = [...map.values()]
  for (const node of out) node.score = computeScore(node, DEFAULT_SCORE_PARAMS)
  return out
}

function countBy(nodes: KeywordNode[], key: (n: KeywordNode) => string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const n of nodes) m[key(n)] = (m[key(n)] ?? 0) + 1
  return m
}

async function saveCheckpoint(phase: 'A' | 'B', nodes: KeywordNode[], stats: ExpandStats): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  const state: CheckpointState & { phase: string; savedAt: string } = {
    phase,
    savedAt: new Date().toISOString(),
    nodes,
    pendingQueue: [],
    stats,
  }
  await writeFile(CHECKPOINT_PATH, JSON.stringify(state))
}

export async function runFullCollect(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })

  // 시작 전 차단 사전 점검 (1회)
  try {
    await fetchAutocomplete('갱년기')
  } catch (err) {
    if (err instanceof AutocompleteBlockedError) {
      console.error('[full] 시작 전 차단 감지 — 중단:', err.message)
      process.exit(2)
    }
    throw err
  }

  const t0 = Date.now()
  let passANodes: KeywordNode[] = []

  try {
    // ── Pass A: 전체 52시드 · 축소 매트릭스 ──
    console.log('[full] Pass A 시작 — 52시드 축소 매트릭스')
    const resA = await expandKeywords(SEED_KEYWORDS, {
      ...RUN_PARAMS,
      checkpointEveryNFetches: CHECKPOINT_EVERY,
      onCheckpoint: async (st) => saveCheckpoint('A', st.nodes, st.stats),
    })
    passANodes = resA.nodes
    console.log(`[full] Pass A 완료 — ${resA.nodes.length}개 / fetch ${resA.stats.fetchCount} / ${(resA.stats.elapsedMs / 60000).toFixed(1)}분`)

    // ── Pass B: 부부성건강 시드 · 풀 매트릭스(음절 포함) ──
    const passBSeeds = SEED_KEYWORDS.filter((s) => s.cluster === '부부성건강')
    console.log(`[full] Pass B 시작 — 부부성건강 ${passBSeeds.length}시드 includeSyllable`)
    const resB = await expandKeywords(passBSeeds, {
      ...RUN_PARAMS,
      variantOptions: { includeSyllable: true },
      checkpointEveryNFetches: CHECKPOINT_EVERY,
      onCheckpoint: async (st) => saveCheckpoint('B', [...passANodes, ...st.nodes], st.stats),
    })
    console.log(`[full] Pass B 완료 — ${resB.nodes.length}개 / fetch ${resB.stats.fetchCount} / ${(resB.stats.elapsedMs / 60000).toFixed(1)}분`)

    // ── 병합 ──
    const merged = mergeByNormalized([...resA.nodes, ...resB.nodes])

    const universe = {
      meta: {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        sources: ['autocomplete'] as const,
        passASeedCount: SEED_KEYWORDS.length,
        passBSeedCount: passBSeeds.length,
        totalKeywords: merged.length,
        params: { ...RUN_PARAMS, checkpointEvery: CHECKPOINT_EVERY },
        passAStats: resA.stats,
        passBStats: resB.stats,
        policyCounts: countBy(merged, (n) => n.publishPolicy),
        clusterCounts: countBy(merged, (n) => n.cluster),
        elapsedMs: Date.now() - t0,
      },
      keywords: merged,
    }

    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(OUTPUT_PATH, JSON.stringify(universe, null, 2))
    await rm(CHECKPOINT_PATH, { force: true }) // 성공 완료 → 백업 삭제

    console.log(`[full] 완료 — ${merged.length}개 → ${OUTPUT_PATH}`)
    console.log('[full] policy=', JSON.stringify(universe.meta.policyCounts))
    console.log('[full] cluster=', JSON.stringify(universe.meta.clusterCounts))
    console.log(`[full] 총 ${((Date.now() - t0) / 60000).toFixed(1)}분 / checkpoint 삭제됨`)
  } catch (err) {
    if (err instanceof AutocompleteBlockedError) {
      console.error('[full] 수집 중 차단 감지 — 즉시 중단. checkpoint 보존:', CHECKPOINT_PATH)
      console.error('[full] 사유:', err.message)
      process.exit(2)
    }
    console.error('[full] 에러 — checkpoint 보존:', CHECKPOINT_PATH, err)
    process.exit(1)
  }
}

// import 시 자동 실행 안 함 — 직접 실행(npx tsx ...)일 때만
const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  void runFullCollect()
}
