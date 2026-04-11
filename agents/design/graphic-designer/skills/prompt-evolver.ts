/**
 * Skill: Prompt Evolver
 * Brand Guardian 검증 실패 원인을 분석해 DALL-E / Gemini 프롬프트를 자동 개선
 * Claude Sonnet 사용 (프롬프트 품질이 최종 소재 품질을 결정하므로 heavy tier)
 *
 * Generator-Evaluator-Evolver 루프의 핵심 컴포넌트
 * // LOCAL ONLY
 */

import Anthropic from '@anthropic-ai/sdk'
import type { BrandCheckResult } from '../brand-guardian.js'

const client = new Anthropic()
const EVOLVER_MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'

// ─── 진화 이력 타입 ───────────────────────────────────────────────────────────

export interface PromptEvolutionRecord {
  attempt: number
  prompt: string
  checkResult: BrandCheckResult
  passed: boolean
  timestamp: string
}

// ─── 시스템 프롬프트 ──────────────────────────────────────────────────────────

const EVOLVER_SYSTEM = `당신은 AI 이미지 생성 전문가입니다.
Gemini Imagen / DALL-E 3 프롬프트를 검증 결과에 따라 정밀하게 수정합니다.

핵심 원칙:
1. 실패한 항목만 수정 — 통과한 항목은 절대 변경하지 않음
2. 프롬프트 구조(7계층) 유지 — 순서와 구조 보존
3. 수정은 최소화 — 필요한 키워드 추가/교체만, 전체 재작성 금지
4. 영어 프롬프트 출력 — 수정된 완전한 프롬프트만, 다른 텍스트 없이

실패 항목별 수정 전략:
- ageTargetCheck FAIL (너무 젊음): "late 40s" → "naturally aged Korean woman appearing 47-52 years old, visible laugh lines around eyes, subtle forehead lines, NOT a young woman"
- ageTargetCheck FAIL (너무 늙음): 프롬프트에 "energetic, vibrant, healthy appearance, NOT elderly NOT frail" 추가
- aiArtifactLevel HIGH: "visible pores, natural skin texture, real skin imperfections, subtle asymmetry, NOT perfect skin NOT airbrushed NOT plastic skin" 강화
- genderCheck FAIL: 프롬프트 맨 앞에 "ONLY women present, no men, all-female scene, " 추가
- clothingCheck FAIL: 의상 묘사를 "relaxed Korean daily casual wear — linen blouse, knit cardigan, or comfortable everyday clothing, NOT hospital gown NOT sportswear NOT formal suit" 로 교체
- naturalLighting FAIL: "soft natural window light, gentle ambient indoor/outdoor light, NO studio lighting NO flash NO artificial harsh light" 강화
- brandToneCheck FAIL: "warm approachable atmosphere, trustworthy friendly mood, NOT cold NOT clinical NOT formal" 추가
- sceneMatch FAIL: 장면 설명의 핵심 감정 키워드를 프롬프트에 직접 반영`

const CHATGPT_EVOLVER_RULE = `

⚠️ ChatGPT/DALL-E 전용 추가 규칙 (절대 준수):
- f/1.4, f/1.8, f/2.0, f/2.5, f/2.8 등 조리개 수치 절대 사용 금지
- "shallow depth of field", "bokeh", "soft blur", "depth of field" 절대 사용 금지
- film grain, Kodak Portra 등 필름 효과 용어 사용 금지
- 위 용어들이 원본 프롬프트에 있으면 반드시 제거하고 "sharp focus, f/5.6, deep depth of field, crisp details" 로 교체`

// ─── 진화 프롬프트 ────────────────────────────────────────────────────────────

function buildEvolverPrompt(options: {
  originalPrompt: string
  description: string
  checkResult: BrandCheckResult
  attemptNumber: number
  history: PromptEvolutionRecord[]
}): string {
  const { originalPrompt, description, checkResult, attemptNumber, history } = options

  // 실패 항목 정리
  const failedItems: string[] = []
  if (checkResult.ageTargetCheck === 'FAIL') failedItems.push(`ageTargetCheck`)
  if (checkResult.aiArtifactLevel === 'HIGH') failedItems.push(`aiArtifactLevel=HIGH`)
  if (checkResult.genderCheck === 'FAIL') failedItems.push(`genderCheck`)
  if (checkResult.clothingCheck === 'FAIL') failedItems.push(`clothingCheck`)
  if (checkResult.naturalLighting === 'FAIL') failedItems.push(`naturalLighting`)
  if (checkResult.brandToneCheck === 'FAIL') failedItems.push(`brandToneCheck`)
  if (checkResult.sceneMatch === 'FAIL') failedItems.push(`sceneMatch`)
  if (checkResult.overallFit === 'FAIL') failedItems.push(`overallFit`)

  // 이전 시도 이력
  const historyText =
    history.length > 0
      ? history
          .map(
            (h) =>
              `[시도 ${h.attempt}] ${h.passed ? 'PASS' : 'FAIL'}\n프롬프트: ${h.prompt.slice(0, 200)}...\n실패 원인: ${h.checkResult.failReasons.join(', ')}`
          )
          .join('\n\n')
      : '없음'

  return `[수정 요청 — ${attemptNumber}회차]

소재 설명 (한국어):
"${description}"

현재 프롬프트:
${originalPrompt}

검증 결과:
- 실패 항목: ${failedItems.join(', ')}
- 실패 원인: ${checkResult.failReasons.join(', ')}
- Vision 피드백: ${checkResult.notes}

이전 시도 이력:
${historyText}

위 실패 항목만 수정한 개선된 영어 프롬프트를 출력하세요.
수정된 완전한 프롬프트만 출력하고 다른 텍스트는 포함하지 마세요.`
}

// ─── 메인: 프롬프트 진화 ─────────────────────────────────────────────────────

/**
 * 검증 실패 원인 분석 → 개선된 프롬프트 생성
 *
 * @param options.originalPrompt - 현재 실패한 프롬프트
 * @param options.description - 한국어 소재 설명 (sceneMatch 기준)
 * @param options.checkResult - Brand Guardian 검증 결과
 * @param options.attemptNumber - 현재 시도 횟수 (1~3)
 * @param options.history - 이전 시도 이력 (반복 실수 방지)
 */
export async function evolvePrompt(options: {
  originalPrompt: string
  description: string
  checkResult: BrandCheckResult
  attemptNumber: number
  history?: PromptEvolutionRecord[]
  generator?: 'gemini' | 'chatgpt' | 'dalle'
}): Promise<string> {
  const { originalPrompt, description, checkResult, attemptNumber, history = [], generator = 'gemini' } = options

  console.log(`\n[Prompt Evolver] 진화 시작 (${attemptNumber}회차)`)
  console.log(`  실패 항목: ${checkResult.failReasons.join(', ')}`)

  const systemPrompt =
    generator === 'chatgpt' || generator === 'dalle'
      ? EVOLVER_SYSTEM + CHATGPT_EVOLVER_RULE
      : EVOLVER_SYSTEM

  const response = await client.messages.create({
    model: EVOLVER_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: buildEvolverPrompt({
          originalPrompt,
          description,
          checkResult,
          attemptNumber,
          history,
        }),
      },
    ],
  })

  const raw = response.content[0]
  if (raw.type !== 'text') throw new Error('Prompt Evolver: 응답 없음')

  const evolved = raw.text.trim()
  console.log(`  [Evolver] 진화 완료 (${evolved.length}자)`)
  console.log(`  개선된 프롬프트: ${evolved.slice(0, 100)}...`)

  return evolved
}

// ─── 진화 이력 포맷터 (파일 저장용) ──────────────────────────────────────────

/**
 * 진화 이력을 텍스트로 포맷 (sidecar _prompt.txt에 저장)
 */
export function formatEvolutionHistory(
  history: PromptEvolutionRecord[],
  finalResult?: { passed: boolean; attempts: number }
): string {
  const lines: string[] = []

  for (const record of history) {
    lines.push(`=== Attempt ${record.attempt} (${record.timestamp}) ===`)
    lines.push(`Status: ${record.passed ? 'PASS ✅' : 'FAIL ❌'}`)
    lines.push(`Prompt:\n${record.prompt}`)
    if (!record.passed) {
      lines.push(`Fail Reasons: ${record.checkResult.failReasons.join(', ')}`)
      lines.push(`Notes: ${record.checkResult.notes}`)
    }
    lines.push('')
  }

  if (finalResult) {
    lines.push(
      `=== Final Result ===`,
      `${finalResult.passed ? '✅ PASS' : '❌ FAIL (MAX_ATTEMPTS)'} after ${finalResult.attempts} attempt(s)`
    )
  }

  return lines.join('\n')
}
