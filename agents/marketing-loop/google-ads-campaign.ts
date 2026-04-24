/**
 * Google Ads 캠페인 소재 자동 생성
 * CEO → CMO → COO → Graphic Designer 파이프라인
 *
 * 캠페인 A: 가입 유도 (전환: 회원가입 완료)
 * 캠페인 B: 파워유저 유도 (전환: 가입 + 첫 게시글 업로드)
 *
 * 실행: npx tsx agents/marketing-loop/google-ads-campaign.ts
 *
 * 비용: Gemini Imagen 4 $0.03/장 × 42장 = ~$1.26/실행
 *
 * // LOCAL ONLY — Gemini Imagen API 비용 발생, 크론 불필요
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { runVariationEngine } from '../design/graphic-designer/variation-engine.js'
import { generateImage, saveGeneratedImage } from '../design/graphic-designer/skills/generate-image.js'
import { buildKoreanWomanPrompt, buildKoreanWomenGroupPrompt } from '../design/graphic-designer/skills/build-korean-prompt.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Anthropic()
const MODEL_STRATEGIC = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'
const MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const PROJECT_ROOT = path.join(__dirname, '../..')
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets/generated/ads')

// ──────────────────────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────────────────────

export interface CeoStrategy {
  campaignA: {
    coreDesire: string
    strategy: string
    emotionalHook: string
  }
  campaignB: {
    coreDesire: string
    strategy: string
    emotionalHook: string
  }
}

export interface AdMessage {
  version: 'V1' | 'V2' | 'V3'
  campaign: 'A' | 'B'
  headline: string          // 30자 이내
  description: string       // 90자 이내
  cta: string
  targetDesire: string
  sceneKorean: string       // 한국어 장면 묘사
  isGroupScene: boolean     // 복수 인물 여부
  googleAdsFormat: {
    headlines: string[]     // 3개
    descriptions: string[]  // 2개
  }
}

export interface CooOutput {
  approvedMessages: AdMessage[]
  sceneTranslations: Record<string, string>  // version+campaign → 영어 scene
}

export interface CampaignBrief {
  generatedAt: string
  ceoStrategy: CeoStrategy
  messages: Array<AdMessage & {
    sceneEnglish: string
    fullImagePrompt: string
  }>
}

// ──────────────────────────────────────────────────────────────
// Step 1: CEO — 욕망 매핑 + 전략
// ──────────────────────────────────────────────────────────────

async function runCeo(constitution: string): Promise<CeoStrategy> {
  console.log('\n[CEO] 캠페인 전략 수립 중...')

  const response = await client.messages.create({
    model: MODEL_STRATEGIC,
    max_tokens: 1024,
    system: `당신은 우나어 CEO입니다. 회사 헌법을 기반으로 광고 캠페인 전략을 수립합니다.

${constitution}`,
    messages: [{
      role: 'user',
      content: `Google Ads 캠페인 2가지의 핵심 전략을 수립해주세요.

캠페인 A (가입 유도): 회원가입 완료가 전환 목표
캠페인 B (파워유저): 가입 + 첫 게시글 업로드가 전환 목표
공통 타겟: 50대~60대 여성 (한국인)

욕망 우선순위(RELATION#1 > RETIRE#2 > MONEY#3 > HEALTH#4)를 반영하여
각 캠페인의 핵심 욕망, 전략 한 줄, 감정 훅을 JSON으로 답해주세요:

{
  "campaignA": {
    "coreDesire": "욕망 코드",
    "strategy": "전략 한 줄 (창업자가 이해하기 쉽게)",
    "emotionalHook": "감정 여정 (A → B → C)"
  },
  "campaignB": {
    "coreDesire": "욕망 코드",
    "strategy": "전략 한 줄",
    "emotionalHook": "감정 여정"
  }
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('[CEO] JSON 파싱 실패')

  const strategy = JSON.parse(match[0]) as CeoStrategy
  console.log(`[CEO] 캠페인 A 전략: ${strategy.campaignA.strategy}`)
  console.log(`[CEO] 캠페인 B 전략: ${strategy.campaignB.strategy}`)
  return strategy
}

// ──────────────────────────────────────────────────────────────
// Step 2: CMO — 광고 텍스트 6종 생성
// ──────────────────────────────────────────────────────────────

async function runCmo(
  constitution: string,
  strategy: CeoStrategy
): Promise<AdMessage[]> {
  console.log('\n[CMO] 광고 텍스트 6종 생성 중...')

  const response = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 3000,
    system: `당신은 우나어 CMO입니다. 50~60대 여성에게 공감을 주는 광고 카피를 씁니다.

${constitution}

절대 금지: "시니어", "어르신", "노인", "실버"
필수 톤: 공감 → 위로 → 응원 (정보는 마지막)
헤드라인: 30자 이내 (Google Ads 기준)
설명문: 90자 이내`,
    messages: [{
      role: 'user',
      content: `CEO 전략을 바탕으로 광고 텍스트 6종을 생성해주세요.

캠페인 A 전략: ${strategy.campaignA.strategy}
캠페인 A 욕망: ${strategy.campaignA.coreDesire}

캠페인 B 전략: ${strategy.campaignB.strategy}
캠페인 B 욕망: ${strategy.campaignB.coreDesire}

각 캠페인에 V1(공감형), V2(소속형), V3(행동형) 3종씩 생성.
isGroupScene: 복수 인물 장면이면 true (친구 둘), 단독이면 false.

JSON 형식:
{
  "messages": [
    {
      "version": "V1",
      "campaign": "A",
      "headline": "헤드라인 (30자 이내)",
      "description": "설명문 (90자 이내)",
      "cta": "버튼 텍스트",
      "targetDesire": "욕망 코드",
      "sceneKorean": "한국어 장면 묘사 (50대 여성 일상 장면, 구체적으로)",
      "isGroupScene": false,
      "googleAdsFormat": {
        "headlines": ["헤드라인1", "헤드라인2", "헤드라인3"],
        "descriptions": ["설명문1", "설명문2"]
      }
    }
  ]
}

캠페인 A 3종 + 캠페인 B 3종 = 총 6개`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('[CMO] JSON 파싱 실패')

  const { messages } = JSON.parse(match[0]) as { messages: AdMessage[] }
  console.log(`[CMO] ${messages.length}개 메시지 생성 완료`)
  messages.forEach(m => console.log(`  ${m.campaign}-${m.version}: "${m.headline}"`))
  return messages
}

// ──────────────────────────────────────────────────────────────
// Step 3: COO — 검토 + 영어 scene 번역 확정
// ──────────────────────────────────────────────────────────────

async function runCoo(
  constitution: string,
  messages: AdMessage[]
): Promise<CooOutput> {
  console.log('\n[COO] 텍스트 검토 + 영어 scene 번역 중...')

  // 복잡한 중첩 JSON 방지: 핵심 정보만 텍스트로 전달
  const messagesSummary = messages.map(m =>
    `${m.campaign}-${m.version}: 헤드라인="${m.headline}" 장면="${m.sceneKorean}" 복수인물=${m.isGroupScene}`
  ).join('\n')

  const response = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 2000,
    system: `당신은 우나어 COO입니다. 광고 텍스트 검토 후 이미지 생성용 영어 scene만 반환합니다.

이미지 원칙:
- 한국인 50대 여성, 자연스러운 얼굴
- 캔디드(비연출) 순간, 일상적 한국 환경
- 금지: 스튜디오 배경, 모델 포즈, 외국인 외모, "시니어/어르신"`,
    messages: [{
      role: 'user',
      content: `아래 메시지 6종에 맞는 영어 scene 설명을 작성해주세요.

${messagesSummary}

영어 scene 기준:
- 한국 배경 명시 (Korean cafe / Korean home kitchen / Korean park 등)
- 나이 명시 (Korean woman in her early-to-mid 50s)
- 구체적 행동+감정 (holding coffee cup, laughing / reading by window 등)
- 따뜻한 자연광

아래 JSON만 반환 (다른 텍스트 없이):
{"A-V1":"...","A-V2":"...","A-V3":"...","B-V1":"...","B-V2":"...","B-V3":"..."}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  // JSON 코드블록 또는 순수 JSON 추출
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const match = cleaned.match(/\{[^{}]*\}/)
  if (!match) throw new Error(`[COO] JSON 파싱 실패. 응답: ${text.slice(0, 200)}`)

  const sceneTranslations = JSON.parse(match[0]) as Record<string, string>
  console.log('[COO] scene 번역 완료')
  Object.entries(sceneTranslations).forEach(([k, v]) =>
    console.log(`  ${k}: ${v.slice(0, 70)}...`)
  )

  return { approvedMessages: messages, sceneTranslations }
}

// ──────────────────────────────────────────────────────────────
// Step 4-A: 프리뷰 — 6장 마스터만 생성 (채널 리사이즈 없음)
// ──────────────────────────────────────────────────────────────

async function generatePreviewImages(
  strategy: CeoStrategy,
  cooOutput: CooOutput,
  today: string
): Promise<CampaignBrief> {
  const briefMessages: CampaignBrief['messages'] = []
  const previewDir = path.join(ASSETS_DIR, `${today}_preview`)
  await fs.mkdir(previewDir, { recursive: true })

  console.log(`\n[Preview] 마스터 이미지 6장 생성 (채널 리사이즈 없음)`)
  console.log(`저장: ${previewDir}`)

  for (const msg of cooOutput.approvedMessages) {
    const key = `${msg.campaign}-${msg.version}`
    const sceneEnglish = cooOutput.sceneTranslations[key] ?? msg.sceneKorean
    const fullPrompt = msg.isGroupScene
      ? buildKoreanWomenGroupPrompt(sceneEnglish, msg.headline)
      : buildKoreanWomanPrompt(sceneEnglish, msg.headline)

    console.log(`\n[Preview] ${key}: "${msg.headline}"`)
    console.log(`  Scene: ${sceneEnglish.slice(0, 70)}...`)

    const images = await generateImage({
      prompt: fullPrompt,
      aspectRatio: '16:9',
      model: 'imagen-4.0-generate-001',
      count: 1,
    })

    const filename = `${key.replace('-', '_')}_preview.png`
    const savedPath = await saveGeneratedImage(images[0], previewDir, filename)
    console.log(`  저장: ${savedPath}`)

    briefMessages.push({
      ...msg,
      sceneEnglish,
      fullImagePrompt: fullPrompt,
    })

    // API 레이트 리밋 방지
    await new Promise(r => setTimeout(r, 2000))
  }

  return {
    generatedAt: today,
    ceoStrategy: strategy,
    messages: briefMessages,
  }
}

// ──────────────────────────────────────────────────────────────
// Step 4-B: 풀 생성 — 특정 scene × 7채널 베리에이션
// ──────────────────────────────────────────────────────────────

async function generateFullVariation(
  brief: CampaignBrief,
  targetKeys: string[],  // 예: ['A-V1', 'B-V2']  빈 배열이면 전체
  today: string
): Promise<void> {
  const targets = brief.messages.filter(m => {
    const key = `${m.campaign}-${m.version}`
    return targetKeys.length === 0 || targetKeys.includes(key)
  })

  console.log(`\n[Full Variation] ${targets.length}개 scene × 7채널 생성`)

  for (const msg of targets) {
    const key = `${msg.campaign}-${msg.version}`
    const campaignName = msg.campaign === 'A' ? '가입유도_A' : '파워유저_B'

    console.log(`\n[Full Variation] ${key}: "${msg.headline}"`)

    await runVariationEngine({
      campaign: `${today}_${campaignName}_${msg.version}`,
      subject: msg.sceneEnglish,
      messages: [msg.headline, msg.description, msg.cta],
      style: 'photorealistic',
      skipBrandCheck: false,
      rawSubjectPrompt: msg.fullImagePrompt,
    })

    await new Promise(r => setTimeout(r, 3000))
  }
}

// ──────────────────────────────────────────────────────────────
// 메인 파이프라인
// ──────────────────────────────────────────────────────────────

/**
 * 기본 실행: CEO→CMO→COO 텍스트 생성 + 마스터 이미지 6장 프리뷰
 *
 * 플래그:
 *   (없음)         마스터 6장 프리뷰 생성 (~$0.18)
 *   --full         전체 42장 생성 (~$1.26)
 *   --full A-V1    특정 scene만 7채널 생성 (기존 브리프 재사용)
 */
export async function runGoogleAdsCampaign(mode: 'preview' | 'full' = 'preview', targetKeys: string[] = []): Promise<void> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const briefPath = path.join(ASSETS_DIR, `${today}_campaign_brief.json`)

  // --full 이고 브리프가 이미 있으면 텍스트 단계 건너뜀
  if (mode === 'full') {
    const existingBrief = await fs.readFile(briefPath, 'utf-8').catch(() => null)
    if (existingBrief) {
      const brief = JSON.parse(existingBrief) as CampaignBrief
      console.log(`[Google Ads Campaign] 기존 브리프 재사용: ${briefPath}`)
      await generateFullVariation(brief, targetKeys, today)
      console.log('\n[Google Ads Campaign] 풀 베리에이션 완료!')
      return
    }
  }

  console.log('='.repeat(60))
  if (mode === 'preview') {
    console.log('[Google Ads Campaign] 프리뷰 모드 — 마스터 6장만 생성')
    console.log('예상 비용: ~$0.18 (6장 × $0.03)')
  } else {
    console.log('[Google Ads Campaign] 풀 모드 — 전체 42장 생성')
    console.log('예상 비용: ~$1.26 (42장 × $0.03)')
  }
  console.log('='.repeat(60))

  // constitution.yaml 로드
  const constitutionPath = path.join(PROJECT_ROOT, 'agents/core/constitution.yaml')
  const constitution = await fs.readFile(constitutionPath, 'utf-8').catch(() => '')
  if (!constitution) console.warn('[Warning] constitution.yaml 로드 실패 — 기본값으로 진행')

  // Step 1: CEO
  const strategy = await runCeo(constitution)

  // Step 2: CMO
  const cmoMessages = await runCmo(constitution, strategy)

  // Step 3: COO
  const cooOutput = await runCoo(constitution, cmoMessages)

  // Step 4: 이미지 생성
  await fs.mkdir(ASSETS_DIR, { recursive: true })

  let brief: CampaignBrief
  if (mode === 'preview') {
    brief = await generatePreviewImages(strategy, cooOutput, today)
  } else {
    // 풀 모드: 프리뷰 먼저 생성해서 brief 확보 후 전체 베리에이션
    brief = await generatePreviewImages(strategy, cooOutput, today)
    await generateFullVariation(brief, targetKeys, today)
  }

  // campaign_brief.json 저장
  await fs.writeFile(briefPath, JSON.stringify(brief, null, 2), 'utf-8')

  console.log('\n' + '='.repeat(60))
  console.log('[Google Ads Campaign] 완료!')
  console.log(`브리프: ${briefPath}`)
  if (mode === 'preview') {
    console.log(`프리뷰 이미지: ${ASSETS_DIR}/${today}_preview/`)
    console.log('\n다음 단계:')
    console.log('  이미지 확인 후 → npx tsx agents/marketing-loop/google-ads-campaign.ts --full')
    console.log('  특정 scene만  → npx tsx agents/marketing-loop/google-ads-campaign.ts --full A-V1 B-V2')
  } else {
    console.log(`이미지: ${ASSETS_DIR}/${today}_*/`)
    console.log('\n다음 단계: Google Ads UI에서 수동 업로드')
  }
  console.log('='.repeat(60))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const mode = args.includes('--full') ? 'full' : 'preview'
  const targetKeys = args.filter(a => a !== '--full')
  runGoogleAdsCampaign(mode, targetKeys).catch(console.error)
}
