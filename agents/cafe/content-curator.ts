// LOCAL ONLY — 카페 콘텐츠 큐레이션은 크롤링 데이터 의존, 로컬 실행
/**
 * 콘텐츠 큐레이터
 * 카페 트렌드 분석 결과를 기반으로 우나어 페르소나가 쓸 글/댓글을 생성
 * 원본 복붙 X → 주제와 감정만 참고해 오리지널 콘텐츠 작성
 */
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack, sendSlackMessage } from '../core/notifier.js'
import type { CuratedContent } from './types.js'
import { loadTodayBrief } from './daily-brief.js'

import {
  type PersonaMatch,
  PERSONAS,
  DESIRE_PERSONA_MAP,
  matchPersona,
  resolveCommunityBoard,
  guessDesire,
  stripMarkdown,
  replaceCafeReferences,
  toCuratedHtmlContent,
  toCuratedSummary,
} from './curator-shared.js'
import { getCuratorBotUser, countTodayPostsByPersona, AUTHOR_DAILY_POST_CAP } from './curator-users.js'
import { DLXOGNS01_ALLOWED_BOARDS } from './config.js'
import { generateCommunitySlug } from '../core/slug.js'
import { computeUsableCount } from './compute-usable-count.js'

// ─── 후보 풀 / skipReason 타입 ─────────────────────────────────
type SkipReason =
  | 'DESIRE_EXHAUSTED'
  | 'KEYWORD_OVERLAP'
  | 'REFS_EMPTY'
  | 'LOW_USABLE_COMMENTS'
  | 'AUTHOR_DAILY_CAP'
  | 'GENERATION_FAILED'
  | 'SEASON_MISMATCH'
  | 'DUPLICATE_TITLE'
  | 'PUBLISH_FAILED'

interface CandidateTopic {
  topic: string
  source: 'killer' | 'trend'
  cafePostId?: string
  postedAt?: Date
  killerScore?: number
  desireCategory?: string
}

interface TopicResult extends CandidateTopic {
  refsCount: number
  skipReason: SkipReason | null
  candidatesBeforeUsableFilter?: number
  maxUsableCount?: number
  requiredUsableCount?: number
}

type PublishResult =
  | { success: true; postId: string }
  | { success: false; skipReason: Extract<SkipReason, 'SEASON_MISMATCH' | 'DUPLICATE_TITLE' | 'PUBLISH_FAILED'> }

const CANDIDATE_POOL_SIZE = 15


/** 참고용 원본 글 가져오기 — 3단계 fallback (B19+B24)
 * 1단계: 48h + 키워드 / 2단계: 7일 + 키워드 / 3단계: 7일 + desireCategory만
 * usable≥5 필터: wave-processor BLOCK2 기준(usableCount<5)과 통일, wave4 full run 보장
 */
async function getReferencePosts(topic: string, desireCat: string, limit: number) {
  const base = {
    isUsable: true, usedAt: null, isPopular: false,
    imageUrls: { isEmpty: true }, videoUrls: { isEmpty: true },
    commentCrawled: true,  // topComments가 한 번이라도 수집된 글만 (usable 필터 사전 조건)
    NOT: { AND: [{ cafeId: 'dlxogns01' }, { boardName: { notIn: DLXOGNS01_ALLOWED_BOARDS } }] },
  }
  const topicWords = topic.split(/[\s·,]+/).filter(w => w.length >= 2)
  const firstWord = topicWords[0] ?? topic
  const selectFields = { id: true, title: true, content: true, cafeName: true, topComments: true } as const
  // killerScore 상위권(~63위)이 usable<5인 경우가 많아 넉넉히 조회 후 usable 필터 적용.
  // 실측: killerScore top-63 전체가 usable<5, 64위부터 usable≥5 등장 → 최소 150개 필요.
  const candidateTake = Math.max(limit * 50, 150)

  // 기존 오염 CafePost 2차 방어 (isUsable=true이지만 접근 차단 안내문이 남아있는 경우)
  const ACCESS_BLOCKED_SIGNALS_CC = [
    '검색 비허용 게시물', '가입이 필요합니다', '카페의 멤버가 되어보세요',
    '카페에 가입하면 바로 글을 볼 수 있어요', '10초 만에 가입하기',
  ] as const
  const STRONG_PZP_SIGNALS_CC = [
    '.pzp', 'pzp-pc', 'pzp-poster', 'webplayer-internal-video',
    '광고 후 계속됩니다', '디버그 정보 다운로드', '고화질 재생이 가능한 영상입니다',
  ] as const
  const WEAK_PZP_SIGNALS_CC = [
    '재생 속도', '해상도', '자막', '음소거', '전체 화면', '자동 (480p)', '0초',
  ] as const
  const filterBlocked = <T extends { title: string; content: string }>(posts: T[]): T[] =>
    posts.filter(p => {
      const blocked = ACCESS_BLOCKED_SIGNALS_CC.some(s => p.content.includes(s))
      if (blocked) { console.log(`[ContentCurator] 접근 차단 안내문 2차 필터 skip: "${p.title.slice(0, 30)}"`)
        return false }
      const hasStrongPzp = STRONG_PZP_SIGNALS_CC.some(s => p.content.includes(s))
      const weakPzpCount = WEAK_PZP_SIGNALS_CC.filter(s => p.content.includes(s)).length
      const videoPzp = hasStrongPzp || weakPzpCount >= 2
      if (videoPzp) console.log(`[ContentCurator] PZP/동영상 2차 필터 skip: "${p.title.slice(0, 30)}"`)
      return !videoPzp
    })

  // usable 메타데이터 누적 (LOW_USABLE_COMMENTS topicResults 기록용)
  let totalCandidatesChecked = 0
  let maxUsableCount = 0
  const withUsableFilter = <T extends { topComments: unknown }>(posts: T[]): T[] => {
    totalCandidatesChecked += posts.length
    for (const p of posts) {
      const u = computeUsableCount(p.topComments)
      if (u > maxUsableCount) maxUsableCount = u
    }
    return posts.filter(p => computeUsableCount(p.topComments) >= 5)
  }

  // 1단계: 48h + 키워드
  const cutoff48h = new Date(Date.now() - 48 * 3600_000)
  const s1 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff48h }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: candidateTake, select: selectFields,
  })))
  if (s1.length >= limit) return { refs: s1.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount }

  // 2단계: 7일 + 키워드
  const cutoff7d = new Date(Date.now() - 7 * 24 * 3600_000)
  const s2 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: candidateTake, select: selectFields,
  })))
  if (s2.length >= limit) return { refs: s2.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount }

  // 3단계: 7일 + desireCategory만 (키워드 없이)
  const s3 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, ...(desireCat !== 'GENERAL' ? { desireCategory: desireCat } : {}) },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: candidateTake, select: selectFields,
  })))
  if (s3.length >= limit) return { refs: s3.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount }

  // 4단계: desireCategory 무관 전체 pool — DB 카테고리 분류 97% NULL 상태 보완
  // GENERAL은 stage 3와 동일 쿼리라 스킵
  if (desireCat !== 'GENERAL') {
    const s3ids = new Set(s3.map(p => p.id))
    const s4 = withUsableFilter(filterBlocked(await prisma.cafePost.findMany({
      where: { ...base, postedAt: { gte: cutoff7d } },
      orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
      take: candidateTake, select: selectFields,
    }))).filter(p => !s3ids.has(p.id))
    if (s4.length > 0) console.log(`[ContentCurator] stage4 fallback (${desireCat}→NULL pool): ${s4.length}개 발견`)
    return { refs: [...s3, ...s4].slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount }
  }
  return { refs: s3.slice(0, limit), candidatesBeforeUsableFilter: totalCandidatesChecked, maxUsableCount }
}

/** 큐레이션된 글 생성 — 원본 카페글 제목·본문 그대로 사용 (AI 각색 없음) */
async function generateCuratedPost(
  persona: PersonaMatch,
  topic: string,
  referencePosts: { id: string; title: string; content: string; cafeName: string }[],
  desireCat?: string,
): Promise<CuratedContent | null> {
  const mainRef = referencePosts[0]
  if (!mainRef) return null

  const boardInfo = resolveCommunityBoard(desireCat ?? 'GENERAL')

  const title = replaceCafeReferences(stripMarkdown(mainRef.title.trim()))
  if (!title) return null

  return {
    personaId: persona.id,
    title,
    content: replaceCafeReferences(stripMarkdown(mainRef.content.trim())),
    boardType: boardInfo.boardType,
    category: boardInfo.category,
    sourceTopic: topic,
    sourcePostIds: [mainRef.id],
  }
}

const SEASONAL_KEYWORDS: Record<string, number[]> = {
  '벚꽃': [3, 4], '꽃구경': [3, 4, 5], '벚꽃놀이': [3, 4],
  '장마': [6, 7], '여름휴가': [7, 8], '피서': [7, 8], '물놀이': [7, 8],
  '단풍': [10, 11], '단풍놀이': [10, 11],
  '크리스마스': [12], '눈썰매': [12, 1, 2], '설날': [1, 2],
}

function isSeasonMismatch(title: string, content: string): boolean {
  const text = title + ' ' + content
  const currentMonth = new Date().getMonth() + 1
  for (const [keyword, allowedMonths] of Object.entries(SEASONAL_KEYWORDS)) {
    if (text.includes(keyword) && !allowedMonths.includes(currentMonth)) return true
  }
  return false
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

/** 큐레이션 글을 DB에 게시 */
async function publishCuratedContent(curated: CuratedContent): Promise<PublishResult> {
  const userId = await getCuratorBotUser(curated.personaId)

  const htmlContent = toCuratedHtmlContent(curated.content)
  const summary = toCuratedSummary(curated.content)

  // 계절 불일치 필터 (P3)
  if (isSeasonMismatch(curated.title, curated.content)) {
    console.log(`[ContentCurator] 계절 불일치 스킵: "${curated.title.slice(0, 20)}"`)
    return { success: false, skipReason: 'SEASON_MISMATCH' }
  }

  // 크로스소스 중복 방지 (LIFE2·STORY·HUMOR — Seed·PopularCurator와 동일 주제 중복 차단)
  if (['LIFE2', 'STORY', 'HUMOR'].includes(curated.boardType)) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentPosts = await prisma.post.findMany({
      where: { boardType: curated.boardType as 'LIFE2' | 'STORY' | 'HUMOR', createdAt: { gte: since24h } },
      select: { title: true },
    })
    if (recentPosts.length > 0) {
      const toNouns = (t: string) => t.match(/[가-힣]{2,}/g) ?? []
      const newNouns = new Set(toNouns(curated.title))
      const isDuplicate = recentPosts.some(
        p => toNouns(p.title).filter(n => newNouns.has(n)).length >= 2
      )
      const isTitleNearDuplicate = recentPosts.some(
        p => editDistance(p.title, curated.title) <= 5
      )
      if (isDuplicate || isTitleNearDuplicate) {
        console.log(`[ContentCurator] ${curated.boardType} 중복 스킵: "${curated.title.slice(0, 20)}"`)
        return { success: false, skipReason: 'DUPLICATE_TITLE' }
      }
    }
  }

  // slug 생성 (transaction 전 — JOB 게시판 제외)
  const slug = curated.boardType !== 'JOB'
    ? await generateCommunitySlug(curated.title)
    : undefined

  // post 생성 + cafePost usedAt 마킹을 트랜잭션으로 묶어 원자성 보장
  try {
    const postId = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: curated.title,
          content: htmlContent,
          summary,
          boardType: curated.boardType as 'STORY' | 'HUMOR' | 'LIFE2' | 'JOB',
          category: curated.category ?? '자유수다',
          authorId: userId,
          source: 'BOT',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          cafePostId: curated.sourcePostIds[0] ?? null,
          ...(slug ? { slug } : {}),
        },
      })
      if (curated.sourcePostIds.length > 0) {
        await tx.cafePost.updateMany({
          where: { id: { in: curated.sourcePostIds } },
          data: { usedAt: new Date() },
        })
        // killerScore ≥ 75인 소스글 기반 발행 → isFeatured=true 자동 적용
        const killerSource = await tx.cafePost.findFirst({
          where: { id: { in: curated.sourcePostIds }, killerScore: { gte: 75 } },
          select: { id: true },
        })
        if (killerSource) {
          await tx.post.update({
            where: { id: post.id },
            data: { isFeatured: true, featuredAt: new Date() },
          })
        }
      }
      return post.id
    })
    return { success: true, postId }
  } catch (err) {
    console.error('[ContentCurator] publishCuratedContent 트랜잭션 실패:', err)
    return { success: false, skipReason: 'PUBLISH_FAILED' }
  }
}

/** 댓글 파동 큐 등록 (wave1: +1분, wave2: +5분, wave3: +30분, wave4: +60분) */
async function enqueueCommentWave(postId: string, cafePostId: string, authorPersonaId: string) {
  const now = new Date()
  await prisma.commentWaveQueue.create({
    data: {
      postId,
      cafePostId,
      authorPersonaId,
      wave1At: new Date(now.getTime() + 60_000),
      wave2At: new Date(now.getTime() + 300_000),
      wave3At: new Date(now.getTime() + 1_800_000),
      wave4At: new Date(now.getTime() + 3_600_000),
      expiresAt: new Date(now.getTime() + 216_000_000), // 60시간
    },
  })
}

/** 메인 실행 */
export async function main() {
  console.log('[ContentCurator] 시작 — 트렌드 기반 콘텐츠 큐레이션')
  const startTime = Date.now()

  // 1) 핫토픽 조회 (오늘 트렌드 → 어제 → 최근 순으로 fallback)
  const { hotTopics, desireMap: trendDesireMap, source: briefSource } = await loadTodayBrief()
  if (!hotTopics || hotTopics.length === 0) {
    console.log(`[ContentCurator] 핫토픽 없음 (source: ${briefSource}) — 트렌드 분석 먼저 필요`)
    await disconnect()
    return
  }
  console.log(`[ContentCurator] 핫토픽 ${hotTopics.length}개 로드 (source: ${briefSource})`)
  // DailyBrief fallback 경고 (B12) — 오늘 데이터 없음 → 욕망 신뢰도 낮음
  if (briefSource === 'yesterday_trend' || briefSource === 'recent_trend') {
    await sendSlackMessage('SYSTEM', `[큐레이션] DailyBrief fallback 모드 (source=${briefSource}) — 오늘 트렌드 없음, 욕망 데이터 신뢰도 낮음`)
  }

  // 2) 카테고리 다양화 — desireMap 기반으로 HEALTH 독점 방지
  const maxPosts = 3
  let publishedCount = 0

  // 오늘 이미 발행된 욕망 집계 — 시간당 동일 욕망 반복 방지 (B20)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayUsedPosts = await prisma.cafePost.findMany({
    where: { usedAt: { gte: todayStart } },
    select: { desireCategory: true },
  })
  const desireUsedCount: Record<string, number> = {}
  for (const { desireCategory } of todayUsedPosts) {
    const key = desireCategory ?? 'GENERAL'
    desireUsedCount[key] = (desireUsedCount[key] ?? 0) + 1
  }

  // 오늘 발행된 BOT 글 제목 목록 — 키워드 편중 방지 (P1)
  const todayPublishedTitles = await prisma.post.findMany({
    where: { source: 'BOT', createdAt: { gte: todayStart } },
    select: { title: true },
  })
  // keyword overlap 오탐 방지 — 어미·조사·기능어는 주제어가 아니므로 제외
  const OVERLAP_STOPWORDS = new Set([
    '해요', '이요', '에요', '어요', '아요', '해서', '하고', '해도',
    '가요', '이야', '거야', '줘요', '봐요', '되요', '는데', '인데',
    '같아', '같이', '있어', '없어', '싶어', '했어', '봤어', '갔어',
    '에서', '으로', '에게', '이나', '거나', '에도', '이도', '이고',
    '이게', '그게', '저게', '이건', '그건', '저건',
    '많이', '너무', '정말', '진짜', '아직', '이미', '그냥', '항상',
    '오늘', '내일', '어제', '이번', '지난', '다음',
    '데이',
  ])
  function countKeywordOverlap(title: string): number {
    const nouns = (title.match(/[가-힣]{2,}/g) ?? [])
      .filter(n => !OVERLAP_STOPWORDS.has(n))
    const publishedAll = todayPublishedTitles.map(p => p.title).join(' ')
    let max = 0
    for (const n of nouns) {
      const cnt = publishedAll.match(new RegExp(n, 'g'))?.length ?? 0
      if (cnt > max) max = cnt
    }
    return max
  }

  // 욕망별 하루 최대 발행 수 (75건/일 기준 30%/15%/8%)
  const MAX_PER_DESIRE: Partial<Record<string, number>> = { HEALTH: 22, FAMILY: 11, MONEY: 3 }
  const DEFAULT_MAX_DESIRE = 6

  function isDesireExhausted(desire: string): boolean {
    return (desireUsedCount[desire] ?? 0) >= (MAX_PER_DESIRE[desire] ?? DEFAULT_MAX_DESIRE)
  }

  // desireMap 기반 다양화: HEALTH 30% 상한 적용 후 재정규화 (B10 — 구조적 편중 완화)
  const DESIRE_CAPS: Partial<Record<string, number>> = { HEALTH: 30 }
  const rawDesireMap = trendDesireMap ?? {}
  const cappedMap: Record<string, number> = {}
  let totalPct = 0
  for (const [d, pct] of Object.entries(rawDesireMap)) {
    cappedMap[d] = Math.min(Number(pct), DESIRE_CAPS[d] ?? 100)
    totalPct += cappedMap[d]
  }
  const desireMap: Record<string, number> = {}
  for (const d of Object.keys(cappedMap)) {
    desireMap[d] = totalPct > 0 ? (cappedMap[d] / totalPct) * 100 : 0
  }
  const topDesires = Object.entries(desireMap).sort(([, a], [, b]) => b - a).map(([k]) => k)

  // categorizedTopics: hotTopics에 desireCategory 부여 (desireCategory 필드 보장)
  const categorizedTopics = hotTopics.map(t => ({ ...t, desireCategory: guessDesire(t.topic) }))

  // ─── killerPosts 날짜 제한 7일 (Fix 1) ───────────────────────
  // 날짜 제한으로 34일된 "청국장" 등 오래된 글의 영구 재선발 차단
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const killerPosts = await prisma.cafePost.findMany({
    where: {
      killerScore: { gte: 50 }, isUsable: true, usedAt: null, isPopular: false, imageUrls: { isEmpty: true },
      crawledAt: { gte: sevenDaysAgo },  // crawledAt은 항상 설정됨(NOT NULL) — postedAt null 허용
      NOT: { AND: [{ cafeId: 'dlxogns01' }, { boardName: { notIn: DLXOGNS01_ALLOWED_BOARDS } }] },
    },
    orderBy: { killerScore: 'desc' },
    take: 2,
    select: { id: true, title: true, postedAt: true, killerScore: true, desireCategory: true },
  })

  // ─── candidatePool 구성 (Fix 2-B) ─────────────────────────────
  const killerCandidates: CandidateTopic[] = killerPosts
    .filter(p => !isDesireExhausted(p.desireCategory ?? 'GENERAL'))
    .map(p => ({
      topic: p.title,
      source: 'killer' as const,
      cafePostId: p.id,
      postedAt: p.postedAt ?? undefined,
      killerScore: p.killerScore ?? undefined,
      desireCategory: p.desireCategory ?? undefined,
    }))
  if (killerCandidates.length > 0) {
    console.log(`[ContentCurator] 킬러글 후보: ${killerCandidates.length}건`)
  }

  const maxTrendCandidates = CANDIDATE_POOL_SIZE - killerCandidates.length
  const trendCandidates: CandidateTopic[] = []
  const usedCategories = new Set<string>()

  // 풀 내 중복 확인 (클로저가 배열 참조를 추적)
  const inPool = (topic: string) =>
    killerCandidates.some(c => c.topic === topic) || trendCandidates.some(c => c.topic === topic)

  // 1순위: desireMap 순서대로 카테고리별 첫 번째 topic (소진된 욕망 제외)
  for (const desire of topDesires) {
    if (trendCandidates.length >= maxTrendCandidates) break
    if (isDesireExhausted(desire)) continue
    const match = categorizedTopics.find(
      t => t.desireCategory === desire && !usedCategories.has(desire) && !inPool(t.topic)
    )
    if (match) {
      trendCandidates.push({ topic: match.topic, source: 'trend', desireCategory: match.desireCategory })
      usedCategories.add(desire)
    }
  }
  // 2순위: 미달 시 나머지 categorizedTopics에서 카테고리 중복 없이 채움 (소진된 욕망 제외)
  for (const t of categorizedTopics) {
    if (trendCandidates.length >= maxTrendCandidates) break
    if (isDesireExhausted(t.desireCategory)) continue
    if (!usedCategories.has(t.desireCategory) && !inPool(t.topic)) {
      trendCandidates.push({ topic: t.topic, source: 'trend', desireCategory: t.desireCategory })
      usedCategories.add(t.desireCategory)
    }
  }
  // 3순위: 폴백 — isDesireExhausted 체크 포함 (Fix 3: 소진 카테고리 재진입 차단)
  for (const t of categorizedTopics) {
    if (trendCandidates.length >= maxTrendCandidates) break
    if (isDesireExhausted(t.desireCategory)) continue
    if (!inPool(t.topic)) {
      trendCandidates.push({ topic: t.topic, source: 'trend', desireCategory: t.desireCategory })
    }
  }

  // 01:15 KST 특별 슬롯: 저녁/새벽 감성글 우선 정렬 (trendCandidates만, killerCandidates 순서 유지)
  const kstHour = (new Date().getUTCHours() + 9) % 24
  const DAWN_DESIRES = ['MEANING', 'SPIRITUAL', 'RELATION', 'FAMILY']
  if (kstHour === 1) {
    trendCandidates.sort((a, b) => {
      const aIsDawn = DAWN_DESIRES.includes(a.desireCategory ?? '')
      const bIsDawn = DAWN_DESIRES.includes(b.desireCategory ?? '')
      return (bIsDawn ? 1 : 0) - (aIsDawn ? 1 : 0)
    })
  }

  // killerCandidates 앞, trendCandidates 뒤
  const candidatePool: CandidateTopic[] = [...killerCandidates, ...trendCandidates]
  console.log(`[ContentCurator] 후보 풀: ${candidatePool.length}개 (killer=${killerCandidates.length}, trend=${trendCandidates.length})`)

  // ─── 실행 루프 (Fix 2-C) ──────────────────────────────────────
  // refs=0 / 생성실패 / 발행실패 시 다음 후보로 이동 (continue 기반)
  const topicResults: TopicResult[] = []

  for (const candidate of candidatePool) {
    if (publishedCount >= maxPosts) break

    const desireCat = candidate.desireCategory ?? guessDesire(candidate.topic)

    // DESIRE_EXHAUSTED: pool 구성 후 루프 중 카운터가 소진된 경우 재확인
    if (isDesireExhausted(desireCat)) {
      topicResults.push({ ...candidate, refsCount: 0, skipReason: 'DESIRE_EXHAUSTED' })
      continue
    }

    // KEYWORD_OVERLAP: 당일 발행 키워드 편중 체크 (P1)
    const topicOverlap = countKeywordOverlap(candidate.topic)
    if (topicOverlap >= 4) {
      console.log(`[ContentCurator] "${candidate.topic}" 키워드 중복 스킵 (당일 ${topicOverlap}회)`)
      topicResults.push({ ...candidate, refsCount: 0, skipReason: 'KEYWORD_OVERLAP' })
      continue
    }

    // 페르소나 선택 + AUTHOR_DAILY_CAP 체크
    let persona = matchPersona(candidate.topic, desireCat)
    const todayCount = await countTodayPostsByPersona(persona.id)
    if (todayCount >= AUTHOR_DAILY_POST_CAP) {
      const altIds = DESIRE_PERSONA_MAP[desireCat] ?? DESIRE_PERSONA_MAP['GENERAL']
      let found = false
      for (const altId of altIds) {
        if (altId === persona.id) continue
        const altCount = await countTodayPostsByPersona(altId)
        if (altCount < AUTHOR_DAILY_POST_CAP) {
          const altPersona = PERSONAS.find(p => p.id === altId)
          if (altPersona) { persona = altPersona; found = true; break }
        }
      }
      if (!found) {
        console.log(`[ContentCurator] "${candidate.topic}" 모든 페르소나 일간 한도 초과 — 스킵`)
        topicResults.push({ ...candidate, refsCount: 0, skipReason: 'AUTHOR_DAILY_CAP' })
        continue
      }
    }

    const { refs, candidatesBeforeUsableFilter, maxUsableCount } = await getReferencePosts(candidate.topic, desireCat, 3)
    console.log(`[ContentCurator] "${candidate.topic}" (${desireCat}) → ${persona.nickname} (참고글 ${refs.length}개)`)

    if (refs.length === 0) {
      if (candidatesBeforeUsableFilter > 0) {
        // refs는 있었지만 usable<5로 전부 탈락 — topicResults에 기록 (별도 BotLog 없음)
        topicResults.push({ ...candidate, refsCount: 0, skipReason: 'LOW_USABLE_COMMENTS', candidatesBeforeUsableFilter, maxUsableCount, requiredUsableCount: 5 })
      } else {
        topicResults.push({ ...candidate, refsCount: 0, skipReason: 'REFS_EMPTY' })
      }
      continue
    }

    const curated = await generateCuratedPost(persona, candidate.topic, refs, desireCat)
    if (!curated) {
      // refs는 있었지만 curated content 생성 결과가 null
      topicResults.push({ ...candidate, refsCount: refs.length, skipReason: 'GENERATION_FAILED' })
      continue
    }

    const publishResult = await publishCuratedContent(curated)
    if (!publishResult.success) {
      topicResults.push({ ...candidate, refsCount: refs.length, skipReason: publishResult.skipReason })
      continue
    }

    // 발행 성공
    topicResults.push({ ...candidate, refsCount: refs.length, skipReason: null })
    publishedCount++
    desireUsedCount[desireCat] = (desireUsedCount[desireCat] ?? 0) + 1
    console.log(`[ContentCurator] 게시: "${curated.title}" by ${persona.nickname}`)

    // 댓글 파동 큐 등록 — WAVE_SKIP_USABLE_ZERO: refs 필터 통과 후에도 usable=0이면 최후 방어선 BotLog
    const refCafePost = refs[0]
    const usable = computeUsableCount(refCafePost?.topComments)
    if (usable === 0) {
      console.log(`[ContentCurator] 댓글 없는 글 — wave queue 생략 postId=${publishResult.postId}`)
      await prisma.botLog.create({ data: {
        botType: 'CAFE_CRAWLER', action: 'WAVE_SKIP_USABLE_ZERO', status: 'SKIP',
        details: JSON.stringify({
          postId: publishResult.postId,
          cafePostId: refCafePost?.id,
          topCommentsCount: Array.isArray(refCafePost?.topComments) ? refCafePost.topComments.length : 0,
        }),
      }}).catch(e => console.error('[ContentCurator] WAVE_SKIP_USABLE_ZERO log 실패:', e))
    } else {
      await enqueueCommentWave(publishResult.postId, refCafePost!.id, persona.id).catch(async (err) => {
        await sendSlackMessage('QA', `[큐레이션] wave 등록 실패: ${String(err).slice(0, 100)}`)
        console.error('[ContentCurator] wave 큐 등록 실패:', err)
      })
    }
  }

  const durationMs = Date.now() - startTime

  // BotLog — topicsUsed: 실제 시도한 topic만 (candidatePool 전체 아님)
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'CONTENT_CURATE',
      status: publishedCount >= maxPosts ? 'SUCCESS' : publishedCount > 0 ? 'PARTIAL' : 'FAILED',
      details: JSON.stringify({
        topicsUsed: topicResults.map(r => r.topic),
        candidatePoolSize: candidatePool.length,
        published: publishedCount,
        topicResults,
      }),
      itemCount: publishedCount,
      executionTimeMs: durationMs,
    },
  })

  await notifySlack({
    level: 'info',
    agent: 'CONTENT_CURATOR',
    title: '트렌드 기반 콘텐츠 게시',
    body: `핫토픽 ${hotTopics.length}개 중 ${publishedCount}개 글 게시`,
  })

  console.log(`[ContentCurator] 완료 — ${publishedCount}개 게시, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[ContentCurator] 치명적 오류:', err)
      await disconnect()
      process.exit(1)
    })
}
