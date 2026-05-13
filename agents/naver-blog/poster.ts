/**
 * 네이버 블로그 수동 발행 헬퍼 — 메인 오케스트레이터
 *
 * 실행 흐름:
 *   1. Pre-flight (잠금 파일 + 큐 읽기 가능 여부)
 *   2. stale 항목 expired 처리
 *   3. catch-up 1건 + 정기 슬롯 1건 (최대 2건/회)
 *   4. DB에서 매거진 포스트 조회 → LLM 재작성 → DALL-E 이미지 생성/R2 업로드
 *   5. queue.json에 ready_for_manual 저장 + Slack "/admin/naver-blog" 알림
 *
 * DRY_RUN=true 시: markReadyForManual 스킵, 큐 미갱신
 *
 * // LOCAL ONLY — launchd 전용 (12:30/18:30 KST)
 */

import { existsSync, writeFileSync, unlinkSync, readFileSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  BLOG_HALTED_FLAG,
  BLOG_DIR,
  POSTING_POLICY,
  kstNow,
  sleep,
  randomDelay,
} from './config.js'
import {
  expireStaleItems,
  getCatchupItem,
  getNextScheduledItem,
  getTodayPostedCount,
  addToQueue,
  markReadyForManual,
  markFailed,
  shouldHalt,
  getQueueSummary,
  type QueueItem,
} from './queue-manager.js'
import { transformTooBlogContent } from './content-transformer.js'
import { extractImagesFromHtml } from './image-handler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// ── 환경변수 로드 (launchd 독립 실행 시 .env.local 미상속) ──
function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch { /* 파일 없으면 무시 */ }
}
loadEnvFile(resolve(projectRoot, '.env.local'))
loadEnvFile(resolve(projectRoot, '.env'))

const { sendSlackMessage } = await import('../core/notifier.js')

// ── 상수 ──

const LOCK_FILE = resolve(BLOG_DIR, '.blog-posting.lock')
const DRY_RUN = process.env.DRY_RUN === 'true'

// ── 잠금 파일 관리 (중복 실행 방지) ──

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    // 30분 이상 된 잠금 파일은 stale로 간주해 강제 제거
    try {
      const stat = statSync(LOCK_FILE)
      const ageMs = Date.now() - stat.mtimeMs
      if (ageMs > 30 * 60 * 1000) {
        unlinkSync(LOCK_FILE)
        console.log('[Poster] Stale 잠금 파일 제거 — 계속 진행')
      } else {
        console.warn('[Poster] 잠금 파일 존재 — 이미 실행 중, 종료')
        return false
      }
    } catch {
      return false
    }
  }
  writeFileSync(LOCK_FILE, `${process.pid}\n${kstNow()}`)
  return true
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE)
  } catch { /* ignore */ }
}

// ── DB 헬퍼 ──

interface MagazinePost {
  id: string
  title: string
  content: string
  summary: string | null
  seoDescription: string | null
  thumbnailUrl: string | null
  category: string | null
}

async function fetchMagazinePost(magazinePostId: string): Promise<MagazinePost | null> {
  const { prisma } = await import('../core/db.js')
  return await prisma.post.findUnique({
    where: { id: magazinePostId },
    select: {
      id: true,
      title: true,
      content: true,
      summary: true,
      seoDescription: true,
      thumbnailUrl: true,
      category: true,
    },
  })
}

async function fetchTodayUnpublishedMagazineIds(): Promise<
  Array<{ id: string; title: string; category: string | null; createdAt: Date }>
> {
  const { prisma } = await import('../core/db.js')
  const kstOffset = 9 * 60 * 60 * 1000
  const nowMs = Date.now()
  const todayStartUtc = new Date(Math.floor((nowMs + kstOffset) / 86_400_000) * 86_400_000 - kstOffset)

  return await prisma.post.findMany({
    where: {
      boardType: 'MAGAZINE',
      status: 'PUBLISHED',
      createdAt: { gte: todayStartUtc },
    },
    select: { id: true, title: true, category: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
}

// ── Gemini 이미지 생성 + R2 업로드 ──

async function generateBlogImages(post: MagazinePost, imagePrompts: string[]): Promise<string[]> {
  const urls: string[] = []

  // 1. 기존 이미지 수집 (매거진 thumbnailUrl + 본문 HTML 이미지)
  if (post.thumbnailUrl) urls.push(post.thumbnailUrl)
  const bodyImgs = extractImagesFromHtml(post.content ?? '')
    .filter(u => u !== post.thumbnailUrl)
    .slice(0, 2)
  urls.push(...bodyImgs)

  // 2. Gemini로 부족분 채움 (목표 6개, 최소 3개)
  const needed = Math.max(6 - urls.length, 3)
  const prompts = [...imagePrompts]
  while (prompts.length < needed && imagePrompts.length > 0) {
    prompts.push(imagePrompts[imagePrompts.length - 1])
  }

  if (prompts.length === 0) {
    console.warn('[Poster] imagePrompts 없음 — 기존 이미지만 사용')
    return urls
  }

  const { generateWithGemini } = await import(
    '../design/graphic-designer/skills/gemini-scraper.js'
  )
  const { uploadToR2 } = await import('../../src/lib/r2.js')

  for (let i = 0; i < Math.min(needed, prompts.length); i++) {
    try {
      const results = await generateWithGemini(prompts[i], '1:1')
      const buffer = results[0]?.buffer
      if (!buffer || buffer.length < 10_000) {
        console.warn(`[Poster] Gemini 이미지 ${i + 1} 생성 실패 (buffer 없음)`)
        continue
      }
      const key = `naver-blog/generated/${Date.now()}-${i}.png`
      const { url } = await uploadToR2(buffer, key, 'image/png')
      urls.push(url)
      console.log(`[Poster] Gemini 이미지 ${i + 1} R2 업로드: ${url.slice(0, 70)}...`)
    } catch (err) {
      console.warn(`[Poster] Gemini 이미지 ${i + 1} 오류:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`[Poster] 이미지 준비 완료: 총 ${urls.length}개 (기존 ${urls.length - Math.min(needed, prompts.length)} + Gemini ${urls.length - (post.thumbnailUrl ? 1 : 0) - bodyImgs.length}개)`)
  return urls
}

// ── 단일 항목 변환 처리 (수동 발행 대기로 전환) ──

async function processQueueItem(item: QueueItem): Promise<void> {
  console.log(`[Poster] 변환 시작: "${item.title}" (queueId=${item.queueId})`)

  // 1. DB에서 포스트 조회
  const post = await fetchMagazinePost(item.magazinePostId)
  if (!post) {
    await markFailed(item.queueId, `DB에서 포스트 미발견 (id=${item.magazinePostId})`)
    return
  }

  // 2. LLM 재작성 (imagePrompts 포함)
  let blogContent
  try {
    blogContent = await transformTooBlogContent({
      id: post.id,
      title: post.title,
      content: post.content,
      summary: post.summary,
      seoDescription: post.seoDescription,
      thumbnailUrl: post.thumbnailUrl,
      category: post.category,
    })
  } catch (err) {
    const reason = `콘텐츠 변환 실패: ${err instanceof Error ? err.message : String(err)}`
    await markFailed(item.queueId, reason)
    console.error(`[Poster] ${reason}`)
    return
  }

  // 3. 이미지 생성 (Gemini + R2)
  let imageUrls: string[] = []
  try {
    imageUrls = await generateBlogImages(post, blogContent.imagePrompts)
  } catch (err) {
    console.warn(`[Poster] 이미지 생성 전체 실패 — 이미지 없이 진행: ${err instanceof Error ? err.message : err}`)
  }

  if (DRY_RUN) {
    console.log(`[Poster] [DRY_RUN] 변환 완료 — "${item.title}" 이미지: ${imageUrls.length}개`)
    console.log(`[DRY_RUN] blogTitle: ${blogContent.blogTitle}`)
    console.log(`[DRY_RUN] sections: ${blogContent.sections.length}개`)
    console.log(`[DRY_RUN] hashtags: ${blogContent.hashtags.join(' ')}`)
    return
  }

  // 4. 수동 발행 대기 상태로 전환
  await markReadyForManual(item.queueId, blogContent, imageUrls)

  // 5. Slack 알림
  await sendSlackMessage({
    channel: process.env.SLACK_CHANNEL_MAGAZINE ?? '',
    level: 'info',
    message: `📝 *Naver 발행 대기*\n"${item.title}"\n🖼️ 이미지 ${imageUrls.length}개 준비\n→ /admin/naver-blog 에서 복붙 발행 후 완료 처리`,
  })
}

// ── 메인 발행 루프 ──

export async function runPoster(): Promise<void> {
  console.log(`[Poster] 실행 시작 (${kstNow()}) DRY_RUN=${DRY_RUN}`)

  if (existsSync(BLOG_HALTED_FLAG)) {
    console.error('[Poster] BLOG_HALTED 플래그 존재 — 전면 차단')
    return
  }

  if (!acquireLock()) return

  try {
    // stale 항목 expired 처리
    const expiredCount = await expireStaleItems()
    if (expiredCount > 0) console.log(`[Poster] Expired 처리: ${expiredCount}건`)

    // 오늘 매거진 포스트 큐 적재
    const todayPosts = await fetchTodayUnpublishedMagazineIds()
    for (const p of todayPosts) {
      const targetTime = new Date(p.createdAt)
      const kstHour = (targetTime.getUTCHours() + 9) % 24
      // 15시 이전 → KST 12:30 (UTC 03:30), 15시 이후 → KST 18:30 (UTC 09:30)
      targetTime.setUTCHours(kstHour < 15 ? 3 : 9, 30, 0, 0)
      await addToQueue({
        magazinePostId: p.id,
        title: p.title,
        category: p.category ?? '라이프',
        targetTime,
      })
    }

    // 오늘 발행 수 체크
    const todayPosted = await getTodayPostedCount()
    if (todayPosted >= POSTING_POLICY.maxPerDayNormal) {
      console.log(`[Poster] 오늘 이미 ${todayPosted}건 발행 완료 — 종료`)
      return
    }

    let publishedCount = 0

    // Catch-up 항목 처리 (최대 1건)
    const catchupItem = await getCatchupItem()
    if (catchupItem && publishedCount < POSTING_POLICY.maxPerRun) {
      await processQueueItem(catchupItem)
      publishedCount++
      if (existsSync(BLOG_HALTED_FLAG)) return
    }

    // 정기 슬롯 처리 (최대 1건, 연속 발행 방지 딜레이)
    if (publishedCount < POSTING_POLICY.maxPerRun && todayPosted + publishedCount < POSTING_POLICY.maxPerDayNormal) {
      const scheduledItem = await getNextScheduledItem()
      if (scheduledItem) {
        if (publishedCount > 0) {
          await sleep(randomDelay(3 * 60 * 1000, 0.8, 1.2))  // 최소 ~2.4분 간격
        }
        await processQueueItem(scheduledItem)
        publishedCount++
      }
    }

    // 연속 실패 임계값 초과 시 BLOG_HALTED
    if ((await shouldHalt()) && !existsSync(BLOG_HALTED_FLAG)) {
      writeFileSync(BLOG_HALTED_FLAG, kstNow())
      await sendSlackMessage({
        channel: process.env.SLACK_CHANNEL_SYSTEM ?? '',
        level: 'critical',
        message: `🚨 *BLOG_HALTED — 연속 실패 임계값 초과*\n\`npx tsx agents/naver-blog/export-blog-cookies.ts\``,
      })
    }

    if (publishedCount === 0) {
      console.log('[Poster] 발행할 항목 없음')
    } else {
      const summary = await getQueueSummary()
      console.log(`[Poster] 완료 — 발행 ${publishedCount}건 | pending=${summary.pending} posted=${summary.posted} failed=${summary.failed}`)
    }
  } finally {
    releaseLock()
    // DB 연결 해제 (runPoster 종료 시 단일 호출)
    try {
      const { disconnect } = await import('../core/db.js')
      await disconnect()
    } catch { /* ignore */ }
  }
}
