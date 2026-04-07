/**
 * Skill: Script Generation
 * Claude Opus로 영상 대본 생성
 *
 * // LOCAL ONLY — 인터랙티브 영상 제작 파이프라인 전용
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'

export interface ScriptOptions {
  topic: string
  durationSeconds: number
  style?: 'narration' | 'interview' | 'documentary'
  targetEmotion?: string
}

export interface Script {
  title: string
  totalDuration: number
  narrationText: string
  scenes: SceneScript[]
}

export interface SceneScript {
  index: number
  durationSeconds: number
  narration: string
  visualDescription: string
  mood: string
}

const SCRIPT_SYSTEM_PROMPT = `당신은 우나어(우리 나이가 어때서) 전담 영상 대본 작가입니다.

서비스: 50~60대 커뮤니티 플랫폼
브랜드 톤: 따뜻하고, 친근하고, 신뢰감 있고, 활력 있는
금지 표현: "시니어", "액티브 시니어" → 대신 "우리 또래", "50대 60대", "인생 2막"

대본 원칙:
- 나레이션: 한국어, 따뜻하고 차분한 여성 목소리 기준
- 장면 묘사: Gemini Imagen 3 Pro 이미지 생성용 영어 프롬프트
- 자막 고려: 짧고 임팩트 있는 문장 (한 화면에 20자 이내)
- 감성 흐름: 공감 → 문제 인식 → 해결/희망 → 행동 유도`

/**
 * 영상 대본 생성
 */
export async function generateScript(options: ScriptOptions): Promise<Script> {
  const sceneCount = Math.ceil(options.durationSeconds / 10) // 10초당 1장면
  const style = options.style ?? 'narration'
  const emotion = options.targetEmotion ?? '따뜻함과 공감'

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SCRIPT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `
다음 조건으로 ${options.durationSeconds}초 영상 대본을 작성해주세요.

주제: ${options.topic}
스타일: ${style}
목표 감성: ${emotion}
장면 수: ${sceneCount}개

JSON 형식으로 응답:
{
  "title": "영상 제목",
  "totalDuration": ${options.durationSeconds},
  "narrationText": "전체 나레이션 텍스트 (연속)",
  "scenes": [
    {
      "index": 0,
      "durationSeconds": 10,
      "narration": "이 장면 나레이션 (한국어)",
      "visualDescription": "Scene visual description for Imagen (English, photorealistic style, Korean woman in 50s, warm coral tones)",
      "mood": "따뜻함"
    }
  ]
}`,
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('대본 생성 실패: 텍스트 응답 없음')
  }

  // JSON 파싱
  const jsonMatch = content.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('대본 생성 실패: JSON 파싱 오류')
  }

  return JSON.parse(jsonMatch[0]) as Script
}
