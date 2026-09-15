/**
 * 공개 URL — **경로 segment 를 날것으로 붙이지 마라** 가드.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  2026-09-15 실측: production sitemap 229개 중 138개가 raw 한글 URL 이었고,
 *  네이버 URL 검사에서 raw 한글 URL 은 **접근 실패**, percent-encoded URL 은 200 이었다.
 *  서버 렌더링된 목록의 href 도 raw 한글이라 목록 → 상세 크롤 경로가 끊겨 있었다.
 *
 * ── 왜 allowlist 를 버렸나 ───────────────────────────────────
 *  🔴 1차 구현은 "검사할 파일 목록"을 손으로 적었다. 그래서 시리즈 허브와 가이드
 *     (`/magazine/series/[seriesId]`, `/guide`, `/guide/[slug]`)를 **통째로 빠뜨렸고**
 *     Codex 리뷰에서 preview 실측으로 raw 한글 href 11개가 드러났다.
 *     목록을 손으로 관리하는 가드는 새 파일을 못 잡는다.
 *
 *  그래서 **`src/` 전역을 스캔**한다. 새 파일이 생겨도 자동으로 검사 대상이 된다.
 *  인코딩하면 **안 되는** 곳만 사유와 함께 명시적으로 면제한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      return name === '__tests__' || name === 'generated' ? [] : sourceFiles(full)
    }
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

/** 템플릿 리터럴 하나 (백틱 사이) */
const TEMPLATE_LITERAL = /`[^`]*`/g
/** 템플릿 안의 `${...}` 하나 */
const INTERPOLATION = /\$\{\s*([^}]*)\}/g
/** 공개 경로 접두사 */
const PUBLIC_PREFIX = /^\/(?:magazine|jobs|community|guide|topic|best|search)(?:\/|$)/
/** 이 함수들을 거치면 인코딩된 것으로 본다 */
const ENCODED = /^(?:encodePathSegment|encodePathname|buildPostPath|buildPostUrl|buildGuidePath|buildSeriesPath|encodeURIComponent|encodeURI)\s*\(/
/** 사람이 쓴 한글이 들어올 수 있는 값 — 이게 인코딩 없이 경로에 들어가면 위반 */
const USER_CONTROLLED = /\b(?:slug|seriesId|Id|id)\b/
/**
 * 값 집합이 **ASCII 로 닫혀 있는** 식별자 — 보드 slug 는 `BOARD_TYPE_TO_SLUG` 의 고정값
 * (`stories`·`humor`·`life2`·`menopause`·`weekly`)이라 인코딩해도 그대로다.
 */
const ASCII_CLOSED_SET = /^(?:boardSlug|boardSlugPath|BOARD_URL_PREFIX\[[^\]]*\])$/

/**
 * 템플릿 리터럴이 **경로**인지 본다.
 * `${...}` 를 들어낸 **리터럴 부분만** 보고 판단한다 —
 * 🔴 `?` 를 문자 클래스로 막으면 `${a ?? b}` 의 `??` 때문에 진짜 경로를 놓친다(실측 버그).
 */
function pathLiteral(tpl: string): string | null {
  const literal = tpl.slice(1, -1).replace(INTERPOLATION, '\u0000')
  if (literal.includes('?') || literal.includes('#')) return null // query·hash 는 경로가 아니다
  // 🔴 `${BASE_URL}/magazine/series/${seriesId}` 처럼 **origin 이 앞에 붙은** 형태도 공개 URL 이다.
  //    선행 보간 하나를 걷어내고 다시 본다 — canonical·og:url·JSON-LD 가 이 모양이다.
  const candidates = [literal, literal.replace(/^\u0000/, '')]
  return candidates.find((c) => PUBLIC_PREFIX.test(c)) ?? null
}

/**
 * 🚫 **인코딩하면 안 되는 줄.** 링크가 아니다 — 여기서 인코딩하면 오히려 깨진다.
 *  · `permanentRedirect` / `redirect` — Next 가 Location 헤더를 **직접 percent-encode** 한다
 *    (2026-09-15 production 301 실측: `location: /magazine/%EC%98%A4...`)
 *  · `revalidatePath` — URL 이 아니라 **라우트 경로 키**다. 인코딩하면 캐시가 안 지워진다
 */
const NOT_A_LINK_LINE = /(?:permanentRedirect|[^A-Za-z]redirect|revalidatePath)\s*\(/

/** 파일 단위 면제 — **사유가 있는 것만**. 새로 추가하려면 왜 인코딩하면 안 되는지 적을 것. */
const EXEMPT: Record<string, string> = {
  // revalidatePath 에 넘길 **라우트 경로 키**를 변수에 담는다(사용처는 다른 줄).
  'src/app/admin/(panel)/vote-events/actions.ts': 'revalidatePath 용 경로 키 — 인코딩하면 캐시가 안 지워진다',
  // 자사 상세 페이지를 미리 데워두는 내부 fetch 경로. 실제 요청과 **같은 캐시 키**여야 한다.
  'src/app/api/internal/prewarm-details/route.ts': 'ISR prewarm 캐시 키 — 실제 요청 경로와 같아야 한다',
}

const read = (f: string) => readFileSync(f, 'utf8')
const rel = (f: string) => relative(process.cwd(), f).split(sep).join('/')

/** 파일에서 "인코딩 없이 사용자 값을 경로에 붙인" 지점을 모은다. */
/** 한 줄에서 위반 템플릿을 뽑는다. 양성 대조 테스트가 이 함수를 그대로 쓴다. */
function scanLine(line: string): string[] {
  if (NOT_A_LINK_LINE.test(line)) return []
  const found: string[] = []
  for (const tpl of line.match(TEMPLATE_LITERAL) ?? []) {
    if (pathLiteral(tpl) === null) continue
    for (const [, expr] of tpl.matchAll(INTERPOLATION)) {
      const e = expr.trim()
      if (ENCODED.test(e) || ASCII_CLOSED_SET.test(e) || !USER_CONTROLLED.test(e)) continue
      found.push(tpl.trim())
    }
  }
  return found
}

function violations(file: string): string[] {
  return read(file)
    .split('\n')
    .flatMap((line, i) => scanLine(line).map((tpl) => `${i + 1}: ${tpl}`))
}

describe('공개 URL 은 경로 segment 를 인코딩해서 만든다 (src 전역 스캔)', () => {
  const files = sourceFiles(ROOT)

  it('스캔 대상이 실제로 잡힌다 — 스캐너가 죽어서 통과하는 일 방지', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('🔴 양성 대조 — 위반 코드를 실제로 잡아낸다', () => {
    // 스캐너가 조용히 0건을 반환해 "통과"하는 사고를 막는다.
    // `??` 가 들어간 형태가 특히 중요하다 — 예전 정규식은 `?` 때문에 이걸 통째로 놓쳤다.
    const bad = [
      'href={`/magazine/${post.slug}`}',
      'href={`/community/${boardSlug}/${post.slug ?? post.id}`}',
      'href={`/guide/${guide.slug}`}',
      'const u = `/magazine/series/${seriesId}`',
      'const url = `${BASE_URL}/magazine/series/${seriesId}`',   // canonical·OG 형태
      'url: `${BASE_URL}/guide/${guide.slug}`,',
    ]
    for (const line of bad) expect(scanLine(line), line).toHaveLength(1)

    const good = [
      'href={buildPostPath(post)}',
      'const url = `${BASE_URL}${buildSeriesPath(seriesId)}`',
      'href={`/guide/${buildGuidePath(guide.slug)}`}',
      'href={`/community/${boardSlug}/${encodePathSegment(post.slug ?? post.id)}`}',
      'href={`/community/write?board=${item.slug}`}',            // query string 은 경로가 아니다
      'revalidatePath(`/community/${boardSlug}/${post.slug}`)',  // 링크가 아니다
    ]
    for (const line of good) expect(scanLine(line), line).toEqual([])
  })

  it('🔴 인코딩 없이 slug·id 를 경로에 붙이는 곳이 없다', () => {
    const bad = files
      .map((f) => ({ file: rel(f), hits: violations(f) }))
      .filter(({ file, hits }) => hits.length > 0 && !(file in EXEMPT))
    const report = bad.map(({ file, hits }) => `${file}\n    ${hits.join('\n    ')}`).join('\n')
    expect(bad, `인코딩 안 된 공개 경로:\n${report}`).toEqual([])
  })

  it('면제 목록은 실제로 위반이 있는 파일만 담는다 — 죽은 면제 금지', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(violations(resolve(process.cwd(), file)).length, `${file}: ${reason}`).toBeGreaterThan(0)
    }
  })

  it('🔴 Codex 가 지적한 파일들이 실제로 스캔에 포함된다', () => {
    // allowlist 시절 통째로 빠졌던 곳들. 스캔 경로가 바뀌어도 여기서 잡힌다.
    const must = [
      'src/app/(main)/magazine/series/[seriesId]/page.tsx',
      'src/app/(main)/guide/page.tsx',
      'src/app/(main)/guide/[slug]/page.tsx',
      'src/lib/seo/topic-second-act.ts',
      'src/lib/seo/topic-menopause.ts',
      'src/app/sitemap.ts',
    ]
    const scanned = new Set(files.map(rel))
    for (const f of must) expect(scanned.has(f), `스캔 누락: ${f}`).toBe(true)
  })
})

describe('post-url 계약', () => {
  it('경로 구분자 보존은 encodePathname 의 책임이다', async () => {
    const { encodePathname, encodePathSegment } = await import('@/lib/post-url')
    // 경로: segment 구조 유지
    expect(encodePathname('/magazine/series/한글-시리즈').split('/')).toHaveLength(4)
    // segment: 하나로 유지(`/` 는 `%2F`)
    expect(encodePathSegment('한글/시리즈').split('/')).toHaveLength(1)
  })
})
