/**
 * Design System Sync
 * DESIGN.md 토큰 → Figma Variables 동기화
 *
 * 실행: npx tsx agents/design/product-designer/design-system-sync.ts
 *
 * // LOCAL ONLY — Figma MCP 세션 필요
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import Anthropic from '@anthropic-ai/sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const PROJECT_ROOT = path.join(__dirname, '../../..')

const SYNC_PROMPT = `
당신은 디자인 시스템 관리자입니다.
Figma에 우나어 디자인 토큰을 Variables로 등록해주세요.

## 등록할 Color Variables
collection: "우나어 Colors"
- primary: #FF6F61 (브랜드 코랄)
- primary-text: #C4453B (텍스트용 코랄, WCAG AA)
- background: #F8F9FA (페이지 배경)
- foreground: #111827 (기본 텍스트)
- card: #FFFFFF (카드)
- border: #E5E7EB (테두리)
- muted: #F1F3F5 (비활성 배경)
- muted-foreground: #6B7280 (힌트 텍스트)
- destructive: #F44336 (에러/삭제)

## 등록할 Typography Styles
- heading-xs: Pretendard 15px / 1.4
- heading-sm: Pretendard 16px / 1.5
- body: Pretendard 18px / 1.6 (기본)
- heading-lg: Pretendard 20px / 1.6
- heading-xl: Pretendard 24px / 1.4
- heading-2xl: Pretendard 28px / 1.3
- heading-3xl: Pretendard 36px / 1.2

## 등록할 Spacing Variables
collection: "우나어 Spacing"
- touch-target: 52 (모바일 최소 터치 타겟)
- button-height-mobile: 52
- button-height-desktop: 48
- card-padding: 16
- section-gap: 24

Figma MCP 도구를 사용해서 Design System 파일에 위 Variables를 실제로 등록해줘.
set_variable, get_variables 도구 활용.
완료 후 등록된 변수 목록 보고.
`

export async function syncDesignSystem(): Promise<void> {
  console.log('[Design System Sync] DESIGN.md → Figma 동기화 시작')

  const designMd = await fs.readFile(path.join(PROJECT_ROOT, 'DESIGN.md'), 'utf-8')
    .catch(() => '')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `${SYNC_PROMPT}\n\n현재 DESIGN.md:\n\`\`\`\n${designMd.slice(0, 3000)}\n\`\`\``,
      },
    ],
  })

  const result = response.content[0]
  if (result.type === 'text') {
    console.log('[Design System Sync] 완료:', result.text.slice(0, 200))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncDesignSystem().catch(console.error)
}
