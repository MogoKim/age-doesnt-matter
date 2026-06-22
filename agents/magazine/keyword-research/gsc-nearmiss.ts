/**
 * 매거진 SEO 키워드 — GSC near-miss 추출 (보조 신호)
 *
 * // LOCAL ONLY — 1회성 키워드 리서치 도구. cron/GitHub Actions/runner.ts 미등록.
 *                 네트워크 호출은 함수로만 제공하며 import 시 자동 실행하지 않는다.
 *
 * 전제(2026-06-22 재프로브): GSC=READY but near-empty, www 속성만, /magazine 노출 0.
 *  → 주력 아님. "이미 노출되는데 1페이지 못 든" near-miss(position 8~50)만 보조 입력으로.
 * 인증은 agents/core/google-api.ts(getGoogleAuth) 재사용 — 수정 없음, import만.
 */

import { google } from 'googleapis'
import { getGoogleAuth } from '../../core/google-api.js'
import {
  classifyPublishPolicy,
  computeScore,
  evaluateSensitivity,
  normalizeKeyword,
  DEFAULT_SCORE_PARAMS,
} from './scorer.js'
import type { ClusterId, KeywordNode, ScoreParams } from './scorer.js'

export interface GscNearMissOptions {
  /** 조회 기간(일) */
  days: number
  /** near-miss 포지션 하한(이미 어느 정도 떠 있음) */
  minPosition: number
  /** near-miss 포지션 상한 */
  maxPosition: number
  /** 최소 노출 수 */
  minImpressions: number
  /** 조회 행 수 */
  rowLimit: number
  scoreParams?: ScoreParams
}

export const DEFAULT_GSC_NEARMISS_OPTIONS: GscNearMissOptions = {
  days: 90,
  minPosition: 8,
  maxPosition: 50,
  minImpressions: 1,
  rowLimit: 1000,
}

/** GSC 쿼리 문자열 → 클러스터 추정 (실패 시 uncategorized) */
function inferCluster(keyword: string): ClusterId | 'uncategorized' {
  if (/갱년기|건강검진|혈압|당뇨|관절|무릎|영양제|수면|다이어트/.test(keyword)) return '갱년기건강'
  if (/부부관계|성건강|성욕|성\s*횟수|질건조|부부\s*생활/.test(keyword)) return '부부성건강'
  if (/외로움|친구|커뮤니티|심리|만남|연애|이혼|인생2막/.test(keyword)) return '외로움관계'
  if (/일자리|취업|알바|채용|자격증|재취업|구직/.test(keyword)) return '일자리'
  if (/연금|퇴직|노후|세액공제|건강보험/.test(keyword)) return '돈연금'
  if (/패션|의류|옷|염색|살림|정리|취미/.test(keyword)) return '패션생활'
  return 'uncategorized'
}

function ymd(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
}

/**
 * Search Console에서 near-miss 쿼리를 추출해 KeywordNode[] 반환.
 *
 * ⚠️ 실제 GSC API를 호출한다. import 시 자동 실행되지 않으며, 호출은
 *    별도 실행 스크립트/명령에서만 한다. 인증 미설정/권한 없음 시 빈 배열.
 */
export async function fetchGscNearMiss(
  options: GscNearMissOptions = DEFAULT_GSC_NEARMISS_OPTIONS,
): Promise<KeywordNode[]> {
  const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL ?? ''
  if (!siteUrl) return []

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/webmasters.readonly'])
  if (!auth) return []

  // googleapis 타입이 JWT를 직접 받지 않아(버전 스큐) googleapis 자체 OAuth2 타입으로 캐스팅 (런타임 안전)
  const searchconsole = google.searchconsole({
    version: 'v1',
    auth: auth as unknown as InstanceType<typeof google.auth.OAuth2>,
  })

  let rows: Array<{
    keys?: string[] | null
    clicks?: number | null
    impressions?: number | null
    ctr?: number | null
    position?: number | null
  }> = []

  try {
    const resp = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: ymd(options.days + 2),
        endDate: ymd(2),
        dimensions: ['query'],
        rowLimit: options.rowLimit,
      },
    })
    rows = resp.data.rows ?? []
  } catch {
    return []
  }

  const params = options.scoreParams ?? DEFAULT_SCORE_PARAMS
  const nodes: KeywordNode[] = []

  for (const row of rows) {
    const keyword = row.keys?.[0] ?? ''
    const impressions = row.impressions ?? 0
    const position = row.position ?? 0
    if (!keyword) continue
    if (impressions < options.minImpressions) continue
    if (position < options.minPosition || position > options.maxPosition) continue

    const cluster = inferCluster(keyword)
    const sensitivity = evaluateSensitivity(keyword)
    const { publishPolicy, titlePolicy } = classifyPublishPolicy(keyword, sensitivity)
    const gsc = {
      impressions,
      clicks: row.clicks ?? 0,
      position,
      ctr: row.ctr ?? 0,
    }
    const score = computeScore(
      { keyword, cluster, sensitivity, depth: 0, demandSignal: 0, gsc },
      params,
    )

    nodes.push({
      keyword,
      normalized: normalizeKeyword(keyword),
      source: 'gsc',
      parentKeyword: null,
      depth: 0,
      cluster,
      intent: '정보',
      sensitivity,
      publishPolicy,
      titlePolicy,
      relatedKeywords: [],
      gsc,
      demandSignal: 0,
      score,
      status: 'candidate',
    })
  }

  return nodes
}
