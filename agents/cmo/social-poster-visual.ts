/**
 * CMO Social Poster Visual v2 — 카드뉴스 v2 파이프라인
 *
 * 흐름:
 * 1. research → generate (카드뉴스 콘텐츠 + 리서치)
 * 2. image-gen (DALL-E 이미지 생성)
 * 3. render (HTML → PNG 렌더링)
 * 4. post (4개 플랫폼 게시)
 * 5. log (BotLog + Slack)
 */
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import {
  generateCardNewsV2,
  type ContentCategory,
  type CardNewsOutput,
} from './card-news/generator.js'
import { generateCardNewsImages, type CardNewsImageResult } from './card-news/image-gen.js'
import { renderCardNewsV2, type CardNewsSlideData } from './card-news/renderer.js'
import * as instagramClient from './platforms/instagram-client.js'
import * as facebookClient from './platforms/facebook-client.js'
import * as threadsClient from './platforms/threads-client.js'
import * as bandClient from './platforms/band-client.js'

const SITE_URL = 'https://age-doesnt-matter.com'

/* ── 카테고리별 해시태그 ── */
const CATEGORY_HASHTAGS: Record<ContentCategory, string[]> = {
  WELLNESS: ['#건강한하루', '#운동습관', '#건강정보'],
  PRACTICAL: ['#생활꿀팁', '#알아두면좋은', '#재테크'],
  COMMUNITY: ['#또래모임', '#함께해요', '#우리또래'],
  LIFESTYLE: ['#여행스타그램', '#취미생활', '#일상'],
  GROWTH: ['#배움', '#자기계발', '#새로운시작'],
  TRENDING: ['#화제의소식', '#요즘이슈', '#트렌드'],
}
const BASE_HASHTAGS = ['#우리나이가어때서', '#인생2막', '#5060']

/* ── 캡션 빌더 ── */
function buildCaption(output: CardNewsOutput): string {
  const categoryIntro: Record<ContentCategory, string> = {
    WELLNESS: `💪 ${output.topic}\n\n건강한 하루를 위한 꿀팁, 한 장씩 넘겨보세요!`,
    PRACTICAL: `💡 ${output.topic}\n\n알아두면 좋은 실용 정보를 정리했어요!`,
    COMMUNITY: `🔥 ${output.topic}\n\n우리 또래가 함께 나누는 따뜻한 이야기`,
    LIFESTYLE: `✨ ${output.topic}\n\n일상을 더 풍요롭게 만드는 정보!`,
    GROWTH: `📚 ${output.topic}\n\n새로운 도전, 함께 시작해봐요!`,
    TRENDING: `📰 ${output.topic}\n\n요즘 우리 또래 사이에서 화제인 이야기!`,
  }

  const hashtags = [
    ...BASE_HASHTAGS,
    ...CATEGORY_HASHTAGS[output.category],
    ...output.tags.slice(0, 2),
  ]

  return `${categoryIntro[output.category]}\n\n👉 더 많은 이야기: ${SITE_URL}\n\n${hashtags.join(' ')}`
}

/** 시간 슬롯 감지 */
function detectSlot(): string {
  const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })
  const h = parseInt(hour, 10)
  if (h >= 6 && h < 11) return 'morning'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 14 && h < 17) return 'afternoon'
  return 'evening'
}


/** Band용 bullet 요약 생성 */
function buildBandSummary(output: CardNewsOutput): string {
  const bullets = output.slides
    .filter(s => s.bulletPoints && s.bulletPoints.length > 0)
    .flatMap(s => s.bulletPoints ?? [])
    .slice(0, 5)
    .map(b => `• ${b}`)
    .join('\n')

  const summary = bullets || output.slides
    .filter(s => s.body)
    .slice(0, 3)
    .map(s => `• ${s.title}`)
    .join('\n')

  return `${output.topic}\n\n${summary}\n\n👉 더 많은 이야기: ${SITE_URL}`
}

/* ── 메인 파이프라인 ── */
async function main() {
  console.log('[SocialPosterVisual v2] 시작')
  const startTime = Date.now()
  let postedCount = 0

  // 1. 콘텐츠 생성 (리서치 포함)
  const { output, research, sourcePostIds } = await generateCardNewsV2()
  console.log(`[v2] 콘텐츠 생성: ${output.category} — "${output.topic}" (${output.slides.length}장)`)

  // 2. DALL-E 이미지 생성 (imagePrompt가 있는 슬라이드만)
  const imagePrompts = output.slides
    .map((s, i) =>
      s.imagePrompt
        ? { slideIndex: i, prompt: s.imagePrompt, style: (s.imageStyle ?? 'warm-lifestyle') as 'warm-lifestyle' | 'infographic' | 'illustration' | 'photo-realistic' }
        : null,
    )
    .filter((x): x is NonNullable<typeof x> => x !== null)

  let imageResults: CardNewsImageResult[] = []
  if (imagePrompts.length > 0) {
    imageResults = await generateCardNewsImages(imagePrompts)
    console.log(`[v2] DALL-E 이미지: ${imageResults.length}/${imagePrompts.length}장 생성`)
  }

  // 3. SlideData 빌드 (이미지 URL 주입)
  const slideData: CardNewsSlideData[] = output.slides.map((s, i) => {
    const img = imageResults.find(r => r.slideIndex === i)
    return {
      slideType: s.slideType,
      title: s.title,
      body: s.body,
      bulletPoints: s.bulletPoints,
      statNumber: s.statNumber,
      statLabel: s.statLabel,
      stepNumber: s.stepNumber,
      stepTotal: s.stepTotal,
      listRank: s.listRank,
      imageUrl: img?.url,
      ctaText: s.ctaText,
      ctaUrl: s.ctaUrl ?? SITE_URL,
      icon: s.icon,
      leftLabel: s.leftLabel,
      leftText: s.leftText,
      rightLabel: s.rightLabel,
      rightText: s.rightText,
      attribution: s.attribution,
      slideNumber: i + 1,
      totalSlides: output.slides.length,
      category: output.category,
    }
  })

  // 4. 슬라이드 렌더링 (HTML → PNG)
  const rendered = await renderCardNewsV2(slideData)
  console.log(`[v2] 렌더링: ${rendered.imageUrls.length}장`)

  // 5. 캡션 + 슬롯
  const caption = buildCaption(output)
  const slot = detectSlot()
  const hashtags = [...BASE_HASHTAGS, ...CATEGORY_HASHTAGS[output.category]]

  // 6. Instagram — 전체 캐러셀
  if (instagramClient.isConfigured()) {
    try {
      const igResult = await instagramClient.postCarousel(rendered.imageUrls, caption)
      await prisma.socialPost.create({
        data: {
          platform: 'INSTAGRAM',
          contentType: output.category,
          promotionLevel: output.category === 'COMMUNITY' ? 'SOFT' : 'PURE',
          postText: caption,
          hashtags,
          imageUrls: rendered.imageUrls,
          cardNewsType: output.category,
          platformPostId: igResult.id,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[v2] Instagram 게시 완료: ${igResult.id}`)
    } catch (err) {
      console.error('[v2] Instagram 게시 실패:', err)
    }
  }

  // 7. Facebook — 전체 슬라이드 (인스타그램과 동일)
  if (facebookClient.isConfigured()) {
    try {
      const fbResult = await facebookClient.postWithPhotos(rendered.imageUrls, caption)
      await prisma.socialPost.create({
        data: {
          platform: 'FACEBOOK',
          contentType: output.category,
          promotionLevel: output.category === 'COMMUNITY' ? 'SOFT' : 'PURE',
          postText: caption,
          hashtags,
          imageUrls: rendered.imageUrls,
          cardNewsType: output.category,
          platformPostId: fbResult.id,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[v2] Facebook 게시 완료: ${fbResult.id} (${rendered.imageUrls.length}장)`)
    } catch (err) {
      console.error('[v2] Facebook 게시 실패:', err)
    }
  }

  // 8. Threads — 표지 이미지 + 짧은 캡션 (500자)
  if (threadsClient.isConfigured()) {
    try {
      const threadsCaption = caption.slice(0, 500)
      const coverUrl = rendered.imageUrls[0]
      const thResult = await threadsClient.postThreadWithImage(threadsCaption, coverUrl)
      await prisma.socialPost.create({
        data: {
          platform: 'THREADS',
          contentType: output.category,
          promotionLevel: output.category === 'COMMUNITY' ? 'SOFT' : 'PURE',
          postText: threadsCaption,
          hashtags,
          imageUrls: [coverUrl],
          cardNewsType: output.category,
          platformPostId: thResult.id,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[v2] Threads 게시 완료: ${thResult.id}`)
    } catch (err) {
      console.error('[v2] Threads 게시 실패:', err)
    }
  }

  // 9. Band — 표지 + bullet 요약
  if (bandClient.isConfigured()) {
    try {
      const bandCaption = buildBandSummary(output)
      const coverUrl = rendered.imageUrls[0]
      const bandResult = await bandClient.postWithImage(bandCaption, [coverUrl])
      await prisma.socialPost.create({
        data: {
          platform: 'BAND',
          contentType: output.category,
          promotionLevel: output.category === 'COMMUNITY' ? 'SOFT' : 'PURE',
          postText: bandCaption,
          hashtags,
          imageUrls: [coverUrl],
          cardNewsType: output.category,
          platformPostId: bandResult.postKey,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[v2] Band 게시 완료: ${bandResult.postKey}`)
    } catch (err) {
      console.error('[v2] Band 게시 실패:', err)
    }
  }

  // 10. BotLog + Slack 알림
  const durationMs = Date.now() - startTime

  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'CARD_NEWS_POST_V2',
      status: postedCount > 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({
        category: output.category,
        topic: output.topic,
        slides: output.slides.length,
        dalleImages: imageResults.length,
        platforms: postedCount,
        imageUrls: rendered.imageUrls,
        sourcePostIds,
        research: research ? { topicCount: research.topics?.length ?? 0 } : null,
      }),
      itemCount: postedCount,
      executionTimeMs: durationMs,
    },
  })

  await notifySlack({
    level: postedCount > 0 ? 'info' : 'warn',
    agent: 'SOCIAL_POSTER_VISUAL_V2',
    title: '카드뉴스 v2 멀티채널 게시',
    body: `${output.category} — "${output.topic}"\n슬라이드 ${output.slides.length}장 (DALL-E ${imageResults.length}장) → ${postedCount}개 플랫폼 게시\n소요: ${Math.round(durationMs / 1000)}초`,
  })

  console.log(`[SocialPosterVisual v2] 완료 — ${postedCount}개 플랫폼, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[SocialPosterVisual v2] 치명적 오류:', err)
  await disconnect()
  process.exit(1)
})
