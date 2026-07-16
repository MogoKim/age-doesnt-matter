/**
 * Haiku 품질 게이트 — dry-run 런타임부 (PR-2, 2026-07-14)
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
 *
 * 프롬프트·파서·타입은 haiku-quality-prompt.ts(순수부) — vitest는 그쪽만 로드한다.
 */
import { createWithUsage } from '../core/ai-usage.js'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import {
  buildHaikuQualityPrompt,
  parseHaikuQualityDecision,
  type HaikuQualityDecision,
  type HaikuQualityInput,
  type HaikuQualityResult,
} from './haiku-quality-prompt.js'

export * from './haiku-quality-prompt.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const API_TIMEOUT_MS = 20_000
export const HAIKU_GATE_ACTION = 'HAIKU_QUALITY_DRYRUN'

const client = new Anthropic()


export const HAIKU_BLOCKED_ACTION = 'HAIKU_QUALITY_BLOCKED'

/** enforcement 차단 기록 — Post는 생성하지 않는다. 기록 실패해도 흐름 무영향. */
export async function recordHaikuBlocked(input: {
  title: string
  cafePostId: string
  cafeId: string | null
  source: string
  decision: string
  confidence: number
  risks: string[]
  reason: string
  boardType: string
  category: string | null
  refSourceStage: string | undefined
  mode: string
}): Promise<void> {
  await prisma.botLog
    .create({
      data: {
        botType: 'CAFE_CRAWLER',
        status: 'SUCCESS',
        action: HAIKU_BLOCKED_ACTION,
        logData: { ...input, title: input.title.slice(0, 80), reason: input.reason.slice(0, 200), model: MODEL },
      },
    })
    .catch(() => {})
}

/** 당일(KST) 같은 cafePostId 판정 재사용 — 중복 API 호출 방지 */
async function findTodayCachedDecision(cafePostId: string): Promise<HaikuQualityDecision | null> {
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
    const res = await createWithUsage(client, 'HAIKU_GATE', 
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

    await prisma.botLog
      .create({
        data: {
          botType: 'CAFE_CRAWLER', // BotType enum에 CONTENT_CURATOR 없음 — CONTENT_CURATE 로그와 동일 관례 (hotfix: enum 불일치로 캐시 기록이 조용히 실패하던 버그)
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
