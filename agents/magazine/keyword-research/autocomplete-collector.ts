/**
 * 매거진 SEO 키워드 — 구글 자동완성 수집기 (BFS 확장)
 *
 * // LOCAL ONLY — 1회성 키워드 리서치 도구. cron/GitHub Actions/runner.ts 미등록.
 *                 네트워크 수집은 함수로만 제공하며 import 시 자동 실행하지 않는다.
 *
 * 소스: google.com/complete/search (JSON) — SERP 클릭/Playwright 아님.
 * 모든 키워드는 raw universe에 수집된다. 발행 여부는 scorer.classifyPublishPolicy가 결정.
 */

import {
  classifyPublishPolicy,
  computeScore,
  evaluateSensitivity,
  normalizeKeyword,
  DEFAULT_SCORE_PARAMS,
} from './scorer.js'
import type { ClusterId, Intent, KeywordNode, ScoreParams, SeedKeyword } from './scorer.js'
import { AGE_TOKENS, GENDER_TOKENS, INTENT_SUFFIX, SYLLABLE_SUFFIX } from './seeds.js'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 구글 자동완성 1회 호출 — 제안어 배열 반환 (실패 시 빈 배열) */
export async function fetchAutocomplete(query: string): Promise<string[]> {
  const url =
    'https://www.google.com/complete/search?client=chrome&hl=ko&gl=kr&q=' +
    encodeURIComponent(query)

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  })
  if (!res.ok) return []

  const raw: unknown = await res.json()
  if (!Array.isArray(raw) || !Array.isArray(raw[1])) return []

  return (raw[1] as unknown[]).filter((s): s is string => typeof s === 'string')
}

/** 시드 1개 → 자동완성 질의 변형 목록 (음절/의도/연령/성별 매트릭스) */
export function buildQueryVariants(seed: string): string[] {
  const variants = new Set<string>()
  variants.add(seed)
  variants.add(`${seed} `)

  for (const s of SYLLABLE_SUFFIX) variants.add(`${seed} ${s}`)
  for (const s of INTENT_SUFFIX) variants.add(`${seed} ${s}`)

  // 연령 스왑 (예: "50대 여자 외로움" → "40대/60대 여자 외로움")
  for (const age of AGE_TOKENS) {
    if (seed.includes(age)) {
      for (const other of AGE_TOKENS) {
        if (other !== age) variants.add(seed.replace(age, other))
      }
    }
  }
  // 성별 스왑
  for (const g of GENDER_TOKENS) {
    if (seed.includes(g)) {
      for (const other of GENDER_TOKENS) {
        if (other !== g) variants.add(seed.replace(g, other))
      }
    }
  }

  return [...variants]
}

/** 자동완성 결과 1건을 KeywordNode로 변환 (분류 + score) */
export function toKeywordNode(args: {
  keyword: string
  parentKeyword: string | null
  depth: number
  cluster: ClusterId | 'uncategorized'
  intent: Intent
  demandSignal: number
  scoreParams?: ScoreParams
}): KeywordNode {
  const sensitivity = evaluateSensitivity(args.keyword)
  const { publishPolicy, titlePolicy } = classifyPublishPolicy(args.keyword, sensitivity)
  const base = {
    keyword: args.keyword,
    cluster: args.cluster,
    sensitivity,
    depth: args.depth,
    demandSignal: args.demandSignal,
    gsc: null,
  }
  const score = computeScore(base, args.scoreParams ?? DEFAULT_SCORE_PARAMS)

  return {
    keyword: args.keyword,
    normalized: normalizeKeyword(args.keyword),
    source: 'autocomplete',
    parentKeyword: args.parentKeyword,
    depth: args.depth,
    cluster: args.cluster,
    intent: args.intent,
    sensitivity,
    publishPolicy,
    titlePolicy,
    relatedKeywords: [],
    gsc: null,
    demandSignal: args.demandSignal,
    score,
    status: 'candidate',
  }
}

export interface ExpandOptions {
  maxDepth: number
  perClusterCap: number
  throttleMs: number
  scoreParams?: ScoreParams
}

export const DEFAULT_EXPAND_OPTIONS: ExpandOptions = {
  maxDepth: 2,
  perClusterCap: 400,
  throttleMs: 1500,
}

/**
 * 시드 목록을 BFS로 확장해 raw KeywordNode[] 반환.
 *
 * ⚠️ 실제 네트워크 대량 수집을 수행한다. import 시 자동 실행되지 않으며,
 *    호출은 별도 실행 스크립트/명령에서만 한다 (창업자 승인 후).
 */
export async function expandKeywords(
  seeds: SeedKeyword[],
  options: ExpandOptions = DEFAULT_EXPAND_OPTIONS,
): Promise<KeywordNode[]> {
  const byNormalized = new Map<string, KeywordNode>()
  const clusterCount = new Map<string, number>()

  // 큐: 확장 대상 (키워드 + 클러스터 + intent + depth)
  type QueueItem = {
    keyword: string
    cluster: ClusterId | 'uncategorized'
    intent: Intent
    depth: number
    parent: string | null
  }
  const queue: QueueItem[] = seeds.map((s) => ({
    keyword: s.keyword,
    cluster: s.cluster,
    intent: s.intent,
    depth: 0,
    parent: null,
  }))

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break

    const variants = buildQueryVariants(item.keyword)

    for (const variant of variants) {
      const suggestions = await fetchAutocomplete(variant)
      await sleep(options.throttleMs)

      for (const sug of suggestions) {
        const norm = normalizeKeyword(sug)
        const existing = byNormalized.get(norm)
        if (existing) {
          existing.demandSignal += 1
          // demandSignal 증가가 최종 score에 반영되도록 재계산
          existing.score = computeScore(existing, options.scoreParams ?? DEFAULT_SCORE_PARAMS)
          if (!existing.relatedKeywords.includes(item.keyword) && existing.keyword !== item.keyword) {
            existing.relatedKeywords.push(item.keyword)
          }
          continue
        }

        const cap = clusterCount.get(item.cluster) ?? 0
        if (cap >= options.perClusterCap) continue

        const node = toKeywordNode({
          keyword: sug,
          parentKeyword: item.keyword,
          depth: item.depth + 1,
          cluster: item.cluster,
          intent: item.intent,
          demandSignal: 1,
          scoreParams: options.scoreParams,
        })
        byNormalized.set(norm, node)
        clusterCount.set(item.cluster, cap + 1)

        if (item.depth + 1 < options.maxDepth) {
          queue.push({
            keyword: sug,
            cluster: item.cluster,
            intent: item.intent,
            depth: item.depth + 1,
            parent: item.keyword,
          })
        }
      }
    }
  }

  return [...byNormalized.values()]
}
