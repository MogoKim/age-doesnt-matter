/**
 * Product Designer Agent
 *
 * 역할: 우나어 서비스의 프로덕트 디자이너.
 * - Figma-First 원칙 실행: 코딩 전 반드시 Figma에 화면 먼저 설계
 * - 기존 코드 역공학: 코드 → Figma 화면 복원
 * - 디자인 시스템 관리: DESIGN.md ↔ Figma Variables 동기화
 *
 * 실행 방법:
 *   창업자: "Figma에 [기능명] 설계해줘"
 *   창업자: "전체 Figma 초기화해줘"
 *
 * MCP 도구: mcp__figma-write__* (Claude Code에 이미 연결됨)
 *
 * 주의: 이 에이전트는 Claude Code 세션 내에서 MCP 도구를 직접 호출.
 * runner.ts 크론 등록 불필요 (인터랙티브 요청 전용).
 *
 * // LOCAL ONLY — 인터랙티브 MCP 세션 전용, GitHub Actions 실행 불가
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001'
const PROJECT_ROOT = path.join(__dirname, '../../..')

/** 우나어 디자인 시스템 토큰 (DESIGN.md 기반) */
export const DESIGN_TOKENS = {
  colors: {
    primary: '#FF6F61',
    primaryText: '#C4453B',
    background: '#F8F9FA',
    foreground: '#111827',
    card: '#FFFFFF',
    border: '#E5E7EB',
    muted: '#F1F3F5',
    mutedForeground: '#6B7280',
    destructive: '#F44336',
  },
  typography: {
    font: 'Pretendard Variable',
    scale: {
      xs: { size: 15, lineHeight: 1.4, usage: '캡션, 배지 (최소)' },
      sm: { size: 16, lineHeight: 1.5, usage: '보조 텍스트' },
      base: { size: 18, lineHeight: 1.6, usage: '본문 (기본)' },
      lg: { size: 20, lineHeight: 1.6, usage: '서브헤딩' },
      xl: { size: 24, lineHeight: 1.4, usage: '섹션 제목' },
      '2xl': { size: 28, lineHeight: 1.3, usage: '페이지 헤딩' },
      '3xl': { size: 36, lineHeight: 1.2, usage: '히어로 텍스트' },
    },
  },
  spacing: {
    touchTarget: 52,  // 최소 터치 타겟 (px)
    buttonHeightMobile: 52,
    buttonHeightDesktop: 48,
    cardPadding: 16,
    sectionGap: 24,
  },
  breakpoints: {
    desktop: 1440,
    mobile: 390,
  },
}

/**
 * 시스템 프롬프트: Product Designer 역할 정의
 */
export const SYSTEM_PROMPT = `당신은 우나어(age-doesnt-matter.com) 전담 프로덕트 디자이너입니다.

## 서비스 정보
- 서비스: 우리 나이가 어때서 (우나어) — 50~60대 커뮤니티
- 타겟: 50~60대 한국인 (시니어 친화 UX 필수)
- 금지 표현: "시니어" → "우리 또래", "50대 60대", "인생 2막"으로 대체

## 디자인 시스템 (반드시 준수)
- 브랜드 컬러: #FF6F61 (primary)
- 폰트: Pretendard Variable
- 본문 최소: 18px, 전체 최소: 15px
- 터치 타겟: 52px × 52px 이상
- 버튼 높이: 모바일 52px / 데스크탑 48px
- 모달: 모바일=하단 시트 / 데스크탑=중앙 팝업

## Figma 작업 원칙
1. 화면 구성: 데스크탑(1440px) + 모바일(390px) 항상 2벌
2. Auto Layout 적용 (정렬과 간격 일관성)
3. 컴포넌트 인스턴스 활용 (디자인 시스템 파일 참조)
4. 유저 플로우: create_connector로 페이지 간 화살표 연결
5. 완료 후 노드 ID와 Figma 링크 반드시 보고

## 역공학 방법
코드 파일 분석 순서:
1. 페이지 파일 (src/app/(main)/[페이지]/page.tsx) — 레이아웃
2. 컴포넌트 파일 (src/components/features/[기능]/*.tsx) — UI 요소
3. DESIGN.md — 토큰 매핑
4. Figma에 구조 재현

## Figma MCP 도구 활용
- 파일/페이지 생성: create_page
- 화면 프레임: create_frame (width: 1440 데스크탑 / 390 모바일)
- 요소 추가: create_rectangle, create_text
- 스타일 적용: set_fill_color, set_font_size, set_auto_layout
- 플로우: create_connector
- 기존 파일 읽기: get_document_info, get_node_info`

/**
 * Product Designer 실행 진입점
 * Claude Code에서 직접 호출하거나 MCP 세션에서 사용
 */
export async function runProductDesigner(request: string): Promise<void> {
  console.log('[Product Designer] 요청 수신:', request)

  // DESIGN.md 읽어서 최신 토큰 확인
  const designMd = await fs.readFile(path.join(PROJECT_ROOT, 'DESIGN.md'), 'utf-8')
    .catch(() => '# DESIGN.md 없음')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `현재 디자인 시스템 문서:\n\`\`\`\n${designMd.slice(0, 3000)}\n\`\`\`\n\n요청: ${request}\n\nFigma MCP 도구를 사용해서 실제로 작업해줘.`,
      },
    ],
  })

  const result = response.content[0]
  if (result.type === 'text') {
    console.log('[Product Designer] 완료:', result.text)
  }
}

// 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
  const request = process.argv[2] ?? '전체 Figma 초기화해줘'
  runProductDesigner(request).catch(console.error)
}
