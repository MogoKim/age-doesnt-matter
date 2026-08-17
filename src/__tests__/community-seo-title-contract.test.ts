import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * 커뮤니티 상세 SEO 메타 계약 — 제목 리라이팅이 검색엔진에 닿는 경로 (2026-08-16, P0-2)
 *
 * ## 왜 이 테스트가 있나
 *
 * 제목 리라이팅은 오랫동안 `Post.title`만 갱신했다. 그런데 상세 페이지의
 * `generateMetadata`는 `post.seoTitle ?? post.title`을 쓴다. seoTitle에 원제목이
 * 남아 있으면 리라이팅 제목은 **화면 H1에만 보이고 검색엔진에는 한 글자도 가지 않는다.**
 *
 * 실측(2026-08-16 프로덕션 HTML):
 *   <title>신도시로 이사가요!!!!!!!! | ...</title>   ← 원제목
 *   <h1>신도시 이사 앞두고… 고양이도 없고 ...</h1>    ← 리라이팅 제목
 *   적용 10건 전부 seoTitle이 원제목 → SEO 효과 0
 *
 * P0-2는 runner가 seoTitle도 함께 쓰도록 고쳤다. 그 수정이 의미를 가지려면
 * **페이지 쪽 우선순위(`seoTitle ?? title`)가 유지되어야 한다.**
 *
 * ## 이 테스트가 지키는 것
 *
 * 1. title·OG·Twitter가 seoTitle을 우선 사용한다 — 이게 바뀌면 P0-2가 무력화된다
 * 2. description은 seoTitle과 무관하게 기존 구조를 유지한다 (P0-2 범위 밖)
 * 3. canonical이 slug 기반으로 유지된다 — 리라이팅이 URL을 흔들지 않는다
 * 4. runner가 slug를 절대 UPDATE하지 않는다
 *
 * ⚠️ 페이지 코드를 수정하지 않는다. 현재 구조를 고정하는 것이 목적이다.
 * ⚠️ 소스 문자열 검사인 이유: generateMetadata는 Next 런타임(params/notFound/
 *    permanentRedirect)에 묶여 있어 단위 호출이 어렵다. 계약만 가볍게 고정한다.
 */

const DETAIL_PAGE = resolve(
  __dirname,
  '../app/(main)/community/[boardSlug]/[postId]/page.tsx',
)
const RUNNER = resolve(__dirname, '../../agents/cafe/title-rewrite-runner.ts')

const page = readFileSync(DETAIL_PAGE, 'utf8')
const runner = readFileSync(RUNNER, 'utf8')

/** generateMetadata 본문만 잘라낸다 (페이지 렌더 코드와 섞이지 않게) */
function metadataBlock(src: string): string {
  const start = src.indexOf('export async function generateMetadata')
  expect(start).toBeGreaterThan(-1)
  const after = src.indexOf('\nexport default', start)
  return src.slice(start, after > -1 ? after : undefined)
}

const META = metadataBlock(page)

describe('커뮤니티 상세 generateMetadata — seoTitle 우선 계약', () => {
  it('<title>은 seoTitle을 우선 사용한다', () => {
    expect(META).toMatch(/title:\s*post\.seoTitle\s*\?\?\s*post\.title/)
  })

  it('openGraph.title도 seoTitle을 우선 사용한다', () => {
    const og = META.slice(META.indexOf('openGraph:'), META.indexOf('twitter:'))
    expect(og).toMatch(/title:\s*post\.seoTitle\s*\?\?\s*post\.title/)
  })

  it('twitter.title도 seoTitle을 우선 사용한다', () => {
    const tw = META.slice(META.indexOf('twitter:'))
    expect(tw).toMatch(/title:\s*post\.seoTitle\s*\?\?\s*post\.title/)
  })

  it('seoTitle 우선 참조가 3곳(title·og·twitter) 모두 살아 있다', () => {
    expect((META.match(/post\.seoTitle\s*\?\?\s*post\.title/g) ?? []).length).toBe(3)
  })
})

describe('P0-2 범위 밖 — 이번 변경이 건드리지 않는 것', () => {
  it('description은 기존 구조(seoDescription ?? description)를 유지한다', () => {
    expect(META).toMatch(/description:\s*post\.seoDescription\s*\?\?\s*description/)
  })

  it('canonical은 slug 기반 URL을 유지한다 (리라이팅이 URL을 흔들지 않는다)', () => {
    expect(META).toContain('const canonicalId = post.slug ?? postId')
    expect(META).toMatch(/alternates:\s*\{\s*canonical:\s*url\s*\}/)
  })
})

describe('runner 쪽 계약 — seoTitle은 쓰고 slug는 쓰지 않는다', () => {
  /**
   * 적용 성공 경로의 update data 블록만 잘라낸다.
   *
   * ⚠️ P0-3(2026-08-17)부터 `post.update` 호출이 2곳이다 — MODEL_KEEP 경로에서
   *    설명문만 갱신하는 호출이 앞에 온다. 그래서 첫 번째 호출이 아니라
   *    `title: newTitle`을 담은 **성공 경로**를 명시적으로 찾아야 한다.
   */
  const updateBlock = (() => {
    const anchor = runner.indexOf('const newTitle = model.rewrittenTitle.trim()')
    expect(anchor).toBeGreaterThan(-1)
    const i = runner.indexOf('await deps.prisma.post.update({', anchor)
    expect(i).toBeGreaterThan(-1)
    return runner.slice(i, runner.indexOf('})', runner.indexOf('data: {', i)))
  })()

  it('update data에 seoTitle이 포함된다 (P0-2 핵심)', () => {
    expect(updateBlock).toContain('seoTitle: newTitle')
  })

  it('update data에 title도 같은 값으로 포함된다', () => {
    expect(updateBlock).toContain('title: newTitle')
  })

  it('★ update data에 slug가 없다 — URL·canonical 보존', () => {
    expect(updateBlock).not.toMatch(/^\s*slug:/m)
  })

  it('★ P0-3 — update data에 seoDescription이 조건부로 들어간다', () => {
    // 검증 통과 시에만 합쳐지는 조건부 스프레드다. 실패하면 키 자체가 없어
    // 기존 값(원문 발췌)이 그대로 남는다 — 안전한 축퇴.
    expect(updateBlock).toContain('...desc.patch')
    expect(updateBlock).not.toMatch(/^\s*seoDescription:\s*\w/m) // 무조건 대입은 금지
  })

  it('originalTitle 보존 로직이 유지된다 (rollback 근거)', () => {
    expect(updateBlock).toContain('current.originalTitle ?? current.title')
  })

  it('post.update 호출은 2곳뿐이다 — 성공 경로 + MODEL_KEEP 설명문 경로 (P0-3)', () => {
    // 늘어난 1곳은 KEEP에서 seoDescription만 갱신하는 호출이다. 그 외 경로는 DB를 건드리지 않는다.
    expect((runner.match(/deps\.prisma\.post\.update\(/g) ?? []).length).toBe(2)
  })

  it('★ MODEL_KEEP 경로의 update는 seoDescription만 건드린다 (title·slug 불변)', () => {
    const i = runner.indexOf("if (model.decision === 'KEEP')")
    expect(i).toBeGreaterThan(-1)
    const keepBlock = runner.slice(i, runner.indexOf('if (model.decision === \'REJECT\')', i))
    expect(keepBlock).toContain('data: { seoDescription: d.patch.seoDescription }')
    expect(keepBlock).not.toMatch(/title:\s*newTitle/)
    expect(keepBlock).not.toMatch(/^\s*slug:/m)
  })
})
