/**
 * 매거진 자동생성기
 * CafeTrend.magazineTopics를 기반으로 에디터 스타일 매거진 글 생성
 * 매일 16:00 KST 실행 (트렌드 분석 후)
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import type { MagazineSuggestion } from './types.js'
import { matchCpsProducts, saveCpsLinks } from './cps-matcher.js'
import { generateMagazineThumbnail } from './thumbnail-generator.js'
import { generateMagazineImage, getImageStyle } from './image-generator.js'
import { buildMagazineHtml, parseSectionsFromAI } from './magazine-template.js'

const CLAUDE_MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const CLAUDE_MODEL_STRATEGIC = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'
const client = new Anthropic()

/** 카테고리 자동 매핑 */
function detectCategory(title: string, reason: string): string {
  const text = `${title} ${reason}`.toLowerCase()
  const map: Record<string, string[]> = {
    '건강': ['건강', '운동', '관절', '영양', '수면', '병원', '치매', '혈압', '당뇨', '걷기'],
    '생활': ['살림', '정리', '세탁', '절약', '생활', '꿀팁', '재활용'],
    '재테크': ['재테크', '연금', '저축', '투자', '부동산', '노후', '보험'],
    '여행': ['여행', '맛집', '산책', '둘레길', '관광', '기차', '드라이브'],
    '문화': ['독서', '영화', '드라마', '음악', '전시', '공연', '문화'],
    '요리': ['요리', '레시피', '반찬', '김치', '밑반찬', '제철', '장보기'],
    '일자리': ['일자리', '취업', '자격증', '봉사', '은퇴', '창업', '알바'],
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
): Promise<{ title: string; content: string; summary: string; imageHints: string[] } | null> {
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
    max_tokens: 4000,
    system: `당신은 50·60대 독자를 위한 매거진 편집장입니다.
"우리 나이가 어때서" 커뮤니티의 따뜻하고 유익한 매거진 기사를 작성합니다.

독자 페르소나를 이해하세요:
- P1 영숙씨: 느슨한 연결을 원하는 사교형
- P2 정희씨: 건강 불안이 있는 정보 탐색형
- P3 미영씨: 유머와 재미를 찾는 활력형
- P4 순자씨: 생계 걱정이 있는 실용형
- P5 현주씨: 간병 부담을 안고 있는 헌신형

작성 규칙:
- "시니어", "액티브 시니어" 같은 표현 절대 금지. 대신 "우리 또래", "50대 60대", "인생 2막" 등 자연스러운 표현 사용
- 편안한 존댓말 (해요체)
- 실용적이고 바로 써먹을 수 있는 정보 중심
- 구체적 수치/데이터를 반드시 1개 이상 포함 (예: "국민건강영양조사에 따르면...", "전문가에 따르면...")
- 경험 기반 서술 포함 (예: "직접 해본 결과", "실제로 시도해보니", "주변에서 들은 이야기로는")
- 공감할 수 있는 에피소드나 사례 포함
- 정치/종교/혐오/광고 절대 금지

글의 구조:
- ## 제목으로 3-4개 섹션, 각 섹션에 구체적 사례/데이터 포함
- 💡 꿀팁: 섹션에 실용적 팁 박스 최소 1개
- 인용문: 공감되는 한 줄 인용 최소 1개
- imagePrompt: 기사 주제에 맞는 이미지 프롬프트를 마지막에 한 줄로 출력 (형식: [IMAGE_PROMPT: 설명])

HTML 형식 규칙:
- 사용 가능 태그: h2, h3, p, ul, ol, li, strong, em, blockquote, aside
- <h2>로 메인 소제목 (3~4개)
- <aside class="tip-box">💡 꿀팁: 내용</aside>로 실용 팁 박스 (1~2개)
- <blockquote>로 경험담/인용문 (1개)
- 이미지가 들어갈 위치에 <!-- [IMAGE:N] --> 주석 삽입 (N은 1부터)`,
    messages: [{
      role: 'user',
      content: `"${topic.title}" 주제로 매거진 기사를 작성해주세요.
카테고리: ${category}
추천 이유: ${topic.reason}

${refs ? `참고 자료 (카페 인기글):\n${refs}` : ''}

${recentList ? `최근 발행 매거진 (중복 주제 피해주세요):\n${recentList}` : ''}

응답 형식 (반드시 아래 형식을 따라주세요):
제목: (20~40자, 매력적이고 클릭하고 싶은 제목)
요약: (50~80자, 한 줄 요약)
이미지힌트: (각 이미지에 대한 설명, 쉼표로 구분. 예: "공원에서 걷기 운동하는 중년 부부, 건강한 식탁 위 제철 과일과 채소")
본문: (HTML, 1500~3000자, 소제목 3~4개 포함)

본문 구조:
<p>서문 2~3문장 — 독자의 공감을 이끄는 도입부</p>

<h2>소제목 1</h2>
<p>핵심 정보 + 구체적 데이터...</p>
<!-- [IMAGE:1] -->

<aside class="tip-box">💡 꿀팁: 바로 실천할 수 있는 팁</aside>

<h2>소제목 2</h2>
<p>심화 정보...</p>
<!-- [IMAGE:2] -->

<blockquote>실제 경험담이나 전문가 인용</blockquote>

<h2>소제목 3</h2>
<p>추가 정보 + 주의사항...</p>

<h2>마무리</h2>
<p>따뜻한 마무리 + 행동 유도 (CTA)</p>`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const summaryMatch = text.match(/요약:\s*(.+)/)
  const imageHintsMatch = text.match(/이미지힌트:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  if (!titleMatch || !bodyMatch) return null

  const imageHints = imageHintsMatch
    ? imageHintsMatch[1].trim().split(/[,，]/).map(h => h.trim()).filter(Boolean)
    : []

  return {
    title: titleMatch[1].trim(),
    summary: summaryMatch?.[1]?.trim() ?? '',
    content: bodyMatch[1].trim(),
    imageHints,
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
  if (!magazineTopics || magazineTopics.length === 0) {
    console.log('[MagazineGenerator] 매거진 추천 주제 없음 — 스킵')
    await disconnect()
    return
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

    // 히어로 이미지 프롬프트 추출 + DALL-E 이미지 생성
    const imagePromptMatch = article.content.match(/\[IMAGE_PROMPT:\s*(.+?)\]/)
    const imagePrompt = imagePromptMatch?.[1] ?? `${topic.title} 관련 따뜻한 이미지`
    // 추출 후 원본에서 제거 — 최종 HTML에 텍스트 노출 방지
    article.content = article.content.replace(/\[IMAGE_PROMPT:\s*.+?\]/g, '')
    const imageStyle = getImageStyle(category)

    const image = await generateMagazineImage(imagePrompt, imageStyle)
    if (image) {
      console.log(`[MagazineGenerator] 히어로 이미지 생성 완료: ${image.url.slice(0, 50)}...`)
    }

    // 본문 이미지 생성 (imageHints 기반, 최대 2장 — 비용 제어)
    const MAX_BODY_IMAGES = 2
    const bodyImageUrls = new Map<number, string>()

    for (let i = 0; i < Math.min(article.imageHints.length, MAX_BODY_IMAGES); i++) {
      const hint = article.imageHints[i]
      const bodyImg = await generateMagazineImage(hint, imageStyle)
      if (bodyImg) {
        bodyImageUrls.set(i + 1, bodyImg.url) // IMAGE:N은 1부터 시작
        console.log(`[MagazineGenerator] 본문 이미지 ${i + 1} 생성: ${bodyImg.url.slice(0, 50)}...`)
      }
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
      finalHtml = finalHtml.replace(
        `<!-- [IMAGE:${n}] -->`,
        `<img src="${url}" alt="${article.imageHints[n - 1] ?? ''}" style="width:100%;height:auto;border-radius:12px;margin:16px 0;" loading="lazy" />`,
      )
    }
    // 생성되지 않은 나머지 플레이스홀더 제거
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
    console.log(`[MagazineGenerator] 발행: "${article.title}" (${postId}) — 이미지: 히어로 ${image ? 1 : 0}장 + 본문 ${bodyImageUrls.size}장`)
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
