#!/usr/bin/env tsx
/**
 * seo-guard — 네이버 Search Advisor 노출면이 실수로 바뀌는 것을 막는 CI 가드
 *
 * 사용법:
 *   npx tsx scripts/check-seo-guard.ts                 # origin/main 대비 검사
 *   BASE_REF=origin/develop npx tsx scripts/check-seo-guard.ts
 *   SEO_GUARD_APPROVED=1 npx tsx scripts/check-seo-guard.ts   # 하드 가드 override
 *
 * 왜 필요한가:
 *   현재 DAU의 대부분이 네이버 검색에서 온다. sitemap·robots·canonical·generic robots meta는
 *   그 유입의 배관이고, 한 줄만 잘못 바뀌어도 유입이 통째로 끊긴다. 그런데 지금은
 *   **사람이 매 PR마다 눈으로 확인**하고 있다. 사람이 하면 언젠가 놓친다.
 *
 * 무엇을 막는가 (4겹):
 *   [A] 하드 가드   — sitemap.ts / robots.ts 변경 시 명시적 승인 요구
 *   [B] 패턴 가드   — 공개 페이지에 generic noindex가 **새로 들어오는 것**
 *   [C] 무결성 검사 — robots.ts / sitemap.ts가 필수 요소를 잃지 않았는지
 *   [D] canonical   — 정본 도메인(non-www) 이외로 바뀌지 않았는지
 *
 * 무엇을 막지 않는가:
 *   - Google 전용 noindex(`googleBot: { index: false }`)는 **허용**한다.
 *     구글에만 색인을 줄이는 것은 네이버와 무관한 정책이며 실제로 운영 중이다.
 *   - 비공개 경로(/admin·/dev·/go·/landing)의 noindex는 정상이므로 검사 대상이 아니다.
 *
 * 이 스크립트는 **아무것도 고치지 않는다.** diff를 읽고 판정만 한다.
 * exit code: 위반이 하나라도 있으면 1, 아니면 0.
 */

import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE_REF = process.env.BASE_REF ?? 'origin/main'
/** 하드 가드 override — CI에서는 `seo-reviewed` 라벨이 붙었을 때만 1로 들어온다 */
const APPROVED = process.env.SEO_GUARD_APPROVED === '1'

/** 변경 자체를 검토 대상으로 보는 파일 — 거의 바뀌지 않고, 바뀌면 유입 전체에 영향 */
const HARD_GUARDED = ['src/app/sitemap.ts', 'src/app/robots.ts'] as const

/** 공개 페이지 경로 — 여기의 generic noindex만 위험하다 */
const PUBLIC_PREFIX = 'src/app/(main)/'

/** 정본 도메인 (non-www). GSC 속성·canonical 모두 이 형태로 통일돼 있다 */
const CANONICAL_HOST = 'age-doesnt-matter.com'

interface Violation {
  rule: 'A' | 'B' | 'C' | 'D'
  file: string
  detail: string
  hint: string
}

const violations: Violation[] = []
const notes: string[] = []

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** base와의 공통 조상부터의 변경 — 3-dot으로 base 쪽 커밋을 오탐하지 않게 한다 */
function changedFiles(): string[] {
  const out = git(['diff', '--name-only', `${BASE_REF}...HEAD`])
  return out ? out.split('\n').filter(Boolean) : []
}

/** 해당 파일에서 **추가된** 라인만 (기존 코드는 이미 통과한 것이므로 새로 들어온 것만 본다) */
function addedLines(file: string): string[] {
  const diff = git(['diff', '-U0', `${BASE_REF}...HEAD`, '--', file])
  if (!diff) return []
  return diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
}

/* ── [A] 하드 가드 ─────────────────────────────────────────────────────── */

function ruleA(files: string[]): void {
  const touched = HARD_GUARDED.filter((g) => files.includes(g))
  if (touched.length === 0) {
    notes.push('[A] sitemap.ts / robots.ts 변경 없음')
    return
  }
  if (APPROVED) {
    notes.push(`[A] ${touched.join(', ')} 변경 — 승인됨(seo-reviewed)`)
    return
  }
  for (const f of touched) {
    violations.push({
      rule: 'A',
      file: f,
      detail: '네이버 수집 경로의 핵심 파일이 변경됐다',
      hint: 'PR에 `seo-reviewed` 라벨을 붙이면 통과한다. 라벨 전에 Yeti 영향을 반드시 확인하라.',
    })
  }
}

/* ── [B] 패턴 가드 ─────────────────────────────────────────────────────── */

/** generic robots를 noindex로 만드는 표기들. googleBot 전용 지정은 제외한다. */
const GENERIC_NOINDEX = [
  /robots\s*:\s*\{[^}]*index\s*:\s*false/,
  /robots\s*:\s*['"`][^'"`]*noindex/i,
  /<meta[^>]+name=['"]robots['"][^>]*noindex/i,
]

function ruleB(files: string[]): void {
  const targets = files.filter((f) => f.startsWith(PUBLIC_PREFIX) && /\.tsx?$/.test(f))
  let hit = 0
  for (const f of targets) {
    for (const line of addedLines(f)) {
      // Google 전용 noindex는 허용 정책이다 — 같은 줄에 googleBot이 있으면 건너뛴다
      if (/googleBot/i.test(line)) continue
      if (GENERIC_NOINDEX.some((re) => re.test(line))) {
        hit++
        violations.push({
          rule: 'B',
          file: f,
          detail: `공개 페이지에 generic noindex가 추가됐다 — ${line.trim().slice(0, 80)}`,
          hint: '네이버(Yeti)도 이 값을 읽는다. 구글만 빼려면 googleBot: { index: false, follow: true } 를 쓰라.',
        })
      }
    }
  }
  if (hit === 0) notes.push(`[B] 공개 페이지 ${targets.length}개 검사 — generic noindex 추가 없음`)
}

/* ── [C] 무결성 검사 ───────────────────────────────────────────────────── */

function ruleC(): void {
  const robotsPath = resolve(ROOT, 'src/app/robots.ts')
  if (existsSync(robotsPath)) {
    const src = readFileSync(robotsPath, 'utf-8')
    // 전면 차단(Disallow: '/')이 들어가면 네이버 수집이 통째로 끊긴다
    if (/disallow\s*:\s*\[?\s*['"`]\/['"`]\s*\]?/i.test(src)) {
      violations.push({
        rule: 'C',
        file: 'src/app/robots.ts',
        detail: "전체 경로 차단(Disallow: '/')이 존재한다",
        hint: '이 한 줄로 네이버·구글 수집이 모두 멈춘다.',
      })
    }
    if (!/allow/i.test(src)) {
      violations.push({
        rule: 'C',
        file: 'src/app/robots.ts',
        detail: 'allow 규칙이 사라졌다',
        hint: 'robots.txt에 허용 규칙이 없으면 크롤러 동작이 불확실해진다.',
      })
    }
    if (!/sitemap/i.test(src)) {
      violations.push({
        rule: 'C',
        file: 'src/app/robots.ts',
        detail: 'sitemap 선언이 사라졌다',
        hint: '네이버·구글이 sitemap 위치를 찾지 못한다.',
      })
    }
    if (violations.every((v) => v.file !== 'src/app/robots.ts')) {
      notes.push('[C] robots.ts — allow·sitemap 선언 유지, 전체 차단 없음')
    }
  }

  const sitemapPath = resolve(ROOT, 'src/app/sitemap.ts')
  if (existsSync(sitemapPath)) {
    const src = readFileSync(sitemapPath, 'utf-8')
    if (!src.includes(CANONICAL_HOST)) {
      violations.push({
        rule: 'C',
        file: 'src/app/sitemap.ts',
        detail: `정본 도메인(${CANONICAL_HOST}) 문자열이 없다`,
        hint: 'sitemap의 URL 호스트가 바뀌면 색인된 URL과 불일치가 생긴다.',
      })
    } else if (/https?:\/\/www\.age-doesnt-matter\.com/.test(src)) {
      violations.push({
        rule: 'C',
        file: 'src/app/sitemap.ts',
        detail: 'www 도메인이 등장한다',
        hint: '정본은 non-www다. www URL을 sitemap에 넣으면 중복·리디렉션 신호가 생긴다.',
      })
    } else {
      notes.push(`[C] sitemap.ts — 정본 도메인(non-www) 유지`)
    }
  }
}

/* ── [D] canonical 도메인 ──────────────────────────────────────────────── */

function ruleD(files: string[]): void {
  const targets = files.filter((f) => f.startsWith('src/') && /\.tsx?$/.test(f))
  let checked = 0
  for (const f of targets) {
    for (const line of addedLines(f)) {
      if (!/canonical/i.test(line)) continue
      checked++
      const urls = line.match(/https?:\/\/[^'"`\s)]+/g) ?? []
      for (const u of urls) {
        if (u.includes(`www.${CANONICAL_HOST}`)) {
          violations.push({
            rule: 'D',
            file: f,
            detail: `canonical에 www 도메인 — ${u}`,
            hint: `정본은 non-www(${CANONICAL_HOST})다.`,
          })
        } else if (!u.includes(CANONICAL_HOST)) {
          violations.push({
            rule: 'D',
            file: f,
            detail: `canonical이 외부 도메인을 가리킨다 — ${u}`,
            hint: '색인 권한이 다른 도메인으로 넘어간다.',
          })
        }
      }
    }
  }
  if (checked > 0 && violations.every((v) => v.rule !== 'D')) {
    notes.push(`[D] canonical 추가 ${checked}줄 — 전부 정본 도메인`)
  } else if (checked === 0) {
    notes.push('[D] canonical 추가 없음')
  }
}

/* ────────────────────────────────────────────────────────────────────── */

function main(): void {
  console.log('seo-guard — 네이버 노출면 보호 검사')
  console.log(`base: ${BASE_REF}${APPROVED ? '  (seo-reviewed 승인됨)' : ''}\n`)

  const files = changedFiles()
  if (files.length === 0) {
    console.log('  변경 파일 없음 — 검사 생략')
    process.exit(0)
  }
  console.log(`  변경 파일 ${files.length}개\n`)

  ruleA(files)
  ruleB(files)
  ruleC()
  ruleD(files)

  for (const n of notes) console.log(`  ✅ ${n}`)

  if (violations.length === 0) {
    console.log('\n  ✅ PASS — 네이버 노출면에 위험한 변경 없음')
    process.exit(0)
  }

  console.log(`\n  ❌ FAIL — 위반 ${violations.length}건\n`)
  for (const v of violations) {
    console.log(`  [규칙 ${v.rule}] ${v.file}`)
    console.log(`     ${v.detail}`)
    console.log(`     → ${v.hint}\n`)
  }
  console.log('  네이버 검색 유입은 이 서비스의 주 유입원이다. 위 항목을 확인하기 전에 merge하지 말 것.')
  process.exit(1)
}

main()
