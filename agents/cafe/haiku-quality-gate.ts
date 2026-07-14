/**
 * Haiku 품질 게이트 — dry-run 전용 (PR-2, 2026-07-14)
 *
 * CONTENT_CURATE 발행 직전 main ref 1건에 대해 "발화자가 누구인가"를 판정해 기록만 한다.
 * ⚠️ 이 모듈은 발행을 차단하지 않는다 — REJECT여도 발행은 계속되고 wouldReject만 남는다.
 *   (PR-3 enforcement는 dry-run 지표 확인 후 별도)
 *
 * 배경: neutral_daily 이후 발행 77건 감사 — 잔존 누수는 키워드가 아니라 발화자/맥락 문제
 *   (초1/초3 축약 육아·신혼 자기발화·원카페 조롱 맥락·남성 발화). 반대로 '와이프'가 있어도
 *   화자가 여성인 정상 글이 실존하므로 단어 단독 차단은 오탐 — riskAppliesTo 판정이 필수.
 *
 * 비용 통제: 발행 직전 main ref 1건만 호출(후보 전체·refs 3개 전체 호출 금지),
 *   같은 cafePostId의 당일 판정은 BotLog(HAIKU_QUALITY_DRYRUN)에서 재사용.
 *   실패/timeout 시 haikuStatus='ERROR'만 남기고 발행은 계속된다.
 */
// ⚠️ DB·Anthropic은 lazy import — 순수부(프롬프트 빌더·파서)를 vitest가 env 없이 로드할 수 있어야 한다.
import type Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const API_TIMEOUT_MS = 20_000

let _client: Anthropic | null = null
async function getClient(): Promise<Anthropic> {
  if (!_client) {
    const { default: AnthropicSdk } = await import('@anthropic-ai/sdk')
    _client = new AnthropicSdk()
  }
  return _client
}
type PrismaLike = typeof import('../core/db.js')['prisma']
async function getPrisma(): Promise<PrismaLike> {
  const { prisma } = await import('../core/db.js')
  return prisma
}
export const HAIKU_GATE_ACTION = 'HAIKU_QUALITY_DRYRUN'

export type HaikuDecision = 'PASS' | 'REJECT' | 'NEEDS_REVIEW'
export type HaikuSpeakerRole =
  | 'target_woman_45_60' | 'neutral_daily' | 'young_self' | 'male_self'
  | 'parenting_current' | 'other_person_story' | 'unknown'
export type HaikuRisk =
  | 'young_self' | 'male_self' | 'parenting_current' | 'newlywed'
  | 'original_cafe_context' | 'mocking_or_inside_joke' | 'stale_time'
  | 'board_mismatch' | 'thin_or_contextless'

const DECISIONS: readonly HaikuDecision[] = ['PASS', 'REJECT', 'NEEDS_REVIEW']
const SPEAKER_ROLES: readonly HaikuSpeakerRole[] = [
  'target_woman_45_60', 'neutral_daily', 'young_self', 'male_self',
  'parenting_current', 'other_person_story', 'unknown',
]
const RISKS: readonly HaikuRisk[] = [
  'young_self', 'male_self', 'parenting_current', 'newlywed',
  'original_cafe_context', 'mocking_or_inside_joke', 'stale_time',
  'board_mismatch', 'thin_or_contextless',
]

export interface HaikuQualityInput {
  cafePostId: string
  title: string
  content: string
  boardType: string
  /** 시간성 판정용 발행 시점 — 미지정 시 현재. 테스트에서 주입 */
  now?: Date
}

export interface HaikuQualityDecision {
  decision: HaikuDecision
  confidence: number
  speakerRole: HaikuSpeakerRole
  risks: HaikuRisk[]
  reason: string
}

export type HaikuQualityResult =
  | ({ haikuStatus: 'OK' | 'CACHED'; wouldReject: boolean } & HaikuQualityDecision)
  | { haikuStatus: 'ERROR'; error: string }

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function buildHaikuQualityPrompt(input: HaikuQualityInput): string {
  const now = input.now ?? new Date()
  const kst = new Date(now.getTime() + 9 * 3600_000)
  const nowLabel = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${DAYS[kst.getUTCDay()]}요일`

  return `당신은 '우나어'(40대 중반~60대 한국 여성 커뮤니티)의 편집 게이트다.
아래 커뮤니티 글 1건이 우리 독자에게 자연스럽게 읽힐지 판정하라.

[판정 순서 — 반드시 이 순서로]
1. 발화자(speakerRole) 추정: 1인칭 단서(제 나이/신혼/와이프/아이 학년/남편/손주/며느리…)를 근거로.
2. 위험 신호가 발화자 본인에게 적용되는지, 타인(성인 자녀·손주·며느리·사위·지인) 이야기인지 구분.
3. 그 다음에만 decision을 정한다.

[절대 규칙 — 단어 하나로 판단 금지]
- '와이프/아내'가 있어도 화자가 여성일 수 있다(예: "선배의 와이프분이" = 타인). 남성 1인칭 서술일 때만 male_self.
  특히 '와이프분/아내분' 같은 존칭형은 타인의 아내를 지칭하는 표현 — 남성은 자기 아내를 '와이프분'이라 부르지 않는다.
  화자의 배우자가 '남편'으로 등장하면(예: "남편도 아는 사이") 화자는 여성이다 — 이 신호가 '와이프' 단어보다 우선한다.
  male_self 판정은 명시적 남성 1인칭 서술("제 와이프가/마누라가/남자입니다/아저씨인데")이 있을 때만 허용한다.
  간접 추론만으로 남성이라 단정하지 마라 — 그 경우 speakerRole=unknown + decision=NEEDS_REVIEW.
- '아이/딸/아들'이 있어도 성인 자녀·손주·조카·지인 이야기면 정상 PASS다(other_person_story).
- 지역 언급(동네 맛집/지역 병원 후기/마트/동네 생활)은 차단 사유가 절대 아니다.
- 발화자 나이가 불명확해도 타깃 여성이 공감할 무해한 생활글(음식/날씨/살림/가전/건강 루틴)은 PASS(neutral_daily).
- 배우자/남편/시댁/친정/돈/은퇴/연금 이야기는 타깃의 핵심 관심사 — 강한 PASS 후보.

[REJECT 후보 — 위험이 발화자 본인일 때만 강하게]
- 본인이 20~30대/40대 초반(나이 자기언급, 신혼 자기발화 "아직 신혼이라")
- 남성 본인 발화("와이프한테 한소리 들었다", "50대 남자입니다")
- 본인이 현재 영유아~중등 자녀 양육 중(어린이집/초1~초6/중등 학부모 고민, "우리 아이 품새")
- 원 카페 내부 맥락("회원님이~", 특정 회원 저격/조롱, 카페 운영 언급) — 우리 사이트에서 맥락 단절
- 날짜 지난 브리핑/연재/매매일지, 발행 시점과 어긋난 시간 선언
- 너무 얇거나 맥락 없는 글(펑 글, 한 줄 감탄)
애매하면 REJECT하지 말고 NEEDS_REVIEW로 넘겨라 — 좋은 일상글 과차단이 최악의 실패다.

오늘(발행 시점): ${nowLabel} / 발행 게시판: ${input.boardType}

[글]
제목: ${input.title}
본문: ${input.content.slice(0, 2000)}

아래 JSON만 출력하라. 다른 텍스트 금지.
{"decision":"PASS|REJECT|NEEDS_REVIEW","confidence":0.0,"speakerRole":"target_woman_45_60|neutral_daily|young_self|male_self|parenting_current|other_person_story|unknown","risks":["young_self|male_self|parenting_current|newlywed|original_cafe_context|mocking_or_inside_joke|stale_time|board_mismatch|thin_or_contextless"],"reason":"짧은 한국어 근거 1문장 (발화자 판정 근거 포함)"}`
}

/** 응답 텍스트에서 JSON을 추출·검증. 실패 시 null (호출부가 ERROR 처리) */
export function parseHaikuQualityDecision(response: string): HaikuQualityDecision | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  let raw: unknown
  try {
    raw = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const decision = DECISIONS.find(d => d === r.decision)
  if (!decision) return null
  const speakerRole = SPEAKER_ROLES.find(s => s === r.speakerRole) ?? 'unknown'
  const risks = Array.isArray(r.risks)
    ? r.risks.filter((x): x is HaikuRisk => RISKS.includes(x as HaikuRisk))
    : []
  const confidence = typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : 0
  const reason = typeof r.reason === 'string' ? r.reason.slice(0, 200) : ''

  return { decision, confidence, speakerRole, risks, reason }
}

/** 당일(KST) 같은 cafePostId 판정 재사용 — 중복 API 호출 방지 */
async function findTodayCachedDecision(cafePostId: string): Promise<HaikuQualityDecision | null> {
  const prisma = await getPrisma()
  const kstMidnight = new Date(new Date(Date.now() + 9 * 3600_000).setUTCHours(0, 0, 0, 0) - 9 * 3600_000)
  const logs = await prisma.botLog.findMany({
    where: { action: HAIKU_GATE_ACTION, createdAt: { gte: kstMidnight } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { logData: true },
  })
  for (const l of logs) {
    const d = l.logData as Record<string, unknown> | null
    if (d && d.cafePostId === cafePostId && typeof d.decision === 'string') {
      const parsed = parseHaikuQualityDecision(JSON.stringify(d))
      if (parsed) return parsed
    }
  }
  return null
}

/**
 * dry-run 평가 — main ref 1건. 어떤 실패도 throw하지 않는다(발행 지속 보장).
 * 판정 1건당 BotLog(HAIKU_QUALITY_DRYRUN) 1행 기록(캐시 재사용의 근거).
 */
export async function evaluateContentQualityWithHaiku(input: HaikuQualityInput): Promise<HaikuQualityResult> {
  try {
    const cached = await findTodayCachedDecision(input.cafePostId).catch(() => null)
    if (cached) {
      return { haikuStatus: 'CACHED', wouldReject: cached.decision === 'REJECT', ...cached }
    }

    const started = Date.now()
    const client = await getClient()
    const res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: buildHaikuQualityPrompt(input) }],
      },
      { timeout: API_TIMEOUT_MS },
    )
    const text = res.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('')
    const parsed = parseHaikuQualityDecision(text)
    if (!parsed) {
      return { haikuStatus: 'ERROR', error: `파싱 실패: ${text.slice(0, 80)}` }
    }

    const prisma = await getPrisma()
    await prisma.botLog
      .create({
        data: {
          botType: 'CONTENT_CURATOR',
          status: 'SUCCESS',
          action: HAIKU_GATE_ACTION,
          executionTimeMs: Date.now() - started,
          logData: {
            cafePostId: input.cafePostId,
            title: input.title.slice(0, 60),
            boardType: input.boardType,
            ...parsed,
            wouldReject: parsed.decision === 'REJECT',
            dryRun: true,
          },
        },
      })
      .catch(() => {}) // 기록 실패해도 발행 흐름 무영향

    return { haikuStatus: 'OK', wouldReject: parsed.decision === 'REJECT', ...parsed }
  } catch (err) {
    return { haikuStatus: 'ERROR', error: String(err instanceof Error ? err.message : err).slice(0, 120) }
  }
}

/** topicResults에 병합할 요약 (additive 필드) */
export function summarizeHaikuResult(r: HaikuQualityResult): Record<string, unknown> {
  if (r.haikuStatus === 'ERROR') return { haikuStatus: 'ERROR', haikuError: r.error }
  return {
    haikuStatus: r.haikuStatus,
    haikuDecision: r.decision,
    wouldReject: r.wouldReject,
    haikuSpeakerRole: r.speakerRole,
    haikuRisks: r.risks,
    haikuConfidence: r.confidence,
    haikuReason: r.reason,
  }
}
