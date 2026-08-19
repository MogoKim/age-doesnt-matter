/**
 * L1 수집 레이어 — 82cook 자유게시판(bn=15) 후보 수집
 *
 * 이 레이어가 하지 않는 것 (설계상 절대):
 *   - DB write 없음 (prisma import 자체를 하지 않는다)
 *   - Sheet write 없음
 *   - AI 호출 없음
 *   - 판정 없음 (gate는 L2의 일이다)
 *   - 상세 페이지 요청 없음 (목록만. 상세는 승인 후 별도 단계)
 *
 * 출력은 `data/raw-*.jsonl` 파일 하나뿐이다.
 *
 * 실행:
 *   npx tsx agents/cook82/collector.ts --from-cache      # 네트워크 0 (dry-run 검증용)
 *   npx tsx agents/cook82/collector.ts --pages=5         # 라이브 — kill switch 필요
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ensureDataDir, rawPath, stampKst } from './paths.js'
import type { RawCandidate } from './types.js'

export const COLLECTOR_VERSION = 'c1'

const SOURCE_BOARD = 'bn=15'
const LIST_URL = (page: number): string => `https://www.82cook.com/entiz/enti.php?bn=15&page=${page}`
const POST_URL = (num: string): string => `https://www.82cook.com/entiz/read.php?bn=15&num=${num}`

/** 요청 간 지연 — 상대 서버 부하 최소화 */
const DELAY_MS = 2000
/** 안전 상한. 이보다 많은 페이지는 요청하지 않는다. */
const MAX_PAGES = 10

const ROW_RE = /<tr([^>]*)>([\s\S]*?)<\/tr>/g
const TITLE_RE = /<td class="title"[^>]*>\s*<a\s+href="(read\.php\?bn=15[^"]+)"[^>]*>([\s\S]*?)<\/a>(?:\s*<em>(\d+)<\/em>)?/
const NUM_RE = /num=(\d+)/
const NUMBERS_RE = /<td class="numbers">(\d+)<\/td>/g

function unescapeHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/** 목록 HTML 1페이지 → 후보들. 순수 파싱, 부작용 없음. */
export function parseListPage(html: string, page: number, collectedAt: string): RawCandidate[] {
  const out: RawCandidate[] = []
  ROW_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ROW_RE.exec(html)) !== null) {
    const [, attr, body] = m
    if (attr.includes('noticeList')) continue // 공지 제외
    const t = TITLE_RE.exec(body)
    if (!t) continue
    const title = unescapeHtml(t[2])
    if (!title) continue
    const numMatch = NUM_RE.exec(t[1])
    if (!numMatch) continue
    const num = numMatch[1]

    NUMBERS_RE.lastIndex = 0
    const nums: string[] = []
    let n: RegExpExecArray | null
    while ((n = NUMBERS_RE.exec(body)) !== null) nums.push(n[1])
    // 조회수는 목록 구조에 따라 없을 수 있다 — null 허용 (M2-7 D절)
    const viewCount = nums.length > 0 ? Number(nums[nums.length - 1]) : null

    out.push({
      candidateId: `cook82:15:${num}`,
      sourceUrl: POST_URL(num),
      sourceSite: 'cook82',
      sourceBoard: SOURCE_BOARD,
      collectorVersion: COLLECTOR_VERSION,
      title,
      listPage: page,
      collectedAt,
      commentCount: t[3] ? Number(t[3]) : 0,
      viewCount,
    })
  }
  return out
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function fetchListPage(page: number): Promise<string> {
  const res = await fetch(LIST_URL(page), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`82cook 목록 ${page}p 응답 ${res.status}`)
  return await res.text()
}

interface CollectOptions {
  pages: number
  fromCache: boolean
  cacheTemplate: string
}

function parseArgs(argv: string[]): CollectOptions {
  const pagesArg = argv.find((a) => a.startsWith('--pages='))
  const cacheArg = argv.find((a) => a.startsWith('--cache-template='))
  const requested = pagesArg ? Number(pagesArg.split('=')[1]) : 3
  return {
    pages: Math.min(Math.max(1, Number.isFinite(requested) ? requested : 3), MAX_PAGES),
    fromCache: argv.includes('--from-cache'),
    cacheTemplate: cacheArg ? cacheArg.split('=')[1] : '/tmp/82list{page}.html',
  }
}

export async function collect(opts: CollectOptions): Promise<RawCandidate[]> {
  const collectedAt = new Date().toISOString()
  const seen = new Set<string>()
  const all: RawCandidate[] = []

  for (let page = 1; page <= opts.pages; page++) {
    let html: string
    if (opts.fromCache) {
      const file = opts.cacheTemplate.replace('{page}', String(page))
      if (!existsSync(file)) {
        console.log(`[collector] 캐시 없음 ${file} — 건너뜀 (라이브 요청하지 않음)`)
        continue
      }
      html = readFileSync(file, 'utf-8')
    } else {
      html = await fetchListPage(page)
      if (page < opts.pages) await sleep(DELAY_MS)
    }
    const rows = parseListPage(html, page, collectedAt)
    for (const r of rows) {
      if (seen.has(r.candidateId)) continue
      seen.add(r.candidateId)
      all.push(r)
    }
    console.log(`[collector] ${page}p → ${rows.length}건 (누적 ${all.length})`)
  }
  return all
}

export async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const enabled = process.env.COOK82_COLLECTOR_ENABLED === 'true'

  // ★ kill switch — 라이브 요청은 스위치가 켜져야만 가능하다.
  //   캐시 모드는 네트워크를 쓰지 않으므로 스위치 없이 허용한다.
  if (!opts.fromCache && !enabled) {
    console.log('[collector] 중단: COOK82_COLLECTOR_ENABLED=true 가 아닙니다.')
    console.log('[collector] 네트워크 없이 검증하려면 --from-cache 를 쓰세요.')
    return
  }

  console.log(`[collector] mode=${opts.fromCache ? 'cache(네트워크 0)' : 'live'} pages=${opts.pages}`)
  const rows = await collect(opts)

  // sourceBoard 오염 방어 — bn=15 외 값이 섞이면 즉시 정지 (M2-7 D절)
  const foreign = rows.filter((r) => r.sourceBoard !== SOURCE_BOARD)
  if (foreign.length > 0) {
    throw new Error(`[collector] bn=15 외 게시판 ${foreign.length}건 감지 — 정지`)
  }

  ensureDataDir()
  const out = rawPath(stampKst())
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8')
  console.log(`[collector] ${rows.length}건 → ${out}`)
  console.log('[collector] DB write 0 · Sheet write 0 · AI 호출 0')
}

const invokedDirectly = process.argv[1]?.includes('collector')
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('[collector] 실패:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
