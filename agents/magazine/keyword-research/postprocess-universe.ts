/**
 * 매거진 키워드 universe — 라벨 재분류 postprocess (재수집 없음)
 *
 * // LOCAL ONLY — 1회성 보정. cron/GHA/runner.ts 미등록. DB write 없음. 네트워크 없음.
 *                 import 시 자동 실행 안 함(isMain 가드). `npx tsx ...postprocess-universe.ts`로만 실행.
 *
 * 적용: ① inferCluster/classifyPublishPolicy 재적용(애인→장애인 오탐 픽스 반영)
 *       ② parentKeyword 체인에 off_brand 조상 있는 publish → no_publish_research 강등(lineage)
 *       ③ demandSignal 유지, score는 새 cluster/sensitivity 기준 재계산
 *       ④ meta.policyCounts/clusterCounts/totalKeywords 갱신
 *       ⑤ 원본 백업(data/ 내 — gitignore 대상)
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import {
  classifyPublishPolicy,
  computeScore,
  evaluateSensitivity,
  inferCluster,
  DEFAULT_SCORE_PARAMS,
} from './scorer.js'
import type { KeywordNode } from './scorer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const UNIVERSE_PATH = path.join(DATA_DIR, 'keyword-universe.json')

interface Universe {
  meta: Record<string, unknown>
  keywords: KeywordNode[]
}

function countBy(nodes: KeywordNode[], key: (n: KeywordNode) => string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const n of nodes) m[key(n)] = (m[key(n)] ?? 0) + 1
  return m
}

/** 자기 키워드가 off_brand로 분류되는가 (조상 판정용) */
function isOwnOffBrand(keyword: string): boolean {
  return (
    classifyPublishPolicy(keyword, evaluateSensitivity(keyword)).publishPolicy ===
    'no_publish_off_brand'
  )
}

export async function postprocessUniverse(): Promise<void> {
  const raw = await readFile(UNIVERSE_PATH, 'utf-8')
  const universe = JSON.parse(raw) as Universe
  const nodes = universe.keywords

  const before = {
    total: nodes.length,
    policy: countBy(nodes, (n) => n.publishPolicy),
    cluster: countBy(nodes, (n) => n.cluster),
  }

  // 백업 (data/ 내부 → gitignore 대상)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(DATA_DIR, `keyword-universe.backup-${stamp}.json`)
  await writeFile(backupPath, raw)

  const byKeyword = new Map<string, KeywordNode>()
  for (const n of nodes) byKeyword.set(n.keyword, n)

  let policyChanged = 0
  let clusterChanged = 0
  let lineageDowngraded = 0

  // ① 노드별 재분류 (cluster/sensitivity/publishPolicy/titlePolicy)
  for (const n of nodes) {
    const inferred = inferCluster(n.keyword)
    const newCluster = inferred === 'uncategorized' ? n.cluster : inferred
    const newSensitivity = evaluateSensitivity(n.keyword)
    const { publishPolicy, titlePolicy } = classifyPublishPolicy(n.keyword, newSensitivity)

    if (newCluster !== n.cluster) clusterChanged += 1
    if (publishPolicy !== n.publishPolicy) policyChanged += 1

    n.cluster = newCluster
    n.sensitivity = newSensitivity
    n.publishPolicy = publishPolicy
    n.titlePolicy = titlePolicy
  }

  // ② lineage: publish인데 parentKeyword 체인에 off_brand 조상 있으면 강등
  for (const n of nodes) {
    if (n.publishPolicy !== 'publish') continue
    const visited = new Set<string>()
    let parentKw = n.parentKeyword
    let blocked = false
    while (parentKw && !visited.has(parentKw)) {
      visited.add(parentKw)
      if (isOwnOffBrand(parentKw)) {
        blocked = true
        break
      }
      const parentNode = byKeyword.get(parentKw)
      parentKw = parentNode ? parentNode.parentKeyword : null
    }
    if (blocked) {
      n.publishPolicy = 'no_publish_research'
      n.titlePolicy = 'as_is'
      lineageDowngraded += 1
    }
  }

  // ③ score 재계산 (demandSignal 유지)
  for (const n of nodes) n.score = computeScore(n, DEFAULT_SCORE_PARAMS)

  // ④ meta 갱신
  const after = {
    total: nodes.length,
    policy: countBy(nodes, (n) => n.publishPolicy),
    cluster: countBy(nodes, (n) => n.cluster),
  }
  universe.meta.totalKeywords = nodes.length
  universe.meta.policyCounts = after.policy
  universe.meta.clusterCounts = after.cluster
  universe.meta.postprocessedAt = new Date().toISOString()
  universe.meta.postprocess = {
    backup: path.basename(backupPath),
    clusterChanged,
    policyChanged,
    lineageDowngraded,
    scoreRecomputed: nodes.length,
    note: 'demandSignal 유지, score는 새 cluster/sensitivity 기준 재계산',
  }

  await writeFile(UNIVERSE_PATH, JSON.stringify(universe, null, 2))

  console.log('[postprocess] 백업:', path.basename(backupPath))
  console.log('[postprocess] cluster 변경:', clusterChanged, '/ policy 변경:', policyChanged, '/ lineage 강등:', lineageDowngraded)
  console.log('[postprocess] BEFORE policy:', JSON.stringify(before.policy))
  console.log('[postprocess] AFTER  policy:', JSON.stringify(after.policy))
  console.log('[postprocess] BEFORE cluster:', JSON.stringify(before.cluster))
  console.log('[postprocess] AFTER  cluster:', JSON.stringify(after.cluster))
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  void postprocessUniverse()
}
