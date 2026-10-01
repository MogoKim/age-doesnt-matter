/**
 * 우나어 정적 기록관 검증 게이트 — 산출물 디렉터리만 읽고 PASS/FAIL 판정한다.
 *
 * 실행: npx tsx scripts/static-archive/verify.ts --out <dir>
 *   항상 저장소의 expected-manifest.json(검토용 13 URL·title·description·canonical 고정본)과 대조한다.
 *   13/13 일치가 아니면 FAIL.
 * 종료코드: 0 = 전 게이트 PASS, 1 = FAIL 1건 이상
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { GUIDES } from '../../src/lib/guides'
import { BASE_URL, ROBOTS_TXT, encodePath, fileForPath } from './build'

/** KEEP_PUBLIC 허용 목록 — 빌더 출력이 아니라 원천(가이드 상수 + 고정 4쪽)에서 독립 산출 */
export const ALLOWLIST: string[] = ['/', '/about', '/privacy', '/terms', '/guide', ...Object.keys(GUIDES).map((s) => `/guide/${s}`)]

export interface ManifestEntry {
  path: string
  file: string
  title: string
  description: string
  canonical: string
}

const MANIFEST_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'expected-manifest.json')

export function loadExpectedManifest(): ManifestEntry[] {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as ManifestEntry[]
}

/** 사라진 커뮤니티·회원 이야기·일자리 기능을 암시하는 표현 — 산출물에 0건이어야 한다 */
export const PHANTOM_COMMUNITY: RegExp[] = [
  /아래\s*커뮤니티/,
  /커뮤니티\s*(이야기|후기|글)/,
  /실제\s*(후기|이야기|경험담|방법)/,
  /실제로\s*사\s*본/,
  /이야기로\s*이어|이어\s*드릴|이어드릴/,
  /(또래|회원)\s*(이야기|후기|꿀팁|실제)/,
  /후기가\s*많|(?<![가-힣])분이\s*많|고들\s*하/,
  /우나어\s*일자리|일자리\s*정보/,
  /여성\s*커뮤니티\s*:/,
]

/** 브랜드 금지 표현 (CLAUDE.md) */
const BANNED_WORDS = /시니어|어르신|노인|실버/

const PAGES_MAX_FILES = 20_000
const PAGES_MAX_FILE_BYTES = 25 * 1024 * 1024

/** 산출물 어디에도 있으면 안 되는 흔적 (대소문자 무시) */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['next-runtime', /\/_next\/|__next_f|__NEXT_DATA__|next-route-announcer/i],
  ['next-image', /_next\/image/i],
  ['r2.dev', /r2\.dev/i],
  ['r2-endpoint', /r2\.cloudflarestorage\.com/i],
  ['r2-custom-domain', /img\.age-doesnt-matter\.com/i],
  ['adsense', /adsbygoogle|pagead2|googlesyndication|ca-pub-/i],
  ['coupang-ads', /coupang\.com|coupa\.ng|ads-partners/i],
  ['analytics', /googletagmanager|gtag\(|google-analytics|GTM-|G-[A-Z0-9]{6,}/],
  ['kakao-sdk', /kakao\.(com|min\.js)|Kakao\./i],
  ['service-worker', /serviceWorker|sw\.js|manifest\.json|webmanifest|firebase/i],
  ['vercel', /vercel/i],
  ['turnstile', /turnstile|challenges\.cloudflare/i],
  ['api-call', /["'(]\/api\//i],
  ['form-controls', /<(form|input|button|select|textarea|iframe|embed|object)\b/i],
  ['inline-handlers', /\son[a-z]+\s*=|javascript:/i],
  ['member-surface', /\/(community|jobs|login|signup|onboarding|my|search|best|events|magazine|app-login|admin)(\/|["'?#])/i],
  ['member-marker', /탈퇴회원_|님의 글|님의 댓글|data-author|authorId/],
]

interface Issue {
  gate: string
  file: string
  detail: string
}

function walk(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p)]
  })
}

const decode = (href: string): string => decodeURIComponent(href.split('#')[0].split('?')[0])

/** Cloudflare Pages 정적 매칭 근사: /a → a.html | a/index.html, 파일 그대로 */
function resolveHref(out: string, href: string): boolean {
  const p = decode(href)
  if (p === '/') return fs.existsSync(path.join(out, 'index.html'))
  const rel = p.replace(/^\//, '')
  return [rel, `${rel}.html`, path.join(rel, 'index.html')].some((c) => fs.existsSync(path.join(out, c)) && fs.statSync(path.join(out, c)).isFile())
}

export function verify(out: string): { issues: Issue[]; summary: { manifestMatched: number } & Record<string, number> } {
  const issues: Issue[] = []
  const files = walk(out)
  const htmlFiles = files.filter((f) => f.endsWith('.html'))
  const textFiles = files.filter((f) => /\.(html|css|xml|txt)$|^_headers$|^_redirects$/.test(f))

  // G1 허용 목록 = 페이지 파일 1:1 (404.html 제외)
  const expectedFiles = new Set(ALLOWLIST.map(fileForPath))
  const pageFiles = new Set(htmlFiles.filter((f) => f !== '404.html'))
  for (const f of expectedFiles) if (!pageFiles.has(f)) issues.push({ gate: 'G1-allowlist', file: f, detail: '허용 URL 의 파일 없음' })
  for (const f of pageFiles) if (!expectedFiles.has(f)) issues.push({ gate: 'G1-allowlist', file: f, detail: '허용 목록 밖 페이지' })

  // G2 금지 흔적 0 + script 는 ld+json 만
  for (const f of textFiles) {
    const s = fs.readFileSync(path.join(out, f), 'utf8')
    const scan = f === 'robots.txt' ? '' : s // robots.txt 는 기존 파일과 바이트 동일 유지(G7)로 따로 본다
    for (const [name, re] of FORBIDDEN) {
      const m = re.exec(scan)
      if (m) issues.push({ gate: 'G2-forbidden', file: f, detail: `${name}: …${scan.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}…` })
    }
    for (const m of s.matchAll(/<script\b([^>]*)>/gi)) {
      if (!/type="application\/ld\+json"/.test(m[1])) issues.push({ gate: 'G2-script', file: f, detail: `실행 스크립트: <script${m[1]}>` })
    }
  }

  // G3 내부 링크·자산 참조 전부 실재 / G4 이미지 전부 로컬
  let imageRefs = 0
  const images = new Set<string>()
  for (const f of htmlFiles) {
    const s = fs.readFileSync(path.join(out, f), 'utf8')
    for (const m of s.matchAll(/\b(href|src)="([^"]+)"/g)) {
      const v = m[2]
      if (v.startsWith('mailto:')) continue
      if (v.startsWith(BASE_URL)) {
        if (m[1] === 'href' && !resolveHref(out, v.slice(BASE_URL.length) || '/')) issues.push({ gate: 'G3-links', file: f, detail: `절대 URL 대상 없음: ${v}` })
        continue
      }
      if (/^https?:|^\/\//.test(v)) {
        issues.push({ gate: 'G3-external', file: f, detail: `외부 참조: ${v}` })
        continue
      }
      if (!resolveHref(out, v)) issues.push({ gate: 'G3-links', file: f, detail: `대상 없음: ${v}` })
    }
    for (const m of s.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      imageRefs++
      images.add(m[1])
      if (!m[1].startsWith('/')) issues.push({ gate: 'G4-images', file: f, detail: `로컬 아닌 이미지: ${m[1]}` })
    }
  }

  // G5 페이지별 canonical·robots·h1
  for (const p of ALLOWLIST) {
    const f = fileForPath(p)
    if (!fs.existsSync(path.join(out, f))) continue
    const s = fs.readFileSync(path.join(out, f), 'utf8')
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(s)?.[1]
    const want = `${BASE_URL}${encodePath(p)}`
    if (canonical !== want) issues.push({ gate: 'G5-canonical', file: f, detail: `${canonical} ≠ ${want}` })
    if (!/<meta name="robots" content="index, follow">/.test(s)) issues.push({ gate: 'G5-robots-meta', file: f, detail: 'index, follow 아님' })
    if ((s.match(/<h1\b/g) ?? []).length !== 1) issues.push({ gate: 'G5-h1', file: f, detail: 'h1 이 1개가 아님' })
    if (!/<title>[^<]+<\/title>/.test(s) || !/<meta name="description" content="[^"]+">/.test(s)) issues.push({ gate: 'G5-meta', file: f, detail: 'title/description 없음' })
  }

  // G6 검토용 expected manifest 와 13/13 일치 (경로 집합 = 허용 목록)
  const manifest = loadExpectedManifest()
  const unescape = (x: string): string => x.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  if (JSON.stringify(manifest.map((m) => m.path).sort()) !== JSON.stringify([...ALLOWLIST].sort())) {
    issues.push({ gate: 'G6-manifest', file: 'expected-manifest.json', detail: 'manifest 경로 집합 ≠ 허용 목록' })
  }
  let manifestMatched = 0
  for (const m of manifest) {
    const f = path.join(out, m.file)
    if (m.file !== fileForPath(m.path) || !fs.existsSync(f)) {
      issues.push({ gate: 'G6-manifest', file: m.file, detail: '파일 없음 또는 경로·파일 불일치' })
      continue
    }
    const s = fs.readFileSync(f, 'utf8')
    const got = {
      title: unescape(/<title>([^<]*)<\/title>/.exec(s)?.[1] ?? ''),
      description: unescape(/<meta name="description" content="([^"]*)">/.exec(s)?.[1] ?? ''),
      canonical: /<link rel="canonical" href="([^"]+)"/.exec(s)?.[1] ?? '',
    }
    const diffs = (['title', 'description', 'canonical'] as const).filter((k) => got[k] !== m[k])
    if (diffs.length === 0) manifestMatched++
    else issues.push({ gate: 'G6-manifest', file: m.file, detail: diffs.map((k) => `${k}: ${got[k]} ≠ ${m[k]}`).join(' / ') })
  }
  if (manifestMatched !== ALLOWLIST.length) {
    issues.push({ gate: 'G6-manifest', file: '*', detail: `manifest 일치 ${manifestMatched}/${ALLOWLIST.length}` })
  }

  // G10 사라진 커뮤니티 암시 0 · G11 금지 표현 0 (title·meta·JSON-LD·본문 전부)
  for (const f of htmlFiles) {
    const s = fs.readFileSync(path.join(out, f), 'utf8')
    for (const re of PHANTOM_COMMUNITY) {
      const m = re.exec(s)
      if (m) issues.push({ gate: 'G10-phantom-community', file: f, detail: `${re}: …${s.slice(Math.max(0, m.index - 20), m.index + 30)}…` })
    }
    const b = BANNED_WORDS.exec(s)
    if (b) issues.push({ gate: 'G11-banned-words', file: f, detail: `…${s.slice(Math.max(0, b.index - 20), b.index + 20)}…` })
  }

  // G7 robots.txt 기존과 동일 · sitemap = 허용 목록
  const robots = fs.existsSync(path.join(out, 'robots.txt')) ? fs.readFileSync(path.join(out, 'robots.txt'), 'utf8') : ''
  if (robots !== ROBOTS_TXT) issues.push({ gate: 'G7-robots', file: 'robots.txt', detail: '기존 robots.txt 와 다름' })
  const sitemap = fs.existsSync(path.join(out, 'sitemap.xml')) ? fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8') : ''
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort()
  const wantLocs = ALLOWLIST.map((p) => `${BASE_URL}${encodePath(p)}`).sort()
  if (JSON.stringify(locs) !== JSON.stringify(wantLocs)) issues.push({ gate: 'G7-sitemap', file: 'sitemap.xml', detail: `loc ${locs.length}개 ≠ 허용 ${wantLocs.length}개` })

  // G8 Cloudflare Pages 한도
  let totalBytes = 0
  for (const f of files) {
    const n = fs.statSync(path.join(out, f)).size
    totalBytes += n
    if (n > PAGES_MAX_FILE_BYTES) issues.push({ gate: 'G8-file-size', file: f, detail: `${n} bytes > 25MiB` })
  }
  if (files.length >= PAGES_MAX_FILES) issues.push({ gate: 'G8-file-count', file: '*', detail: `${files.length} ≥ 20000` })

  // G9 404 는 실제 404 페이지 + noindex · _redirects 대상 실재
  const nf = fs.existsSync(path.join(out, '404.html')) ? fs.readFileSync(path.join(out, '404.html'), 'utf8') : ''
  if (!/<meta name="robots" content="noindex/.test(nf)) issues.push({ gate: 'G9-404', file: '404.html', detail: '404.html 없음 또는 noindex 아님' })
  const redirects = fs.existsSync(path.join(out, '_redirects')) ? fs.readFileSync(path.join(out, '_redirects'), 'utf8').trim().split('\n').filter(Boolean) : []
  for (const line of redirects) {
    const [, to, code] = line.split(/\s+/)
    if (code !== '301' || !resolveHref(out, to)) issues.push({ gate: 'G9-redirects', file: '_redirects', detail: line })
  }

  return {
    issues,
    summary: {
      manifestMatched,
      urls: ALLOWLIST.length,
      htmlFiles: htmlFiles.length,
      totalFiles: files.length,
      totalBytes,
      imageRefs,
      uniqueImages: images.size,
      redirects: redirects.length,
    },
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const arg = (k: string): string | undefined => {
    const i = process.argv.indexOf(k)
    return i >= 0 ? process.argv[i + 1] : undefined
  }
  const out = arg('--out')
  if (!out) {
    console.error('usage: tsx scripts/static-archive/verify.ts --out <dir>')
    process.exit(2)
  }
  const r = verify(path.resolve(out))
  console.log(JSON.stringify({ result: r.issues.length === 0 ? 'PASS' : 'FAIL', ...r.summary, issues: r.issues }, null, 2))
  process.exit(r.issues.length === 0 ? 0 : 1)
}
