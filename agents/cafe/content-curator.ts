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
  DESIRE_TO_BOARD,
  guessDesire,
  stripMarkdown,
} from './curator-shared.js'
import { getCuratorBotUser, countTodayPostsByPersona, AUTHOR_DAILY_POST_CAP } from './curator-users.js'


/** 참고용 원본 글 가져오기 — 3단계 fallback (B19+B24)
 * 1단계: 48h + 키워드 / 2단계: 7일 + 키워드 / 3단계: 7일 + desireCategory만
 */
async function getReferencePosts(topic: string, desireCat: string, limit: number) {
  const base = { isUsable: true, usedAt: null, isPopular: false }
  const topicWords = topic.split(/[\s·,]+/).filter(w => w.length >= 2)
  const firstWord = topicWords[0] ?? topic
  const selectFields = { id: true, title: true, content: true, cafeName: true } as const

  // 1단계: 48h + 키워드
  const cutoff48h = new Date(Date.now() - 48 * 3600_000)
  const stage1 = await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff48h }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: limit, select: selectFields,
  })
  if (stage1.length >= limit) return stage1

  // 2단계: 7일 + 키워드
  const cutoff7d = new Date(Date.now() - 7 * 24 * 3600_000)
  const stage2 = await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, OR: [{ title: { contains: firstWord, mode: 'insensitive' } }, { topics: { hasSome: topicWords } }] },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: limit, select: selectFields,
  })
  if (stage2.length >= limit) return stage2

  // 3단계: 7일 + desireCategory만 (키워드 없이)
  const stage3 = await prisma.cafePost.findMany({
    where: { ...base, postedAt: { gte: cutoff7d }, ...(desireCat !== 'GENERAL' ? { desireCategory: desireCat } : {}) },
    orderBy: [{ killerScore: 'desc' }, { likeCount: 'desc' }],
    take: limit, select: selectFields,
  })
  return stage3
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

  const boardInfo = DESIRE_TO_BOARD[desireCat ?? 'GENERAL'] ?? DESIRE_TO_BOARD['GENERAL']

  const title = stripMarkdown(mainRef.title.trim())
  if (!title) return null

  return {
    personaId: persona.id,
    title,
    content: stripMarkdown(mainRef.content.trim()),
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

/** 큐레이션 글을 DB에 게시, 생성된 postId 반환 */
async function publishCuratedContent(curated: CuratedContent): Promise<string | null> {
  const userId = await getCuratorBotUser(curated.personaId)

  const htmlContent = `<p>${curated.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  const summary = curated.content.replace(/\n/g, ' ').slice(0, 150).trim()

  // 계절 불일치 필터 (P3)
  if (isSeasonMismatch(curated.title, curated.content)) {
    console.log(`[ContentCurator] 계절 불일치 스킵: "${curated.title.slice(0, 20)}"`)
    return null
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
        return null
      }
    }
  }

  // post 생성 + cafePost usedAt 마킹을 트랜잭션으로 묶어 원자성 보장
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

  return postId
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
  const maxPosts = 5
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

  const categorizedTopics = hotTopics.map(t => ({ ...t, desireCategory: guessDesire(t.topic) }))
  const selectedTopics: string[] = []
  const usedCategories = new Set<string>()

  // 1순위: desireMap 순서대로 카테고리별 첫 번째 hotTopic (소진된 욕망 제외)
  for (const desire of topDesires) {
    if (selectedTopics.length >= maxPosts) break
    if (isDesireExhausted(desire)) continue
    const match = categorizedTopics.find(t => t.desireCategory === desire && !usedCategories.has(desire))
    if (match) {
      selectedTopics.push(match.topic)
      usedCategories.add(desire)
    }
  }
  // 2순위: 미달 시 나머지 hotTopics에서 카테고리 중복 없이 채움 (소진된 욕망 제외)
  for (const t of categorizedTopics) {
    if (selectedTopics.length >= maxPosts) break
    if (isDesireExhausted(t.desireCategory)) continue
    if (!usedCategories.has(t.desireCategory) && !selectedTopics.includes(t.topic)) {
      selectedTopics.push(t.topic)
      usedCategories.add(t.desireCategory)
    }
  }
  // 3순위: 폴백 — 원래 hotTopics 순서
  for (const t of hotTopics) {
    if (selectedTopics.length >= maxPosts) break
    if (!selectedTopics.includes(t.topic)) selectedTopics.push(t.topic)
  }

  // 01:15 KST 특별 슬롯: 저녁/새벽 감성글 우선 정렬 (killerScore 블록 이전 배치)
  // kstHour = (getUTCHours() + 9) % 24 → UTC 16시 = (16+9)%24 = 1 = KST 01시
  const kstHour = (new Date().getUTCHours() + 9) % 24
  const DAWN_DESIRES = ['MEANING', 'SPIRITUAL', 'RELATION', 'FAMILY']
  if (kstHour === 1) {
    selectedTopics.sort((a, b) => {
      const aIsDawn = DAWN_DESIRES.includes(guessDesire(a))
      const bIsDawn = DAWN_DESIRES.includes(guessDesire(b))
      return (bIsDawn ? 1 : 0) - (aIsDawn ? 1 : 0)
    })
  }

  // killerScore 우선 삽입 (B3) — 화제성 높은 글 제목을 최우선 주제로
  const killerPosts = await prisma.cafePost.findMany({
    where: { killerScore: { gte: 50 }, isUsable: true, usedAt: null, isPopular: false }, // 50: hotTopics 30개 확장 후 pool 안전망 (기존 55에서 완화)
    orderBy: { killerScore: 'desc' },
    take: 2,
    select: { title: true },
  })
  if (killerPosts.length > 0) {
    const killerTopics = killerPosts.map(p => p.title).filter(Boolean)
    const merged = [...killerTopics, ...selectedTopics.filter(t => !killerTopics.includes(t))].slice(0, maxPosts)
    selectedTopics.splice(0, selectedTopics.length, ...merged)
    console.log(`[ContentCurator] 킬러글 우선 삽입: ${killerTopics.length}건`)
  }

  for (const topicStr of selectedTopics) {
    const desireCat = guessDesire(topicStr)
    // 하루 한도 소진된 욕망은 스킵 (B20)
    if (isDesireExhausted(desireCat)) {
      console.log(`[ContentCurator] "${topicStr}" (${desireCat}) 오늘 한도 초과 — 스킵`)
      continue
    }

    // 당일 발행 키워드 편중 체크 (P1)
    const topicOverlap = countKeywordOverlap(topicStr)
    if (topicOverlap >= 4) {
      console.log(`[ContentCurator] "${topicStr}" 키워드 중복 스킵 (당일 ${topicOverlap}회 이미 발행)`)
      continue
    }

    let persona = matchPersona(topicStr, desireCat)
    const todayCount = await countTodayPostsByPersona(persona.id)
    if (todayCount >= AUTHOR_DAILY_POST_CAP) {
      const candidates = DESIRE_PERSONA_MAP[desireCat] ?? DESIRE_PERSONA_MAP['GENERAL']
      for (const altId of candidates) {
        if (altId === persona.id) continue
        const altCount = await countTodayPostsByPersona(altId)
        if (altCount < AUTHOR_DAILY_POST_CAP) {
          const altPersona = PERSONAS.find(p => p.id === altId)
          if (altPersona) { persona = altPersona; break }
        }
      }
    }
    const refs = await getReferencePosts(topicStr, desireCat, 3)

    console.log(`[ContentCurator] "${topicStr}" (${desireCat}) → ${persona.nickname} (참고글 ${refs.length}개)`)

    const curated = await generateCuratedPost(persona, topicStr, refs, desireCat)
    if (curated) {
      const postId = await publishCuratedContent(curated)
      publishedCount++
      desireUsedCount[desireCat] = (desireUsedCount[desireCat] ?? 0) + 1
      console.log(`[ContentCurator] 게시: "${curated.title}" by ${persona.nickname}`)
      // 댓글 파동 큐 등록 — refs 없어도 등록 (wave-processor가 fallback 댓글 생성)
      if (postId) {
        if (refs.length === 0) {
          await sendSlackMessage('QA', `[큐레이션] wave 등록: refs 없음 fallback 모드 (topic=${topicStr})`)
        }
        await enqueueCommentWave(postId, refs[0]?.id ?? '', persona.id).catch(async (err) => {
          await sendSlackMessage('QA', `[큐레이션] wave 등록 실패: ${String(err).slice(0, 100)}`)
          console.error('[ContentCurator] wave 큐 등록 실패:', err)
        })
      }
    }
  }

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'CONTENT_CURATE',
      status: publishedCount >= maxPosts ? 'SUCCESS' : publishedCount > 0 ? 'PARTIAL' : 'FAILED',
      details: JSON.stringify({
        topicsUsed: selectedTopics,
        published: publishedCount,
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
