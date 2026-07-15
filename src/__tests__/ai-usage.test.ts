import { describe, it, expect } from 'vitest'
import { estimateUsd, extractUsage, createWithUsage } from '../../agents/core/ai-usage'
import type Anthropic from '@anthropic-ai/sdk'

/** AI usage 계측 (관측 전용) — 단가 계산·usage 추출·래퍼 무영향 고정 */

describe('estimateUsd — 모델별 단가', () => {
  it('haiku: in $1/M, out $5/M', () => {
    expect(estimateUsd('claude-haiku-4-5', { input_tokens: 1_000_000, output_tokens: 200_000 })).toBeCloseTo(2.0, 6)
  })
  it('sonnet: in $3/M, out $15/M', () => {
    expect(estimateUsd('claude-sonnet-4-6', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(3.0, 6)
  })
  it('opus: in $15/M', () => {
    expect(estimateUsd('claude-opus-4-7', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(15.0, 6)
  })
  it('cache write 1.25x / cache read 0.1x', () => {
    expect(
      estimateUsd('claude-haiku-4-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }),
    ).toBeCloseTo(1.25 + 0.1, 6)
  })
  it('미지정 모델은 sonnet 단가로 보수 추정', () => {
    expect(estimateUsd('claude-future-9', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(3.0, 6)
  })
})

describe('extractUsage — 응답 usage 파싱', () => {
  it('정상 usage 추출 + total + provider/feature/callCount', () => {
    const r = extractUsage('PSYCH_ANALYZE', 'claude-haiku-4-5', {
      input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    })
    expect(r).toMatchObject({
      provider: 'anthropic', feature: 'PSYCH_ANALYZE', model: 'claude-haiku-4-5',
      input_tokens: 1200, output_tokens: 300, total_tokens: 1500, callCount: 1,
    })
    expect(r.estimatedUsd).toBeGreaterThan(0)
  })
  it('필드 부재/이상값은 0으로 방어 (SDK 버전 차이)', () => {
    const r = extractUsage('X', 'claude-haiku-4-5', { input_tokens: 'NaN?' })
    expect(r.input_tokens).toBe(0)
    expect(r.total_tokens).toBe(0)
  })
  it('usage가 null이어도 죽지 않음', () => {
    expect(extractUsage('X', 'm', null).total_tokens).toBe(0)
  })
})

describe('createWithUsage — 래퍼 무영향 고정 (mock client)', () => {
  const fakeRes = { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 5 } }

  it('응답을 그대로 반환한다 (파싱 흐름 무변경)', async () => {
    const client = { messages: { create: async () => fakeRes } } as unknown as Anthropic
    const res = await createWithUsage(client, 'TEST', { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] })
    expect(res).toBe(fakeRes as unknown)
  })

  it('API 실패는 기존과 동일하게 그대로 throw', async () => {
    const client = { messages: { create: async () => { throw new Error('api down') } } } as unknown as Anthropic
    await expect(createWithUsage(client, 'TEST', { model: 'm', max_tokens: 1, messages: [] })).rejects.toThrow('api down')
  })

  it('usage 없는 응답이어도 죽지 않고 그대로 반환', async () => {
    const noUsage = { content: [] }
    const client = { messages: { create: async () => noUsage } } as unknown as Anthropic
    const res = await createWithUsage(client, 'TEST', { model: 'm', max_tokens: 1, messages: [] })
    expect(res).toBe(noUsage as unknown)
  })
})
