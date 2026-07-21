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
  inferCluster,
  normalizeKeyword,
  DEFAULT_SCORE_PARAMS,
} from './scorer.js'
import type { ClusterId, Intent, KeywordNode, PublishPolicy, ScoreParams, SeedKeyword } from './scorer.js'
import { AGE_TOKENS, CORE_INTENT_SUFFIX, GENDER_TOKENS, SYLLABLE_SUFFIX } from './seeds.js'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 구글이 봇을 차단(429/403/CAPTCHA)했음을 나타내는 에러 — expandKeywords가 즉시 abort */
export class AutocompleteBlockedError extends Error {
  constructor(reason: string) {
    super(`autocomplete blocked: ${reason}`)
    this.name = 'AutocompleteBlockedError'
  }
}

const CAPTCHA_BODY_RE = /captcha|unusual traffic|sorry\/index|recaptcha/i

/**
 * 구글 자동완성 1회 호출 — 제안어 배열 반환.
 * 차단 신호(429/403/CAPTCHA 본문)는 조용히 [] 반환하지 않고 즉시 throw → 수집 abort.
 */
export async function fetchAutocomplete(query: string): Promise<string[]> {
  const url =
    'https://www.google.com/complete/search?client=chrome&hl=ko&gl=kr&q=' +
    encodeURIComponent(query)

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  })
  const body = await res.text()

  // 차단 신호 → 즉시 throw (조용히 [] 반환 금지)
  if (res.status === 429) throw new AutocompleteBlockedError('HTTP 429 rate limited')
  if (res.status === 403) throw new AutocompleteBlockedError('HTTP 403 forbidden (bot block)')
  if (CAPTCHA_BODY_RE.test(body)) throw new AutocompleteBlockedError('captcha/unusual traffic in body')
  if (!res.ok) throw new Error(`autocomplete HTTP ${res.status}`)

  // 200 OK인데 JSON 파싱 불가/형식 불일치 = 차단 아님(빈 응답) → []
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return []
  }
  if (!Array.isArray(raw) || !Array.isArray(raw[1])) return []

  return (raw[1] as unknown[]).filter((s): s is string => typeof s === 'string')
}

/** 변형 매트릭스 옵션 — 기본은 축소(핵심 의도어만, 음절 제외)로 fetch 절감 */
export interface VariantOptions {
  /** 음절 접미(가~하 14종) 포함 여부 — 기본 false(full 전 제외) */
  includeSyllable?: boolean
  /** 의도 접미 셋 — 기본 CORE_INTENT_SUFFIX(8종) */
  intentSuffixes?: readonly string[]
}

/** 시드 1개 → 자동완성 질의 변형 목록 (기본=축소: seed+공백+핵심의도+연령/성별) */
export function buildQueryVariants(seed: string, opts: VariantOptions = {}): string[] {
  const intentSuffixes = opts.intentSuffixes ?? CORE_INTENT_SUFFIX
  const variants = new Set<string>()
  variants.add(seed)
  variants.add(`${seed} `)

  if (opts.includeSyllable) {
    for (const s of SYLLABLE_SUFFIX) variants.add(`${seed} ${s}`)
  }
  for (const s of intentSuffixes) variants.add(`${seed} ${s}`)

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
  /** 부모의 publishPolicy — off_brand 계보 자식의 publish 승격 차단(lineage guard) */
  parentPolicy?: PublishPolicy
}): KeywordNode {
  // Fix 1: 부모 클러스터를 맹목 상속하지 않고 keyword 본문으로 재분류 (uncategorized면 부모 폴백)
  const inferred = inferCluster(args.keyword)
  const cluster = inferred === 'uncategorized' ? args.cluster : inferred

  const sensitivity = evaluateSensitivity(args.keyword)
  const classified = classifyPublishPolicy(args.keyword, sensitivity)
  const titlePolicy = classified.titlePolicy
  // lineage guard: 부모가 off_brand인데 자식이 자체적으로 publish면 발행 승격 금지 → 보관
  let publishPolicy = classified.publishPolicy
  if (args.parentPolicy === 'no_publish_off_brand' && publishPolicy === 'publish') {
    publishPolicy = 'no_publish_research'
  }
  const base = {
    keyword: args.keyword,
    cluster,
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
    cluster,
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

/** BFS 큐 항목 (checkpoint 직렬화용으로 export) */
export interface QueueItem {
  keyword: string
  cluster: ClusterId | 'uncategorized'
  intent: Intent
  depth: number
  parent: string | null
  /** 이 항목의 publishPolicy — 자식 lineage guard용 */
  policy: PublishPolicy
}

/**
 * 체크포인트 = **중간 백업 전용** (B안). 정확한 resume이 아니다.
 * queriedVariants·항목/변형 진행 위치는 보존하지 않으므로, 이 스냅샷으로 이어받기를 시도하지 말 것.
 * 용도: 실행 중 크래시·차단·잠자기 시 "어디까지 모았는지" 손실 방지용 백업.
 */
export interface CheckpointState {
  nodes: KeywordNode[]
  pendingQueue: QueueItem[]
  stats: ExpandStats
}

export interface ExpandOptions {
  maxDepth: number
  perClusterCap: number
  throttleMs: number
  scoreParams?: ScoreParams
  /** 변형 매트릭스 옵션 (기본 축소: 핵심 의도어만, 음절 제외) */
  variantOptions?: VariantOptions
  /** parent 내 연속 N개 variant가 새 노드 0이면 남은 variant fetch 중단 (기본 4) */
  earlyStopThreshold?: number
  /** N fetch마다 onCheckpoint 호출 (미설정/0이면 비활성) */
  checkpointEveryNFetches?: number
  /** 중간 백업 저장 콜백 — 호출측이 임시파일에 기록 (최종 universe 아님, resume 입력 아님) */
  onCheckpoint?: (state: CheckpointState) => void | Promise<void>
}

export const DEFAULT_EXPAND_OPTIONS: ExpandOptions = {
  maxDepth: 2,
  perClusterCap: 400,
  throttleMs: 1500,
}

/** 수집 통계 (효율·중복 점검용) */
export interface ExpandStats {
  seedCount: number
  fetchCount: number
  /** queriedVariants 전역 dedupe로 스킵된 variant 수 */
  variantSkipCount: number
  /** early-stop으로 fetch 안 한 variant 수 (variantSkip과 구분) */
  earlyStopSkipCount: number
  rawSuggestionCount: number
  uniqueNodeCount: number
  /** 새 노드 0으로 끝난 항목(parent) 수 — 통계 */
  dryBranchPruneCount: number
  dedupRatePct: number
  elapsedMs: number
}

export interface ExpandResult {
  nodes: KeywordNode[]
  stats: ExpandStats
}

/**
 * 시드 목록을 BFS로 확장해 raw KeywordNode[] + 통계 반환.
 *
 * 효율: ① 축소 매트릭스(variantOptions) ② queriedVariants 전역 dedupe
 *       ③ early-stop(연속 dry variant N개면 남은 variant 중단) ④ checkpoint(중간 백업 — resume 아님).
 *
 * ⚠️ 실제 네트워크 대량 수집을 수행한다. import 시 자동 실행되지 않으며,
 *    호출은 별도 실행 스크립트/명령에서만 한다 (창업자 승인 후).
 */
export async function expandKeywords(
  seeds: SeedKeyword[],
  options: ExpandOptions = DEFAULT_EXPAND_OPTIONS,
): Promise<ExpandResult> {
  const startedAt = Date.now()
  const byNormalized = new Map<string, KeywordNode>()
  const clusterCount = new Map<string, number>()
  const queriedVariants = new Set<string>()
  const scoreParams = options.scoreParams ?? DEFAULT_SCORE_PARAMS
  const earlyStopThreshold = options.earlyStopThreshold ?? 4

  let fetchCount = 0
  let variantSkipCount = 0
  let earlyStopSkipCount = 0
  let rawSuggestionCount = 0
  let dryBranchPruneCount = 0

  // 시드로 큐 초기화 (checkpoint는 백업 전용 — 이어받기 입력 아님)
  const queue: QueueItem[] = seeds.map((s) => ({
    keyword: s.keyword,
    cluster: s.cluster,
    intent: s.intent,
    depth: 0,
    parent: null,
    policy: classifyPublishPolicy(s.keyword, evaluateSensitivity(s.keyword)).publishPolicy,
  }))

  const buildStats = (): ExpandStats => {
    const current = [...byNormalized.values()]
    return {
      seedCount: seeds.length,
      fetchCount,
      variantSkipCount,
      earlyStopSkipCount,
      rawSuggestionCount,
      uniqueNodeCount: current.length,
      dryBranchPruneCount,
      dedupRatePct:
        rawSuggestionCount > 0
          ? Math.round((1 - current.length / rawSuggestionCount) * 1000) / 10
          : 0,
      elapsedMs: Date.now() - startedAt,
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break

    const variants = buildQueryVariants(item.keyword, options.variantOptions)
    let newNodesThisItem = 0
    let consecutiveDry = 0

    for (let vi = 0; vi < variants.length; vi++) {
      const variant = variants[vi]
      // dedupe: 이미 질의한 변형 스킵
      if (queriedVariants.has(variant)) {
        variantSkipCount += 1
        continue
      }
      queriedVariants.add(variant)

      const suggestions = await fetchAutocomplete(variant)
      fetchCount += 1
      rawSuggestionCount += suggestions.length
      await sleep(options.throttleMs)

      if (
        options.onCheckpoint &&
        options.checkpointEveryNFetches &&
        fetchCount % options.checkpointEveryNFetches === 0
      ) {
        await options.onCheckpoint({
          nodes: [...byNormalized.values()],
          pendingQueue: [...queue],
          stats: buildStats(),
        })
      }

      let newThisVariant = 0
      for (const sug of suggestions) {
        const norm = normalizeKeyword(sug)
        const existing = byNormalized.get(norm)
        if (existing) {
          existing.demandSignal += 1
          existing.score = computeScore(existing, scoreParams)
          if (!existing.relatedKeywords.includes(item.keyword) && existing.keyword !== item.keyword) {
            existing.relatedKeywords.push(item.keyword)
          }
          continue
        }

        const node = toKeywordNode({
          keyword: sug,
          parentKeyword: item.keyword,
          depth: item.depth + 1,
          cluster: item.cluster, // 부모 폴백 — toKeywordNode가 내용 기반 재분류
          intent: item.intent,
          demandSignal: 1,
          scoreParams,
          parentPolicy: item.policy, // lineage guard
        })

        const cap = clusterCount.get(node.cluster) ?? 0
        if (cap >= options.perClusterCap) continue

        byNormalized.set(norm, node)
        clusterCount.set(node.cluster, cap + 1)
        newNodesThisItem += 1
        newThisVariant += 1

        if (item.depth + 1 < options.maxDepth) {
          queue.push({
            keyword: sug,
            cluster: node.cluster,
            intent: item.intent,
            depth: item.depth + 1,
            parent: item.keyword,
            policy: node.publishPolicy, // lineage guard 전파
          })
        }
      }

      // early-stop: 연속으로 새 노드 0인 변형이 임계치 도달 시 남은 변형 fetch 중단
      if (newThisVariant === 0) {
        consecutiveDry += 1
        if (consecutiveDry >= earlyStopThreshold) {
          earlyStopSkipCount += variants.length - vi - 1
          break
        }
      } else {
        consecutiveDry = 0
      }
    }

    if (newNodesThisItem === 0) dryBranchPruneCount += 1
  }

  return { nodes: [...byNormalized.values()], stats: buildStats() }
}
