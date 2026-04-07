/**
 * Figma Reverse Engineering
 * 기존 코드 → Figma 화면 역공학
 *
 * 실행: npx tsx agents/design/product-designer/figma-reverse.ts [페이지명]
 * 예시: npx tsx agents/design/product-designer/figma-reverse.ts 홈
 *       npx tsx agents/design/product-designer/figma-reverse.ts 전체
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { DESIGN_TOKENS, SYSTEM_PROMPT } from './agent.js'
import Anthropic from '@anthropic-ai/sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const PROJECT_ROOT = path.join(__dirname, '../../..')

/** 역공학 대상 페이지 목록 */
const PAGES_TO_REVERSE = [
  {
    name: '홈',
    codePaths: [
      'src/app/(main)/page.tsx',
      'src/components/features/home/',
    ],
    figmaPage: '홈',
  },
  {
    name: '커뮤니티 게시판',
    codePaths: [
      'src/app/(main)/community/',
      'src/components/features/community/',
    ],
    figmaPage: '커뮤니티 게시판',
  },
  {
    name: '게시글 상세',
    codePaths: [
      'src/app/(main)/community/stories/',
      'src/components/features/post/',
    ],
    figmaPage: '게시글 상세',
  },
  {
    name: '마이페이지',
    codePaths: [
      'src/app/(main)/my/',
      'src/components/features/my/',
    ],
    figmaPage: '마이페이지',
  },
  {
    name: '온보딩',
    codePaths: [
      'src/app/(main)/onboarding/',
    ],
    figmaPage: '온보딩 플로우',
  },
]

/** 코드 파일 읽기 (없으면 빈 문자열) */
async function readCodeFiles(paths: string[]): Promise<string> {
  const results: string[] = []
  for (const p of paths) {
    const fullPath = path.join(PROJECT_ROOT, p)
    try {
      const stat = await fs.stat(fullPath)
      if (stat.isDirectory()) {
        const files = await fs.readdir(fullPath)
        for (const file of files.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))) {
          const content = await fs.readFile(path.join(fullPath, file), 'utf-8')
          results.push(`// ${path.join(p, file)}\n${content.slice(0, 2000)}`)
        }
      } else {
        const content = await fs.readFile(fullPath, 'utf-8')
        results.push(`// ${p}\n${content.slice(0, 2000)}`)
      }
    } catch {
      results.push(`// ${p} — 파일 없음`)
    }
  }
  return results.join('\n\n---\n\n')
}

/** 단일 페이지 역공학 */
async function reversePage(pageConfig: typeof PAGES_TO_REVERSE[0]): Promise<void> {
  console.log(`[역공학] ${pageConfig.name} 시작...`)

  const codeContent = await readCodeFiles(pageConfig.codePaths)
  const designMd = await fs.readFile(path.join(PROJECT_ROOT, 'DESIGN.md'), 'utf-8')
    .catch(() => '')

  const prompt = `
다음 코드를 분석해서 Figma에 ${pageConfig.name} 화면을 역공학해줘.

## 코드
\`\`\`
${codeContent}
\`\`\`

## 디자인 시스템 (앞부분만)
\`\`\`
${designMd.slice(0, 2000)}
\`\`\`

## 작업 지시
1. Figma UI Screens 파일의 '${pageConfig.figmaPage}' 페이지에
2. 데스크탑(1440px) 프레임 생성 — 왼쪽 배치
3. 모바일(390px) 프레임 생성 — 오른쪽 배치 (120px 간격)
4. 코드에서 파악한 레이아웃 구조 그대로 재현
5. DESIGN.md 토큰 (#FF6F61 등) 적용
6. 터치 타겟 52px 이상 준수
7. 완료 후 각 프레임 노드 ID 보고

mcp__figma-write__ 도구를 사용해서 실제로 그려줘.
`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const result = response.content[0]
  if (result.type === 'text') {
    console.log(`[역공학] ${pageConfig.name} 완료`)
  }
}

/** 전체 역공학 실행 */
async function reverseAll(): Promise<void> {
  console.log('[역공학] 전체 Figma 초기화 시작')
  console.log('순서: Design System → 공통 컴포넌트 → 페이지별 화면')

  // 1. Design System 동기화
  console.log('\n1단계: Design System...')
  // design-system-sync.ts 호출 예정

  // 2. 페이지별 역공학
  for (const page of PAGES_TO_REVERSE) {
    await reversePage(page)
  }

  console.log('\n[역공학] 전체 완료. Figma 파일을 열어서 확인해주세요.')
}

// 실행
const target = process.argv[2]
if (target === '전체' || !target) {
  reverseAll().catch(console.error)
} else {
  const page = PAGES_TO_REVERSE.find(p => p.name.includes(target))
  if (page) {
    reversePage(page).catch(console.error)
  } else {
    console.error(`페이지를 찾을 수 없음: ${target}`)
    console.error('가능한 값:', PAGES_TO_REVERSE.map(p => p.name).join(', '))
  }
}
