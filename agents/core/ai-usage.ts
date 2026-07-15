/**
 * AI usage 계측 (2026-07-15) — 호출별 실제 토큰 사용량을 BotLog에 남겨 기능별 비용 원장을 만든다.
 *
 * 원칙:
 *  - 모델/max_tokens/프롬프트/파싱/스케줄 무변경 — createWithUsage는 응답을 그대로 반환한다.
 *  - usage 기록 실패는 warn만 하고 본 기능은 계속 진행(비동기 fire-and-forget).
 *  - schema migration 없음 — BotLog(botType CFO, action AI_USAGE) 행에 logData JSON으로 기록.
 *  - 비용 절감 로직 없음 — 관측 전용.
 *
 * 집계 예: BotLog where action='AI_USAGE' → logData.feature별 input/output/estimatedUsd 합산.
 */
import type Anthropic from '@anthropic-ai/sdk'

export const AI_USAGE_ACTION = 'AI_USAGE'

/** USD per 1M tokens — 모델 패밀리별 (2026-07 기준 공시가). 미지정 모델은 sonnet 단가로 보수 추정. */
const PRICING: Record<string, { input: number; output: number }> = {
  opus: { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
}

export interface AiUsageRecord {
  provider: 'anthropic' | 'openai' | 'gemini'
  feature: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  total_tokens: number
  estimatedUsd: number
  callCount: number
}

function priceFor(model: string): { input: number; output: number } {
  const key = Object.keys(PRICING).find(k => model.includes(k))
  return key ? PRICING[key] : PRICING.sonnet
}

/** cache write는 input의 1.25배, cache read는 0.1배 과금 */
export function estimateUsd(
  model: string,
  u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number },
): number {
  const p = priceFor(model)
  const usd =
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.input * 0.1) /
    1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000 // 소수 6자리
}

/** Anthropic 응답에서 usage 추출 — 필드 부재 시 0 (SDK 버전 차이 방어) */
export function extractUsage(feature: string, model: string, usage: unknown): AiUsageRecord {
  const u = (usage ?? {}) as Record<string, unknown>
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const input_tokens = n(u.input_tokens)
  const output_tokens = n(u.output_tokens)
  const cache_creation_input_tokens = n(u.cache_creation_input_tokens)
  const cache_read_input_tokens = n(u.cache_read_input_tokens)
  return {
    provider: 'anthropic',
    feature,
    model,
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
    total_tokens: input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens,
    estimatedUsd: estimateUsd(model, { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }),
    callCount: 1,
  }
}

/** BotLog 기록 — 실패는 warn만. DB는 lazy import(순수부 테스트가 env 없이 로드 가능해야). */
async function recordUsage(record: AiUsageRecord): Promise<void> {
  try {
    // lazy import(vitest가 env 없이 순수부 로드) + 구조적 캐스트(파일 스코프/CI에서 dynamic import 타입이 unknown으로 붕괴하는 문제 방어 — PR #125 전례)
    const { prisma } = (await import('./db.js')) as unknown as {
      prisma: { botLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }
    }
    await prisma.botLog.create({
      data: {
        botType: 'CFO', // 비용 관측 소속 — 기존 enum 값 재사용 (schema 무변경)
        status: 'SUCCESS',
        action: AI_USAGE_ACTION,
        logData: { ...record },
      },
    })
  } catch (err) {
    console.warn(`[ai-usage] 기록 실패(본 기능 무영향): ${feature(record)} —`, err instanceof Error ? err.message : err)
  }
}
function feature(r: AiUsageRecord): string {
  return `${r.feature}/${r.model}`
}

// 전 호출부가 스트리밍 미사용(단순 await) — non-streaming 오버로드로 고정해 기존 res.content 접근 타입 보존
type CreateParams = Anthropic.Messages.MessageCreateParamsNonStreaming
type CreateOpts = Parameters<Anthropic['messages']['create']>[1]

/**
 * messages.create 계측 래퍼 — 응답을 그대로 반환한다(파싱·에러 흐름 무변경).
 * API 실패는 기존과 동일하게 그대로 throw. usage 기록만 비동기로 흘린다.
 */
export async function createWithUsage(
  client: Anthropic,
  featureName: string,
  params: CreateParams,
  opts?: CreateOpts,
): Promise<Anthropic.Messages.Message> {
  const res = await client.messages.create(params, opts)
  try {
    // 스트리밍 미사용 전제(전 호출부가 단순 await create) — usage 없는 형태면 조용히 skip
    const maybeUsage = (res as unknown as { usage?: unknown }).usage
    if (maybeUsage) {
      void recordUsage(extractUsage(featureName, String(params.model), maybeUsage))
    }
  } catch (err) {
    console.warn('[ai-usage] usage 추출 실패(본 기능 무영향):', err instanceof Error ? err.message : err)
  }
  return res
}
