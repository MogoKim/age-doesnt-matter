/**
 * generate-specs.ts — 코드베이스 역공학 기능명세(PRD) 자동 생성
 *
 * 실행: cd agents && npx tsx scripts/generate-specs.ts
 *       cd agents && npx tsx scripts/generate-specs.ts --area community
 *
 * 출력: ../docs/specs/01-community.md ~ 10-advertising.md
 *
 * 비용 (Sonnet 4.6 기준, 10개 영역 전체):
 *   입력 ~10K tokens × 10 = ~100K tokens → ~$0.30
 *   출력 ~2K tokens × 10 = ~20K tokens → ~$0.30
 *   합계: ~$0.60 (1회성)
 *
 * DISPATCH ONLY — 사유: 창업자 수동 실행용 오프라인 문서화 스크립트
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')  // New_Claude_agenotmatter/

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'

// ─────────────────────────────────────────────────────────────────
// 기능 영역 정의
// ─────────────────────────────────────────────────────────────────

interface FeatureArea {
  id: string
  name: string
  label: string
  filePatterns: string[]       // root 기준 glob 패턴
  schemaModels?: string[]      // 관련 Prisma 모델명
}

const FEATURE_AREAS: FeatureArea[] = [
  {
    id: '01',
    name: 'community',
    label: '커뮤니티 (게시판/글/댓글/공감/스크랩/신고)',
    filePatterns: [
      'src/app/(main)/community/**/*.{ts,tsx}',
      'src/app/api/posts/**/*.ts',
      'src/app/api/comments/**/*.ts',
      'src/components/features/community/**/*.{ts,tsx}',
    ],
    schemaModels: ['Post', 'Board', 'Comment', 'Like', 'Scrap', 'Report'],
  },
  {
    id: '02',
    name: 'jobs',
    label: '일자리 (목록/상세/필터/스크랩)',
    filePatterns: [
      'src/app/(main)/jobs/**/*.{ts,tsx}',
      'src/app/api/jobs/**/*.ts',
      'src/components/features/jobs/**/*.{ts,tsx}',
    ],
    schemaModels: ['JobPost', 'JobScrap'],
  },
  {
    id: '03',
    name: 'magazine',
    label: '매거진 (목록/상세/OG/CPS)',
    filePatterns: [
      'src/app/(main)/magazine/**/*.{ts,tsx}',
      'src/app/api/magazine/**/*.ts',
      'src/components/features/magazine/**/*.{ts,tsx}',
    ],
    schemaModels: ['Post', 'CpsLink'],
  },
  {
    id: '04',
    name: 'search',
    label: '통합 검색 (키워드/탭별 결과)',
    filePatterns: [
      'src/app/(main)/search/**/*.{ts,tsx}',
      'src/app/api/search/**/*.ts',
    ],
    schemaModels: ['Post', 'JobPost'],
  },
  {
    id: '05',
    name: 'best',
    label: '인기글/베스트 (오늘/주간/명예의전당)',
    filePatterns: [
      'src/app/(main)/best/**/*.{ts,tsx}',
      'src/app/api/best/**/*.ts',
    ],
    schemaModels: ['Post'],
  },
  {
    id: '06',
    name: 'mypage',
    label: '마이페이지 (프로필/활동/알림/댓글/스크랩)',
    filePatterns: [
      'src/app/(main)/my/**/*.{ts,tsx}',
      'src/app/api/notifications/**/*.ts',
    ],
    schemaModels: ['User', 'Post', 'Comment', 'Scrap', 'Notification', 'Grade'],
  },
  {
    id: '07',
    name: 'settings',
    label: '설정 (닉네임/폰트/차단/탈퇴/동의)',
    filePatterns: [
      'src/app/(main)/my/settings/**/*.{ts,tsx}',
      'src/app/api/auth/**/*.ts',
    ],
    schemaModels: ['User', 'Block', 'Agreement', 'FontSize'],
  },
  {
    id: '08',
    name: 'auth',
    label: '인증 (카카오 OAuth/온보딩/세션/등급)',
    filePatterns: [
      'src/app/login/**/*.{ts,tsx}',
      'src/app/onboarding/**/*.{ts,tsx}',
      'src/lib/auth.ts',
      'src/app/api/auth/**/*.ts',
      'src/components/features/auth/**/*.{ts,tsx}',
    ],
    schemaModels: ['User', 'Agreement', 'Grade'],
  },
  {
    id: '09',
    name: 'admin',
    label: '어드민 (대시보드/회원/콘텐츠/신고/배너/팝업/설정/감사로그)',
    filePatterns: [
      'src/app/admin/**/*.{ts,tsx}',
      'src/app/api/admin/**/*.ts',
    ],
    schemaModels: ['User', 'Post', 'Report', 'Banner', 'Popup', 'AuditLog', 'Board'],
  },
  {
    id: '10',
    name: 'advertising',
    label: '광고/수익화 (AdSense/쿠팡CPS/배너/팝업)',
    filePatterns: [
      'src/components/ad/**/*.{ts,tsx}',
      'src/app/api/ad-click/**/*.ts',
      'src/app/api/popups/**/*.ts',
    ],
    schemaModels: ['Banner', 'Popup', 'CpsLink', 'CpsClickLog'],
  },
]

// ─────────────────────────────────────────────────────────────────
// 파일 읽기
// ─────────────────────────────────────────────────────────────────

const MAX_BYTES_PER_AREA = 40_000  // 40KB per area
const MAX_BYTES_PER_FILE = 6_000   // 6KB per file
const ALLOWED_EXTS = new Set(['.ts', '.tsx'])
const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git'])

/** 특정 디렉토리 아래 .ts/.tsx 파일을 재귀로 수집 */
function walkDir(dir: string, base: string, results: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const rel = join(base, entry)
    try {
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walkDir(full, rel, results)
      } else if (ALLOWED_EXTS.has(extname(entry))) {
        results.push(rel)
      }
    } catch {
      // skip
    }
  }
}

/**
 * glob-like 패턴을 단순 경로 매칭으로 처리.
 * 패턴 형식: 'src/app/(main)/community/**\/*.{ts,tsx}'
 * → src/app/(main)/community/ 디렉토리 이하 모든 .ts/.tsx
 * 단일 파일 경로도 지원: 'src/lib/auth.ts'
 */
function resolvePattern(pattern: string): string[] {
  // 단일 파일 (glob 메타문자 없음)
  if (!pattern.includes('*') && !pattern.includes('{')) {
    const full = resolve(ROOT, pattern)
    return existsSync(full) ? [pattern] : []
  }

  // ** 기준으로 base dir 추출
  const starIdx = pattern.indexOf('*')
  const braceIdx = pattern.indexOf('{')
  const splitIdx = Math.min(
    starIdx !== -1 ? starIdx : Infinity,
    braceIdx !== -1 ? braceIdx : Infinity,
  )
  const baseDir = pattern.slice(0, splitIdx).replace(/\/$/, '')

  const results: string[] = []
  walkDir(resolve(ROOT, baseDir), baseDir, results)
  return results
}

function readFiles(patterns: string[]): { path: string; content: string }[] {
  const seen = new Set<string>()
  const files: { path: string; content: string }[] = []
  let totalBytes = 0

  for (const pattern of patterns) {
    if (totalBytes >= MAX_BYTES_PER_AREA) break

    const matches = resolvePattern(pattern)

    for (const file of matches) {
      if (totalBytes >= MAX_BYTES_PER_AREA) break
      if (seen.has(file)) continue
      seen.add(file)
      try {
        const fullPath = resolve(ROOT, file)
        const raw = readFileSync(fullPath, 'utf-8')
        const content = raw.slice(0, MAX_BYTES_PER_FILE)
        files.push({ path: file, content })
        totalBytes += content.length
      } catch {
        // skip unreadable files
      }
    }
  }

  return files
}

function extractSchemaModels(modelNames: string[]): string {
  const schemaPath = resolve(ROOT, 'prisma/schema.prisma')
  if (!existsSync(schemaPath)) return ''

  const schema = readFileSync(schemaPath, 'utf-8')
  const extracted: string[] = []

  for (const modelName of modelNames) {
    // model Name { ... } 블록 추출
    const regex = new RegExp(`model ${modelName}\\s*\\{[^}]+\\}`, 'g')
    const matches = schema.match(regex)
    if (matches) extracted.push(...matches)
  }

  return extracted.join('\n\n')
}

// ─────────────────────────────────────────────────────────────────
// Claude 프롬프트 + API 호출
// ─────────────────────────────────────────────────────────────────

function buildPrompt(area: FeatureArea, files: { path: string; content: string }[], schemaSnippet: string): string {
  const fileSection = files.map(f =>
    `### [${f.path}]\n\`\`\`\n${f.content}\n\`\`\``,
  ).join('\n\n')

  return `당신은 Next.js 코드베이스를 분석해 기능명세(PRD)를 역공학하는 전문가입니다.

## 분석 대상
서비스명: 우리 나이가 어때서 (우나어, age-doesnt-matter.com)
대상 기능 영역: ${area.label}

## 작업 지시
아래 코드 파일들을 분석해서 **현재 코드에 실제로 구현된 기능**을 기준으로 기능명세를 작성하세요.
- 코드에 없는 기능은 명세에 포함하지 마세요
- 구현이 불완전하거나 TODO가 남은 부분은 별도로 표시하세요
- API 엔드포인트, DB 모델, UI 컴포넌트를 모두 커버하세요

## 출력 형식 (마크다운)

# ${area.id}. ${area.label}

## 개요
(기능 영역 한 줄 요약)

## 주요 화면/페이지
| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| ... | ... | ... |

## API 엔드포인트
| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| ... | ... | ... | ... |

## 데이터 모델 (주요 필드)
(Prisma 모델 기반 — 핵심 필드와 관계만 요약)

## 핵심 비즈니스 로직
(코드에서 발견된 검증 규칙, 권한 체크, 상태 전이 등)

## UI 컴포넌트
(주요 컴포넌트 목록 + 역할 요약)

## 미완성/TODO 항목
(코드에 TODO, FIXME, 불완전한 구현이 있으면 목록화)

---

${schemaSnippet ? `## 관련 DB 스키마\n\`\`\`prisma\n${schemaSnippet}\n\`\`\`\n\n---\n` : ''}

## 분석 대상 코드 파일

${fileSection || '(해당 파일 없음 — 아직 구현되지 않은 기능일 수 있음)'}
`
}

async function generateSpec(area: FeatureArea): Promise<string> {
  console.log(`\n[${area.id}] ${area.label} 분석 중...`)

  const files = readFiles(area.filePatterns)
  const schemaSnippet = area.schemaModels ? extractSchemaModels(area.schemaModels) : ''

  console.log(`  파일 ${files.length}개, 스키마 모델 ${area.schemaModels?.length ?? 0}개`)

  const prompt = buildPrompt(area, files, schemaSnippet)

  let result = ''
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      process.stdout.write('.')
      result += chunk.delta.text
    }
  }

  console.log(' 완료')
  return result
}

// ─────────────────────────────────────────────────────────────────
// 메인 실행
// ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const areaFilter = args.find(a => a.startsWith('--area='))?.split('=')[1]
               ?? (args.indexOf('--area') !== -1 ? args[args.indexOf('--area') + 1] : null)

  const areas = areaFilter
    ? FEATURE_AREAS.filter(a => a.name === areaFilter || a.id === areaFilter)
    : FEATURE_AREAS

  if (areas.length === 0) {
    console.error(`영역 "${areaFilter}"을 찾을 수 없습니다.`)
    console.error(`사용 가능: ${FEATURE_AREAS.map(a => a.name).join(', ')}`)
    process.exit(1)
  }

  const outputDir = resolve(ROOT, 'docs/specs')
  console.log(`출력 경로: ${outputDir}`)
  console.log(`대상 영역: ${areas.map(a => a.name).join(', ')}`)
  console.log(`모델: ${MODEL}`)

  for (const area of areas) {
    try {
      const spec = await generateSpec(area)
      const outputPath = resolve(outputDir, `${area.id}-${area.name}.md`)
      writeFileSync(outputPath, spec, 'utf-8')
      console.log(`  → 저장: docs/specs/${area.id}-${area.name}.md`)
    } catch (err) {
      console.error(`  [에러] ${area.label}:`, err)
    }
  }

  console.log('\n✅ 전체 완료')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
