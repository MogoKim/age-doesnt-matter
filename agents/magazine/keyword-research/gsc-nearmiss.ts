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
  inferCluster,
  normalizeKeyword,
  DEFAULT_SCORE_PARAMS,
} from './scorer.js'
import type { KeywordNode, ScoreParams } from './scorer.js'

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

function ymd(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// [타깃 게이트 2026-07-21] 우나어 SEO 화이트 검색어 기준표 v2
//  도메인 속성 전환 후 near-miss에 연예/이슈/잡탕 쿼리가 86% 섞여(실측 70개 중 60개)
//  keyword queue 후보 오염 위험 → 화이트리스트(고유 주제어) + 연령 결합 방식으로 게이트.
//  실측 검증: near-miss 70(타깃 9 통과·비타깃 0) / universe 1,188(차단 8.9%=행정·잡음뿐).
// ─────────────────────────────────────────────────────────────────────────────

export type NearMissGate = 'pass' | 'pass_conditional' | 'blocked' | 'needs_review'

/** 연령어 — 40~60대·중년 맥락 */
const GATE_AGE = /(40대|50대|60대|중년|중장년|장년|시니어|[456]0살|[456]0세)/
/** 고유 주제어 — 연령어 없이도 통과 (여성건강 확장분 포함, 창업자 확정) */
const GATE_CORE = new RegExp(
  [
    '갱년기', '폐경', '완경', '생리불순', '생리끝', '안면홍조', '얼굴열', '열감', '식은땀',
    '불면', '수면장애', '질건조', '여성호르몬', '호르몬치료', '호르몬제', '골밀도', '골다공',
    '관절통', '손발저림', '방광염', '요실금', '오십견', '무릎', '허리통증',
    '건강검진', '대장내시경', '유방검진', '유방암검진', '갑상선',
    // 탈모는 중년·여성 결합형만 (단독이면 "빈살만 탈모" 같은 인명 쿼리가 뚫림 — 실측)
    '여성탈모', '갱년기탈모', '중년탈모', '40대탈모', '50대탈모', '60대탈모',
    '남편', '부부', '시댁', '며느리', '사위', '손주', '빈둥지', '황혼',
    '퇴직', '은퇴', '노후', '연금', '퇴직금', 'irp', 'isa', '인생2막',
    '재취업', '경력단절', '경단녀', '요양보호사', '간병', '요양원',
    '노안', '임플란트', '틀니',
  ].join('|'),
)
/** 범용어 — 연령어와 결합할 때만 통과 */
const GATE_GENERIC =
  /(다이어트|여행|패션|알바|커뮤니티|커뮤|모임|친구|외로움|취미|취업|염색|흰머리|주름|요리|살빼|건강|외모|일자리|보험|질환)/
/** 젊은층/학생 — 차단 (탈모+20대 결합도 여기서 차단) */
const GATE_YOUNG = /(20대|30대|10대|대학생|수능|취준생|신입|청년)/
/** 법률 세부 — 차단 (황혼이혼 자체는 CORE '황혼'으로 허용, 소송·재산분할 결합만 차단) */
const GATE_LEGAL = /(소송|재산분할|양육권|고소|위자료|법률상담|변호사)/
/** 의약품·성분류 — 차단. '염색약'은 의약품 아님(오탐 금지).
 *  '처방'은 "대처 방법"→"대처방법" 부분문자열 오탐이 실측돼 처방전/처방약/처방받로 한정.
 *  '영양제 추천'은 타깃 쿼리(기발행 주제)라 차단하지 않음 — '부작용' 결합만 차단. */
const GATE_MEDS = /(멜라토닌|불소|처방전|처방약|처방받|부작용|직구|파스|통증약|의약품|항암|보톡스)/
/** 연령어와 결합해도 차단되는 함정어 — 연예 리스트·시험·성적 소재 */
const GATE_AGE_TRAP = /(배우|가수|아이돌|정력|연예인|출연료|드라마추천)/
/** 수동 검토(drop + needsReview 로그) — 고등 학부모·남성 심리 */
const GATE_REVIEW = /(고[123][^0-9]|고딩|고등학생|수험생|학원|라이딩|남자심리|남성심리)/
const GATE_BRAND = /(우리나이|어때서|우나어|agedoesn)/

/**
 * near-miss 쿼리 타깃 게이트 (순수 함수 — 화이트 검색어 기준표 v2).
 * 전처리: 소문자화 + 공백 제거 ("50 대"→"50대", "국민 연금"→"국민연금").
 * 우선순위: 브랜드/법률/의약품/젊은층/함정어 차단 → 수동검토 → 고유주제어 → 연령+범용 → 단독은 검토.
 */
export function classifyNearMissQuery(raw: string): NearMissGate {
  const k = (raw ?? '').toLowerCase().replace(/\s+/g, '')
  if (!k) return 'blocked'
  if (GATE_BRAND.test(k)) return 'blocked'
  if (GATE_LEGAL.test(k)) return 'blocked'
  if (GATE_MEDS.test(k) && !/염색약/.test(k)) return 'blocked'
  if (GATE_YOUNG.test(k)) return 'blocked'
  if (GATE_AGE_TRAP.test(k)) return 'blocked'
  if (GATE_REVIEW.test(k)) return 'needs_review'
  if (GATE_CORE.test(k)) return 'pass'
  if (GATE_AGE.test(k) && GATE_GENERIC.test(k)) return 'pass_conditional'
  if (GATE_AGE.test(k) || GATE_GENERIC.test(k)) return 'needs_review'
  return 'blocked'
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
  let gateBlocked = 0
  const gateReview: string[] = []

  for (const row of rows) {
    const keyword = row.keys?.[0] ?? ''
    const impressions = row.impressions ?? 0
    const position = row.position ?? 0
    if (!keyword) continue
    if (impressions < options.minImpressions) continue
    if (position < options.minPosition || position > options.maxPosition) continue

    // [타깃 게이트] 비타깃(연예·이슈·법률·의약품·젊은층)은 drop, 경계는 needsReview 로그만 남기고 drop
    const gate = classifyNearMissQuery(keyword)
    if (gate === 'blocked') {
      gateBlocked++
      continue
    }
    if (gate === 'needs_review') {
      gateReview.push(keyword)
      continue
    }

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

  console.log(
    `[gsc-nearmiss] 타깃 게이트 — 채택 ${nodes.length} / 차단 ${gateBlocked} / 수동검토 drop ${gateReview.length}${gateReview.length ? ` (${gateReview.slice(0, 10).join(', ')})` : ''}`,
  )

  return nodes
}
