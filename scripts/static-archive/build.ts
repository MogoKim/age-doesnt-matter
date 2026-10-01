/**
 * 우나어 정적 기록관 빌더 — 순수 HTML/CSS 산출물을 만든다 (Next 런타임·JS·DB·R2 의존 0).
 *
 * 입력: 코드 상수뿐 (src/lib/guides 의 자체 제작 가이드 + ./content.ts 기록관 문안).
 *       DB·운영 HTML·R2 를 읽지 않는다 → 회원 닉네임·글·댓글·프로필이 섞일 경로가 없다.
 * 출력: --out <dir> (저장소 밖 경로 권장). Cloudflare Pages 정적 자산 규칙에 맞춘다:
 *       /about → about.html, /guide/<slug> → guide/<slug>.html (trailing slash 리다이렉트 방지)
 *
 * 실행: npx tsx scripts/static-archive/build.ts --out ../unao-archive-out
 * 검증: npx tsx scripts/static-archive/verify.ts --out ../unao-archive-out
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { GUIDES, type GuideDoc } from '../../src/lib/guides'
import {
  ABOUT,
  ARCHIVE_NOTICE,
  CONTACT_EMAIL,
  GUIDE_INDEX,
  HOME,
  LEGACY_TITLE_SUFFIX,
  PRIVACY,
  SITE_NAME,
  TERMS,
  type ArchivePage,
} from './content'

export const BASE_URL = 'https://age-doesnt-matter.com'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** 기존 robots.txt 와 바이트 동일하게 유지 (네이버 Search Advisor 보호) */
export const ROBOTS_TXT = `User-Agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /my/

Sitemap: ${BASE_URL}/sitemap.xml
`

/** 대체 콘텐츠가 있는 레거시 경로만 301. 나머지 제거 URL 은 실제 404 */
export const REDIRECTS: Array<[string, string]> = [['/faq', '/about']]

/** public/ 에서 복사하는 자체 소유 브랜드 자산 (가이드 본문 이미지는 없음) */
const COPIED_ASSETS = ['favicon.ico', 'favicon.png']

export interface BuiltPage {
  path: string
  file: string
  title: string
  description: string
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** URL 경로 → 인코딩된 href (한글 slug 는 percent-encoding, 기존 canonical 과 같은 형식) */
export const encodePath = (p: string): string => p.split('/').map((seg) => encodeURIComponent(seg)).join('/')

export const fileForPath = (p: string): string => (p === '/' ? 'index.html' : `${p.slice(1)}.html`)

const guidePath = (slug: string): string => `/guide/${slug}`

function jsonLd(data: object): string {
  // </script> 탈출 방지
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function breadcrumb(items: Array<{ name: string; path: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${BASE_URL}${encodePath(it.path)}`,
    })),
  }
}

function layout(opts: {
  path: string
  title: string
  description: string
  body: string
  jsonLds?: object[]
  ogType?: 'website' | 'article'
  noindex?: boolean
}): string {
  const canonical = `${BASE_URL}${encodePath(opts.path)}`
  const robots = opts.noindex ? 'noindex, follow' : 'index, follow'
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta name="robots" content="${robots}">
${opts.noindex ? '' : `<link rel="canonical" href="${canonical}">\n`}<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="${opts.ogType ?? 'website'}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="ko_KR">
${opts.noindex ? '' : `<meta property="og:url" content="${canonical}">\n`}<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/assets/site.css">
${(opts.jsonLds ?? []).map(jsonLd).join('\n')}
</head>
<body>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/">${SITE_NAME}</a>
    <nav class="nav" aria-label="주요 메뉴">
      <a href="/guide">생활 가이드</a>
      <a href="/about">소개</a>
    </nav>
  </div>
</header>
<p class="notice"><span class="wrap">${esc(ARCHIVE_NOTICE)}</span></p>
<main class="wrap main">
${opts.body}
</main>
<footer class="site-footer">
  <div class="wrap footer-row">
    <a href="/privacy">개인정보 안내</a>
    <a href="/terms">이용 안내</a>
    <a href="mailto:${CONTACT_EMAIL}">문의 메일</a>
  </div>
  <p class="wrap copy">© ${SITE_NAME}</p>
</footer>
</body>
</html>
`
}

function renderArchivePage(p: ArchivePage, extraBody = ''): string {
  const sections = p.sections
    .map(
      (s) =>
        `<section class="card">\n<h2>${esc(s.heading)}</h2>\n${s.paragraphs.map((t) => `<p>${linkifyEmail(esc(t))}</p>`).join('\n')}\n</section>`,
    )
    .join('\n')
  return `<h1>${esc(p.h1)}</h1>\n<p class="lead">${esc(p.lead)}</p>\n${extraBody}${sections}`
}

function linkifyEmail(escaped: string): string {
  return escaped.replace(CONTACT_EMAIL, `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`)
}

/** 가이드 relatedLinks 중 기록관에 실제로 남는 경로(가이드)만 링크. communityLinks 는 전부 제외 */
function keptGuideLinks(g: GuideDoc): Array<{ label: string; href: string }> {
  return g.relatedLinks.filter((l) => {
    const m = /^\/guide\/(.+)$/.exec(l.href)
    return m !== null && m[1] in GUIDES
  })
}

function renderGuide(g: GuideDoc): string {
  const p = guidePath(g.slug)
  const url = `${BASE_URL}${encodePath(p)}`
  const related = keptGuideLinks(g)
  const body = `<nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a> › <a href="/guide">생활 가이드</a> › <span>${esc(g.breadcrumbLabel)}</span></nav>
<article>
<h1>${esc(g.title)}</h1>
<p class="meta">작성 ${esc(g.publishedAt)} · 기준일 ${esc(g.updatedAt)}</p>
<div class="tldr"><strong>한눈에 보기</strong><p>${esc(g.tldr)}</p></div>
${g.sections.map((s) => `<section>\n<h2>${esc(s.heading)}</h2>\n${s.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('\n')}\n</section>`).join('\n')}
<section class="faq">
<h2>자주 묻는 질문</h2>
${g.faqs.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}
</section>
${
  related.length > 0
    ? `<section class="card">\n<h2>함께 보면 좋은 가이드</h2>\n<ul class="links">${related.map((l) => `<li><a href="${encodePath(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>\n</section>`
    : ''
}
</article>`
  return layout({
    path: p,
    title: `${g.title}${LEGACY_TITLE_SUFFIX}`,
    description: g.description,
    ogType: 'article',
    body,
    jsonLds: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: g.title,
        description: g.description,
        url,
        datePublished: g.publishedAt,
        dateModified: g.updatedAt,
        author: { '@type': 'Organization', name: '우리 나이가 어때서 편집' },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: BASE_URL },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: g.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
      breadcrumb([
        { name: '홈', path: '/' },
        { name: '생활 가이드', path: '/guide' },
        { name: g.breadcrumbLabel, path: p },
      ]),
    ],
  })
}

function guideCards(slugs: readonly string[]): string {
  return `<ul class="cards">${slugs
    .map((s) => GUIDES[s])
    .filter((g): g is GuideDoc => g !== undefined)
    .map(
      (g) =>
        `<li><a class="guide-card" href="${encodePath(guidePath(g.slug))}"><strong>${esc(g.title)}</strong><span>${esc(g.description)}</span></a></li>`,
    )
    .join('')}</ul>`
}

function renderGuideIndex(): string {
  const listed = new Set<string>(GUIDE_INDEX.groups.flatMap((g) => [...g.slugs]))
  const rest = Object.keys(GUIDES).filter((s) => !listed.has(s))
  const groups = GUIDE_INDEX.groups
    .map((g) => `<section>\n<h2>${esc(g.title)}</h2>\n<p class="muted">${esc(g.description)}</p>\n${guideCards(g.slugs)}\n</section>`)
    .join('\n')
  const body = `<nav class="crumbs" aria-label="현재 위치"><a href="/">홈</a> › <span>생활 가이드</span></nav>
<h1>생활 가이드</h1>
<p class="lead">${esc(GUIDE_INDEX.description)}</p>
${groups}${rest.length > 0 ? `\n<section><h2>그 밖의 가이드</h2>${guideCards(rest)}</section>` : ''}`
  return layout({
    path: GUIDE_INDEX.path,
    title: `${GUIDE_INDEX.title}${LEGACY_TITLE_SUFFIX}`,
    description: GUIDE_INDEX.description,
    body,
    jsonLds: [breadcrumb([{ name: '홈', path: '/' }, { name: '생활 가이드', path: '/guide' }])],
  })
}

function renderHome(): string {
  const all = GUIDE_INDEX.groups.flatMap((g) => [...g.slugs])
  const body = `${renderArchivePage(HOME)}
<section>
<h2>생활 가이드</h2>
${guideCards(all)}
<p><a class="button-link" href="/guide">가이드 전체 보기</a></p>
</section>`
  return layout({
    path: '/',
    title: HOME.title,
    description: HOME.description,
    body,
    jsonLds: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: BASE_URL }],
  })
}

const render404 = (): string =>
  layout({
    path: '/404',
    title: `페이지를 찾을 수 없어요 | ${SITE_NAME}`,
    description: '요청하신 페이지는 더 이상 제공되지 않습니다.',
    noindex: true,
    body: `<h1>페이지를 찾을 수 없어요</h1>
<p class="lead">우나어는 운영을 마쳐서 회원 글·일자리·검색 같은 페이지는 더 이상 제공하지 않아요.</p>
<p><a class="button-link" href="/">기록 보관소 홈으로</a></p>`,
  })

const SITE_CSS = `:root{--coral:#FF6F61;--coral-text:#C7493D;--ink:#1C2333;--muted:#5A6170;--line:#E6E8EC;--bg:#FAFAFB;--warm:#F9F5F0}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:18px;line-height:1.75;word-break:keep-all;overflow-wrap:anywhere}
a{color:var(--coral-text)}
.wrap{display:block;max-width:760px;margin:0 auto;padding:0 16px}
.site-header{background:#fff;border-bottom:1px solid var(--line)}
.header-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;min-height:52px;font-weight:800;font-size:19px;color:var(--ink);text-decoration:none}
.nav{display:flex;gap:4px}
.nav a,.footer-row a{display:inline-flex;align-items:center;min-height:52px;padding:0 12px;color:var(--ink);text-decoration:none;font-weight:600}
.notice{margin:0;background:var(--warm);border-bottom:1px solid var(--line);color:var(--muted);font-size:16px;padding:10px 0}
.main{padding-top:24px;padding-bottom:48px}
h1{font-size:28px;line-height:1.4;margin:8px 0 12px}
h2{font-size:21px;line-height:1.45;margin:32px 0 10px}
h3{font-size:18px;margin:20px 0 6px}
.lead{font-size:19px;color:var(--muted)}
.meta,.muted{color:var(--muted);font-size:16px}
.crumbs{font-size:16px;color:var(--muted)}
.crumbs a{display:inline-flex;align-items:center;min-height:52px}
.tldr{background:#fff;border:1px solid #FFD4CC;border-radius:12px;padding:16px;margin:16px 0}
.tldr p{margin:6px 0 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:4px 16px 12px;margin:20px 0}
.cards,.links{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.guide-card{display:block;min-height:52px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-decoration:none;color:var(--ink)}
.guide-card strong{display:block;font-size:18px}
.guide-card span{display:block;color:var(--muted);font-size:16px;margin-top:4px}
.links a{display:inline-flex;align-items:center;min-height:52px}
.button-link{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 20px;border-radius:12px;background:var(--coral);color:#fff;font-weight:700;text-decoration:none}
.site-footer{border-top:1px solid var(--line);background:#fff;padding:8px 0 24px}
.footer-row{display:flex;flex-wrap:wrap;gap:4px}
.copy{color:var(--muted);font-size:14px;margin:8px auto 0}
@media (min-width:768px){body{font-size:18px}h1{font-size:32px}}
`

const HEADERS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

/assets/*
  Cache-Control: public, max-age=86400
`

export function buildAll(outDir: string): BuiltPage[] {
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  const pages: Array<BuiltPage & { html: string }> = []
  const add = (p: string, title: string, description: string, html: string): void => {
    pages.push({ path: p, file: fileForPath(p), title, description, html })
  }

  add('/', HOME.title, HOME.description, renderHome())
  for (const p of [ABOUT, PRIVACY, TERMS]) {
    add(p.path, p.title, p.description, layout({ path: p.path, title: p.title, description: p.description, body: renderArchivePage(p) }))
  }
  add(GUIDE_INDEX.path, `${GUIDE_INDEX.title}${LEGACY_TITLE_SUFFIX}`, GUIDE_INDEX.description, renderGuideIndex())
  for (const g of Object.values(GUIDES)) {
    add(guidePath(g.slug), `${g.title}${LEGACY_TITLE_SUFFIX}`, g.description, renderGuide(g))
  }

  for (const pg of pages) {
    const dest = path.join(outDir, pg.file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, pg.html)
  }
  fs.writeFileSync(path.join(outDir, '404.html'), render404())
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'assets/site.css'), SITE_CSS)
  fs.writeFileSync(path.join(outDir, 'robots.txt'), ROBOTS_TXT)
  fs.writeFileSync(
    path.join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((pg) => `<url>\n<loc>${BASE_URL}${encodePath(pg.path)}</loc>\n</url>`)
      .join('\n')}\n</urlset>\n`,
  )
  fs.writeFileSync(path.join(outDir, '_redirects'), REDIRECTS.map(([from, to]) => `${from} ${to} 301`).join('\n') + '\n')
  fs.writeFileSync(path.join(outDir, '_headers'), HEADERS)
  for (const a of COPIED_ASSETS) fs.copyFileSync(path.join(REPO_ROOT, 'public', a), path.join(outDir, a))

  const manifest = pages.map(({ path: p, file, title, description }) => ({ path: p, file, title, description }))
  return manifest
}

function argOut(): string {
  const i = process.argv.indexOf('--out')
  if (i < 0 || !process.argv[i + 1]) {
    console.error('usage: tsx scripts/static-archive/build.ts --out <dir>')
    process.exit(2)
  }
  const out = path.resolve(process.argv[i + 1])
  if (out.startsWith(REPO_ROOT + path.sep)) {
    console.error(`--out 는 저장소 밖이어야 한다 (공개 저장소): ${out}`)
    process.exit(2)
  }
  return out
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const out = argOut()
  const built = buildAll(out)
  console.log(JSON.stringify({ out, pages: built.length, urls: built.map((b) => b.path) }, null, 2))
}
