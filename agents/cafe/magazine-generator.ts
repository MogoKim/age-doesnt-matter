/**
 * 매거진 자동생성기
 * CafeTrend.magazineTopics를 기반으로 에디터 스타일 매거진 글 생성
 * 매일 16:00 KST 실행 (트렌드 분석 후)
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import { loadTodayBrief } from '../core/intelligence.js'
import type { MagazineSuggestion } from './types.js'
import { matchCpsProducts, saveCpsLinks } from './cps-matcher.js'
import { generateMagazineThumbnail } from './thumbnail-generator.js'
import { generateMagazineImageByContext } from './image-generator.js'
import { buildMagazineHtml, parseSectionsFromAI } from './magazine-template.js'
import { getDefaultImagePlan, type ImageContext } from '../core/image-prompt-builder.js'
import { buildMagazineSystemPrompt, DESIRE_TO_CATEGORY, DESIRE_TOPIC_HINTS } from '../magazine/prompt.js'

const CLAUDE_MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const CLAUDE_MODEL_STRATEGIC = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'
const client = new Anthropic()

/** 카테고리 자동 매핑 */
function detectCategory(title: string, reason: string): string {
  const text = `${title} ${reason}`.toLowerCase()
  const map: Record<string, string[]> = {
    '건강': ['건강', '운동', '관절', '영양', '수면', '병원', '치매', '혈압', '당뇨', '걷기', '갱년기'],
    '재테크': ['재테크', '연금', '저축', '투자', '부동산', '노후', '보험', '퇴직연금', 'irp'],
    '은퇴준비': ['은퇴', '퇴직', '인생 2막', '2막', '노후 준비', '노후준비', '은퇴 준비'],
    '일자리': ['일자리', '취업', '자격증', '봉사', '창업', '알바', '재취업', '파트타임'],
    '생활': ['살림', '정리', '세탁', '절약', '생활', '꿀팁', '재활용'],
    '여행': ['여행', '맛집', '산책', '둘레길', '관광', '기차', '드라이브'],
    '문화': ['독서', '영화', '드라마', '음악', '전시', '공연', '문화'],
    '요리': ['요리', '레시피', '반찬', '김치', '밑반찬', '제철', '장보기'],
  }

  for (const [cat, keywords] of Object.entries(map)) {
    if (keywords.some(kw => text.includes(kw))) return cat
  }
  return '생활'
}

/** 최근 매거진과 주제 중복 체크 */
async function getRecentMagazineTitles(days: number): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const recent = await prisma.post.findMany({
    where: {
      boardType: 'MAGAZINE',
      status: 'PUBLISHED',
      createdAt: { gte: since },
    },
    select: { title: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return recent.map(p => p.title)
}

/** 카페 참고글 가져오기 */
async function getReferencePosts(topic: MagazineSuggestion) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterday = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)

  return prisma.cafePost.findMany({
    where: {
      isUsable: true,
      crawledAt: { gte: yesterday },
      OR: [
        { title: { contains: topic.title.split(' ')[0], mode: 'insensitive' } },
        ...(topic.relatedPosts.length > 0
          ? [{ title: { in: topic.relatedPosts } }]
          : []),
      ],
    },
    orderBy: { likeCount: 'desc' },
    take: 5,
    select: { title: true, content: true, cafeName: true, likeCount: true },
  })
}

/** 매거진 글 생성 (평일: Sonnet / 일요일 특집: Opus) */
async function generateMagazineArticle(
  topic: MagazineSuggestion,
  category: string,
  referencePosts: { title: string; content: string; cafeName: string }[],
  recentTitles: string[],
): Promise<{ title: string; content: string; summary: string; imageContexts: ImageContext[] } | null> {
  const refs = referencePosts.map((p, i) =>
    `[${i + 1}] (${p.cafeName}) "${p.title}"\n${p.content.slice(0, 300)}`,
  ).join('\n\n')

  const recentList = recentTitles.slice(0, 10).map(t => `- ${t}`).join('\n')

  // 일요일(KST) = Opus 특집호, 평일 = Sonnet
  const now = new Date()
  const kstDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getDay()
  const isSunday = kstDay === 0
  const model = isSunday ? CLAUDE_MODEL_STRATEGIC : CLAUDE_MODEL_HEAVY
  console.log(`[Magazine] 모델: ${isSunday ? 'Opus (일요일 특집)' : 'Sonnet (평일)'}`)

  const response = await client.messages.create({
    model,
    max_tokens: 3000,
    system: buildMagazineSystemPrompt(category),
    messages: [{
      role: 'user',
      content: `"${topic.title}" 주제로 매거진 기사를 작성해주세요.
카테고리: ${category}
추천 이유: ${topic.reason}

${refs ? `참고 자료 (카페 인기글):\n${refs}` : ''}

${recentList ? `최근 발행 매거진 (중복 주제 피해주세요):\n${recentList}` : ''}

응답 형식 (반드시 아래 형식을 따라주세요):
제목: (20자 이내, 핵심을 담은 제목)
요약: (40자 이내, 한 줄 요약)
이미지컨텍스트1: type:PERSON_REAL|FOOD_PHOTO|SCENE_PHOTO|OBJECT_PHOTO|ILLUSTRATION, gender:female|male(인물일 때만), context:(영문 이미지 설명), unsplash:(영문 Unsplash 검색어, FOOD/SCENE/OBJECT만)
이미지컨텍스트2: type:PERSON_REAL|FOOD_PHOTO|SCENE_PHOTO|OBJECT_PHOTO|ILLUSTRATION, gender:female|male(인물일 때만), context:(영문 이미지 설명), unsplash:(영문 Unsplash 검색어, FOOD/SCENE/OBJECT만)
본문: (HTML, 800~1200자, 소제목 2~3개, 각 15자 이내)

본문 구조:
<h2>소제목 1 (15자 이내)</h2>
<p>핵심 정보 + 데이터. 최대 3문장.</p>
<!-- [IMAGE:1] -->

<h2>소제목 2 (15자 이내)</h2>
<p>실용 정보. 최대 3문장.</p>
<!-- [IMAGE:2] -->

<aside class="tip-box">💡 꿀팁: 바로 실천할 수 있는 팁 1~3가지</aside>

<p>마무리 1문장</p>`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const summaryMatch = text.match(/요약:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  if (!titleMatch || !bodyMatch) return null

  // 이미지 컨텍스트 파싱
  const imageContexts: ImageContext[] = []
  for (let n = 1; n <= 2; n++) {
    const ctxMatch = text.match(new RegExp(`이미지컨텍스트${n}:\\s*(.+)`))
    if (ctxMatch) {
      const raw = ctxMatch[1]
      const typeMatch = raw.match(/type:(\w+)/)
      const genderMatch = raw.match(/gender:(female|male)/)
      const contextMatch = raw.match(/context:([^,\n]+)/)
      const unsplashMatch = raw.match(/unsplash:([^,\n]+)/)

      if (typeMatch && contextMatch) {
        const ctx: ImageContext = {
          type: typeMatch[1] as ImageContext['type'],
          dallePrompt: contextMatch[1].trim(),
        }
        if (genderMatch) ctx.gender = genderMatch[1] as 'female' | 'male'
        if (unsplashMatch) ctx.unsplashQuery = unsplashMatch[1].trim()
        imageContexts.push(ctx)
      }
    }
  }

  return {
    title: titleMatch[1].trim(),
    summary: summaryMatch?.[1]?.trim() ?? '',
    content: bodyMatch[1].trim(),
    imageContexts,
  }
}

/** 매거진 게시 (에디터 봇 계정 사용) */
async function publishMagazine(
  article: { title: string; content: string; summary: string },
  category: string,
  thumbnailUrl?: string,
): Promise<string> {
  // 매거진 전용 봇 — 페르소나 B(은퇴신사) 사용 (차분한 정보형)
  const editorUserId = await getBotUser('B')

  const post = await prisma.post.create({
    data: {
      title: article.title,
      content: article.content,
      summary: article.summary,
      thumbnailUrl: thumbnailUrl ?? null,
      boardType: 'MAGAZINE',
      category,
      authorId: editorUserId,
      source: 'BOT',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })

  return post.id
}

/** 메인 실행 */
async function main() {
  console.log('[MagazineGenerator] 시작')
  const startTime = Date.now()

  // 1) 오늘/어제 트렌드 분석 결과 조회
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let trend = await prisma.cafeTrend.findUnique({
    where: { date_period: { date: today, period: 'daily' } },
  })

  // 오늘 없으면 어제 것 사용
  if (!trend) {
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    trend = await prisma.cafeTrend.findUnique({
      where: { date_period: { date: yesterday, period: 'daily' } },
    })
  }

  if (!trend) {
    console.log('[MagazineGenerator] 트렌드 분석 없음 — 스킵')
    await disconnect()
    return
  }

  const magazineTopics = trend.magazineTopics as unknown as MagazineSuggestion[]

  // 욕망 지도 로드 — 주제 보강에 활용
  const brief = await loadTodayBrief({ fallbackToPrevious: true })
  const dominantDesire = brief?.dominantDesire ?? 'HEALTH'

  // 욕망 지도 기반 보충 주제: 매거진 주제가 부족하거나 현재 욕망과 다를 때 보강
  const desireHints = DESIRE_TOPIC_HINTS[dominantDesire] ?? DESIRE_TOPIC_HINTS['HEALTH']
  if (!magazineTopics || magazineTopics.length === 0) {
    // 욕망 지도 기반 폴백 주제 사용
    const fallbackTopic: MagazineSuggestion = {
      title: desireHints[Math.floor(Math.random() * desireHints.length)],
      reason: `오늘 커뮤니티 지배 욕망: ${dominantDesire}`,
      relatedPosts: [],
      score: 8,
    }
    console.log(`[MagazineGenerator] 욕망지도 폴백 주제 사용: "${fallbackTopic.title}"`)
    const category = DESIRE_TO_CATEGORY[dominantDesire] ?? '생활'
    const refs = await getReferencePosts(fallbackTopic)
    const recentTitles = await getRecentMagazineTitles(14)
    const article = await generateMagazineArticle(fallbackTopic, category, refs, recentTitles)
    if (!article) {
      console.log('[MagazineGenerator] 폴백 주제 생성 실패')
      await disconnect()
      return
    }
    magazineTopics.push(fallbackTopic)
  }

  // 2) 최근 매거진 제목 (중복 방지)
  const recentTitles = await getRecentMagazineTitles(14)

  // 3) 상위 1~2개 주제로 매거진 생성
  const maxArticles = 2
  let publishedCount = 0
  const publishedTitles: string[] = []

  for (const topic of magazineTopics.slice(0, maxArticles)) {
    // 점수 7 이상만 발행
    if (topic.score < 7) {
      console.log(`[MagazineGenerator] "${topic.title}" (${topic.score}/10) — 점수 미달, 스킵`)
      continue
    }

    const category = detectCategory(topic.title, topic.reason)
    const refs = await getReferencePosts(topic)

    console.log(`[MagazineGenerator] 생성 중: "${topic.title}" [${category}] (참고글 ${refs.length}개)`)

    const article = await generateMagazineArticle(topic, category, refs, recentTitles)
    if (!article) {
      console.log(`[MagazineGenerator] "${topic.title}" — 생성 실패`)
      continue
    }

    // IMAGE_PROMPT 잔존 텍스트 방어 제거
    article.content = article.content.replace(/\[IMAGE_PROMPT:\s*.+?\]/g, '')

    // 이미지 컨텍스트: AI 제공 우선, 없으면 카테고리 기본값
    const [defaultCtx1, defaultCtx2] = getDefaultImagePlan(category)
    const ctxList = [
      article.imageContexts[0] ?? defaultCtx1,
      article.imageContexts[1] ?? defaultCtx2,
    ]

    // 히어로 이미지 (첫 번째 컨텍스트)
    const image = await generateMagazineImageByContext(ctxList[0])
    if (image) {
      console.log(`[MagazineGenerator] 히어로 이미지 (${ctxList[0].type}, ${image.source}): ${image.url.slice(0, 50)}...`)
    } else {
      console.warn(`[MagazineGenerator] ⚠️ 히어로 이미지 생성 실패 — "${topic.title}"`)
      await notifySlack(`⚠️ *매거진 히어로 이미지 생성 실패*\n제목: ${topic.title}\n카테고리: ${category}\n→ 썸네일 없이 발행됩니다. 수동 확인 필요.`, { channel: '#시스템' })
    }

    // 본문 이미지 (두 번째 컨텍스트)
    const bodyImageUrls = new Map<number, string>()
    const bodyImg = await generateMagazineImageByContext(ctxList[1])
    if (bodyImg) {
      bodyImageUrls.set(1, bodyImg.url)
      console.log(`[MagazineGenerator] 본문 이미지 1 (${ctxList[1].type}, ${bodyImg.source}): ${bodyImg.url.slice(0, 50)}...`)
    } else {
      console.warn(`[MagazineGenerator] ⚠️ 본문 이미지 생성 실패 — "${topic.title}" (<!-- [IMAGE:1] --> 플레이스홀더 제거됨)`)
    }

    // 리치 HTML 템플릿으로 최종 콘텐츠 빌드
    const sections = parseSectionsFromAI(article.content)
    const todayDate = new Date()
    const kstDate = new Date(todayDate.getTime() + 9 * 60 * 60 * 1000)
    const dateStr = kstDate.toISOString().split('T')[0]

    let finalHtml = buildMagazineHtml({
      title: article.title,
      subtitle: article.summary ?? '',
      category,
      heroImageUrl: image?.url,
      readingTime: Math.ceil(article.content.length / 500),
      sections,
      authorName: '우나어 매거진 편집팀',
      publishedDate: dateStr,
    })

    // 본문 <!-- [IMAGE:N] --> 플레이스홀더를 실제 이미지로 치환
    for (const [n, url] of bodyImageUrls) {
      // alt text: Unsplash 검색어(한국어) → 이미지 타입 → 제목 기반 fallback
      const ctx = ctxList[n - 1]
      const altText = ctx?.unsplashQuery ?? `${article.title} 관련 이미지`
      finalHtml = finalHtml.replace(
        `<!-- [IMAGE:${n}] -->`,
        `<img src="${url}" alt="${altText}" style="width:100%;height:auto;border-radius:12px;margin:16px 0;" loading="lazy" />`,
      )
    }
    // 생성되지 않은 나머지 플레이스홀더 제거 (잔존 시 경고)
    const remainingPlaceholders = finalHtml.match(/<!-- \[IMAGE:\d+\] -->/g)
    if (remainingPlaceholders && remainingPlaceholders.length > 0) {
      console.warn(`[MagazineGenerator] ⚠️ 미치환 이미지 플레이스홀더 ${remainingPlaceholders.length}개 제거됨:`, remainingPlaceholders)
    }
    finalHtml = finalHtml.replace(/<!-- \[IMAGE:\d+\] -->/g, '')
    // IMAGE_PROMPT 텍스트 잔존 방어 (AI가 예상 외 위치에 출력한 경우)
    finalHtml = finalHtml.replace(/\[IMAGE_PROMPT:[^\]]*\]/g, '')

    // 썸네일 생성 (실패해도 발행은 계속)
    let thumbnailUrl: string | undefined
    try {
      const tempId = `tmp-${Date.now()}`
      thumbnailUrl = await generateMagazineThumbnail({
        title: article.title,
        category,
        postId: tempId,
      })
      console.log(`[MagazineGenerator] 썸네일 생성: ${thumbnailUrl}`)
    } catch (err) {
      console.warn('[MagazineGenerator] 썸네일 생성 실패, 히어로 이미지 폴백:', err)
    }
    // 히어로 이미지 폴백 — Playwright 실패 시 DALL-E 히어로 이미지를 썸네일로 사용
    if (!thumbnailUrl && image?.url) {
      thumbnailUrl = image.url
      console.log(`[MagazineGenerator] 히어로 이미지를 썸네일로 사용: ${image.url.slice(0, 50)}...`)
    }

    // 리치 HTML을 게시 콘텐츠로 사용
    const richArticle = { ...article, content: finalHtml }
    const postId = await publishMagazine(richArticle, category, thumbnailUrl)

    // CPS 상품 매칭 + 저장
    try {
      const cpsProducts = await matchCpsProducts(category, article.title, article.content)
      if (cpsProducts.length > 0) {
        await saveCpsLinks(postId, cpsProducts)
        console.log(`[MagazineGenerator] CPS ${cpsProducts.length}개 매칭: ${cpsProducts.map(p => p.productName).join(', ')}`)
      }
    } catch (err) {
      console.warn('[MagazineGenerator] CPS 매칭 실패 (무시):', err)
    }

    publishedCount++
    publishedTitles.push(article.title)
    console.log(`[MagazineGenerator] 발행: "${article.title}" (${postId}) — 히어로 ${image ? `1장(${image.source})` : '없음'} + 본문 ${bodyImageUrls.size}장`)
  }

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'COO',
      action: 'MAGAZINE_GENERATE',
      status: publishedCount > 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({
        topicsAvailable: magazineTopics.length,
        published: publishedCount,
        titles: publishedTitles,
      }),
      itemCount: publishedCount,
      executionTimeMs: durationMs,
    },
  })

  if (publishedCount > 0) {
    await notifySlack({
      level: 'info',
      agent: 'MAGAZINE_GENERATOR',
      title: '매거진 자동 발행',
      body: `${publishedCount}편 발행 완료\n${publishedTitles.map(t => `• ${t}`).join('\n')}`,
    })
  }

  console.log(`[MagazineGenerator] 완료 — ${publishedCount}편 발행, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[MagazineGenerator] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'MAGAZINE_GENERATOR',
    title: '매거진 생성 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
