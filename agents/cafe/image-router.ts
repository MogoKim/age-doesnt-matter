// A31 P3: 이미지 있는 CafePost → Sheet PENDING append
// GHA: agents-cafe-hourly-curation.yml (content-curator 이전 실행)
// 실제 append는 ENABLE_IMAGE_ROUTER=true 환경변수 필요
// DRY_RUN_IMAGE_ROUTER=true 기본값 — 실제 append 전 시뮬레이션
import { prisma } from '../core/db.js'
import { sendSlackMessage } from '../core/notifier.js'
import { readAllSheetUrls, countPendingTotal, appendRow } from '../community/sheets-client.js'
import { isStoryGuarded } from './curator-shared.js'
import { hasPoliticalKeyword } from '../core/political-blocklist.js'

// cap을 운영 변수(GitHub Variables / env)로 조절. 미설정·비정상 값이면 기본값 사용.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}
const DAY_CAP = envInt('IMAGE_ROUTER_DAY_CAP', 3)
const TAB_CAP = envInt('IMAGE_ROUTER_TAB_CAP', 1)
const PENDING_BACKLOG_LIMIT = envInt('IMAGE_ROUTER_PENDING_BACKLOG_LIMIT', 10)

// 이미지 글 자동 게시(Sheet PENDING append)에서 제외할 카페.
// wgang(우아한 갱년기): 이미지 글은 게시하지 않음. 수집(crawler)·텍스트 글 활용(trend/content-curator)은 유지.
const IMAGE_ROUTER_EXCLUDED_CAFE_IDS = ['wgang']

const HUMOR_CATS = new Set(['HUMOR', 'ENTERTAIN'])
// JOB 제외 — JOB(자격증·정보성)은 STORY(사는이야기)로. 재취업 맥락은 psych가 RETIRE로 매겨 LIFE2.
const MONEY_CATS = new Set(['MONEY', 'RETIRE', 'HOUSING'])

function resolveTab(desireCategory: string | null, isPopular: boolean, killerScore: number): string {
  const hot = isPopular || killerScore >= 75
  let base = '사는이야기'
  if (HUMOR_CATS.has(desireCategory ?? '')) base = '웃음방'
  else if (MONEY_CATS.has(desireCategory ?? '')) base = '2막준비'
  return hot ? `${base}_화제성` : base
}

function getKstMidnight(): Date {
  const kstDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  return new Date(`${kstDateStr}T00:00:00+09:00`)
}

export async function main(): Promise<void> {
  const startTime = Date.now()

  if (process.env.ENABLE_IMAGE_ROUTER !== 'true') {
    console.log('[ImageRouter] 비활성 상태 — ENABLE_IMAGE_ROUTER !== true')
    return
  }

  const dryRun = process.env.DRY_RUN_IMAGE_ROUTER === 'true'
  console.log(`[ImageRouter] 시작 | dryRun=${dryRun}`)

  try {
    // DAY_CAP: KST 오늘 SUCCESS append 합산
    const kstMidnight = getKstMidnight()
    const agg = await prisma.botLog.aggregate({
      _sum: { publishedCount: true },
      where: {
        action: 'IMAGE_ROUTE',
        status: { in: ['SUCCESS', 'PARTIAL'] },
        createdAt: { gte: kstMidnight },
      },
    })
    const todayAppended = agg._sum.publishedCount ?? 0
    if (todayAppended >= DAY_CAP) {
      console.log(`[ImageRouter] DAY_CAP 도달 (${todayAppended}/${DAY_CAP}) — SKIP`)
      await prisma.botLog.create({
        data: {
          botType: 'CAFE_CRAWLER',
          status: 'SKIP',
          action: 'IMAGE_ROUTE',
          publishedCount: 0,
          executionTimeMs: Date.now() - startTime,
          logData: { reason: 'day_cap', todayAppended, dayCap: DAY_CAP, tabCap: TAB_CAP, pendingBacklogLimit: PENDING_BACKLOG_LIMIT },
        },
      })
      return
    }
    const remainingCap = DAY_CAP - todayAppended

    // Sheet URL 수집 — 인증/API 실패는 append 전체 차단
    let sheetUrlSet: Set<string>
    try {
      sheetUrlSet = await readAllSheetUrls()
    } catch (err) {
      console.error('[ImageRouter] Sheet URL 수집 실패 — append 중단', err)
      await prisma.botLog.create({
        data: {
          botType: 'CAFE_CRAWLER',
          status: 'FAILED',
          action: 'IMAGE_ROUTE',
          publishedCount: 0,
          executionTimeMs: Date.now() - startTime,
          logData: { reason: 'sheet_read_error', error: String(err) },
        },
      })
      return
    }

    // PENDING 적체 체크
    const pendingTotal = await countPendingTotal()
    if (pendingTotal >= PENDING_BACKLOG_LIMIT) {
      console.log(`[ImageRouter] PENDING 적체 (${pendingTotal}건 ≥ ${PENDING_BACKLOG_LIMIT}) — SKIP`)
      await prisma.botLog.create({
        data: {
          botType: 'CAFE_CRAWLER',
          status: 'SKIP',
          action: 'IMAGE_ROUTE',
          publishedCount: 0,
          executionTimeMs: Date.now() - startTime,
          logData: { reason: 'pending_backlog', pendingTotal, dayCap: DAY_CAP, tabCap: TAB_CAP, pendingBacklogLimit: PENDING_BACKLOG_LIMIT },
        },
      })
      return
    }

    // 후보 조회: imageUrls 있음, isUsable=true, usedAt=null, killerScore≥50
    const candidates = await prisma.cafePost.findMany({
      where: {
        cafeId: { notIn: IMAGE_ROUTER_EXCLUDED_CAFE_IDS },  // wgang 이미지 글 자동 게시 제외
        isUsable: true,
        usedAt: null,
        imageUrls: { isEmpty: false },
        videoUrls: { isEmpty: true },
        killerScore: { gte: 50 },
      },
      orderBy: { killerScore: 'desc' },
      select: {
        id: true,
        postUrl: true,
        title: true,
        content: true,
        desireCategory: true,
        killerScore: true,
        isPopular: true,
      },
    })

    // postUrl 없는 글 제외 (Prisma v7 postUrl:{not:null} 미지원 → 코드 레벨 필터)
    const withUrl = candidates.filter((c): c is typeof c & { postUrl: string } => !!c.postUrl)

    // Post.sourceUrl 중복 제외
    const postUrls = withUrl.map(c => c.postUrl)
    const published = await prisma.post.findMany({
      where: { sourceUrl: { in: postUrls } },
      select: { sourceUrl: true },
    })
    const publishedSet = new Set(published.map(p => p.sourceUrl).filter(Boolean) as string[])

    // Sheet URL 중복 제외
    const deduped = withUrl.filter(
      c => !publishedSet.has(c.postUrl) && !sheetUrlSet.has(c.postUrl),
    )

    // 정치 키워드 hard block — Sheet append 전 정치색 후보 제외 (P0)
    const politicalFiltered = deduped.filter(c => !hasPoliticalKeyword(c.title, c.content ?? ''))
    const politicalBlockedCount = deduped.length - politicalFiltered.length

    console.log(
      `[ImageRouter] 후보: ${candidates.length}건 → postUrl 있음: ${withUrl.length}건 → 중복제외: ${deduped.length}건 → 정치제외: ${politicalBlockedCount}건`,
    )

    // 탭 배정 + cap 적용
    const tabCount: Record<string, number> = {}
    type Selected = { tab: string; postUrl: string; cafePostId: string; killerScore: number }
    const selected: Selected[] = []

    for (const c of politicalFiltered) {
      if (selected.length >= remainingCap) break
      // 제목 guard 후처리 — psych가 LIFE2로 매겼어도 생활/소음/고장/돌봄 신호만 있으면 STORY로 강등
      const effectiveDesire = isStoryGuarded(c.title) ? 'GENERAL' : c.desireCategory
      const tab = resolveTab(effectiveDesire, c.isPopular, c.killerScore)
      if ((tabCount[tab] ?? 0) >= TAB_CAP) continue
      tabCount[tab] = (tabCount[tab] ?? 0) + 1
      selected.push({ tab, postUrl: c.postUrl, cafePostId: c.id, killerScore: c.killerScore })
    }

    // DRY_RUN: BotLog status=SKIP, publishedCount=0, logData.reason='dry_run'
    if (dryRun) {
      console.log(`[ImageRouter] DRY_RUN — append 예정 ${selected.length}건`)
      for (const s of selected) {
        console.log(`  tab=${s.tab} | killer=${s.killerScore} | url=${s.postUrl}`)
      }
      await prisma.botLog.create({
        data: {
          botType: 'CAFE_CRAWLER',
          status: 'SKIP',
          action: 'IMAGE_ROUTE',
          publishedCount: 0,
          executionTimeMs: Date.now() - startTime,
          logData: {
            reason: 'dry_run',
            wouldAppend: selected.map(s => ({ tab: s.tab, url: s.postUrl, killerScore: s.killerScore })),
            dayCap: DAY_CAP,
            tabCap: TAB_CAP,
            pendingBacklogLimit: PENDING_BACKLOG_LIMIT,
          },
        },
      })
      return
    }

    // 실제 append
    let successCount = 0
    let failCount = 0
    for (const s of selected) {
      try {
        await appendRow(s.tab, s.postUrl, s.cafePostId)
        successCount++
        console.log(`[ImageRouter] append 완료: ${s.tab} | ${s.postUrl}`)
      } catch (err) {
        console.error(`[ImageRouter] append 실패: ${s.tab} | ${s.postUrl}`, err)
        failCount++
      }
    }

    const status =
      successCount === 0 && failCount > 0
        ? 'FAILED'
        : failCount > 0
          ? 'PARTIAL'
          : 'SUCCESS'

    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        status,
        action: 'IMAGE_ROUTE',
        publishedCount: successCount,
        executionTimeMs: Date.now() - startTime,
        logData: {
          appendedCount: successCount,
          failedCount: failCount,
          todayTotal: todayAppended + successCount,
          tabBreakdown: tabCount,
          politicalBlockedCount,
          dayCap: DAY_CAP,
          tabCap: TAB_CAP,
          pendingBacklogLimit: PENDING_BACKLOG_LIMIT,
        },
      },
    })

    if (failCount > 0) {
      await sendSlackMessage(
        'SYSTEM',
        `[ImageRouter] ⚠️ append 일부 실패 — 성공 ${successCount}건 / 실패 ${failCount}건`,
      ).catch(() => {})
    }

    console.log(`[ImageRouter] 완료 | status=${status} | success=${successCount} | fail=${failCount}`)
  } catch (err) {
    // 예상 밖 오류 — content-curator step으로 전파하지 않음
    console.error('[ImageRouter] 예상 밖 오류', err)
    try {
      await prisma.botLog.create({
        data: {
          botType: 'CAFE_CRAWLER',
          status: 'FAILED',
          action: 'IMAGE_ROUTE',
          publishedCount: 0,
          executionTimeMs: Date.now() - startTime,
          logData: { reason: 'unexpected_error', error: String(err) },
        },
      })
    } catch (logErr) {
      console.error('[ImageRouter] BotLog 기록 실패', logErr)
    }
  }
}
