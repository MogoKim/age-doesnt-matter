/**
 * CMO Social Poster (Visual) — 카드뉴스 기반 Instagram/Facebook 게시 에이전트
 *
 * 흐름:
 * 1. 카드뉴스 콘텐츠 생성 (card-news/generator.ts)
 * 2. HTML → PNG 렌더링 (card-news/renderer.ts)
 * 3. Instagram 캐러셀 + Facebook 멀티포토 게시
 * 4. Threads에도 표지 이미지 게시
 * 5. SocialPost DB 저장 + Slack 알림
 */
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { generateCardNewsContent } from './card-news/generator.js'
import { renderCardNews } from './card-news/renderer.js'
import * as instagramClient from './platforms/instagram-client.js'
import * as facebookClient from './platforms/facebook-client.js'
import * as threadsClient from './platforms/threads-client.js'
import * as bandClient from './platforms/band-client.js'

const SITE_URL = 'https://age-doesnt-matter.com'

/** 해시태그 생성 */
function buildHashtags(topic: string, cardNewsType: string): string[] {
  const base = ['#우리나이가어때서', '#5060세대', '#인생2막']
  const typeMap: Record<string, string[]> = {
    NEWS_TREND: ['#최신뉴스', '#트렌드', '#알아두면좋은'],
    INFO_TOPIC: ['#생활꿀팁', '#유익한정보', '#건강생활'],
    COMMUNITY_PROMO: ['#커뮤니티', '#소통', '#또래모임'],
  }
  return [...base, ...(typeMap[cardNewsType] ?? [])].slice(0, 6)
}

/** 캡션 생성 */
function buildCaption(topic: string, cardNewsType: string, hashtags: string[]): string {
  const typeIntro: Record<string, string> = {
    NEWS_TREND: `📰 ${topic}\n\n요즘 우리 또래 사이에서 화제인 이야기, 카드로 정리했어요!`,
    INFO_TOPIC: `💡 ${topic}\n\n알아두면 좋은 정보, 한 장씩 넘겨보세요!`,
    COMMUNITY_PROMO: `🔥 이번 주 우나어에서 가장 뜨거운 이야기\n\n${topic}`,
  }

  const intro = typeIntro[cardNewsType] ?? topic
  return `${intro}\n\n👉 더 많은 이야기: ${SITE_URL}\n\n${hashtags.join(' ')}`
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

/** 메인 실행 */
async function main() {
  console.log('[SocialPosterVisual] 시작 — 카드뉴스 생성 + 멀티채널 게시')
  const startTime = Date.now()
  let postedCount = 0

  // 1. 카드뉴스 콘텐츠 생성
  const content = await generateCardNewsContent()
  console.log(`[SocialPosterVisual] 콘텐츠 생성 완료: ${content.cardNewsType} — "${content.topic}" (${content.slides.length}슬라이드)`)

  // 2. HTML → PNG 렌더링
  const rendered = await renderCardNews(content.cardNewsType, content.slides)
  console.log(`[SocialPosterVisual] 렌더링 완료: ${rendered.imageUrls.length}장`)

  const hashtags = buildHashtags(content.topic, content.cardNewsType)
  const caption = buildCaption(content.topic, content.cardNewsType, hashtags)
  const slot = detectSlot()

  // 3. Instagram 캐러셀 게시
  if (instagramClient.isConfigured()) {
    try {
      const igResult = await instagramClient.postCarousel(rendered.imageUrls, caption)
      await prisma.socialPost.create({
        data: {
          platform: 'INSTAGRAM',
          contentType: content.cardNewsType,
          promotionLevel: content.cardNewsType === 'COMMUNITY_PROMO' ? 'SOFT' : 'PURE',
          postText: caption,
          hashtags,
          imageUrls: rendered.imageUrls,
          cardNewsType: content.cardNewsType,
          platformPostId: igResult.id,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[SocialPosterVisual] Instagram 게시 완료: ${igResult.id}`)
    } catch (err) {
      console.error('[SocialPosterVisual] Instagram 게시 실패:', err)
    }
  }

  // 4. Facebook 게시
  if (facebookClient.isConfigured()) {
    try {
      const fbResult = await facebookClient.postWithPhotos(rendered.imageUrls, caption)
      await prisma.socialPost.create({
        data: {
          platform: 'FACEBOOK',
          contentType: content.cardNewsType,
          promotionLevel: content.cardNewsType === 'COMMUNITY_PROMO' ? 'SOFT' : 'PURE',
          postText: caption,
          hashtags,
          imageUrls: rendered.imageUrls,
          cardNewsType: content.cardNewsType,
          platformPostId: fbResult.id,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[SocialPosterVisual] Facebook 게시 완료: ${fbResult.id}`)
    } catch (err) {
      console.error('[SocialPosterVisual] Facebook 게시 실패:', err)
    }
  }

  // 5. Threads에 표지 이미지 게시
  if (threadsClient.isConfigured()) {
    try {
      const threadsCaption = caption.replace(/\n👉.*\n/, '\n').slice(0, 500)
      const thResult = await threadsClient.postThreadWithImage(threadsCaption, rendered.thumbnailUrl)
      await prisma.socialPost.create({
        data: {
          platform: 'THREADS',
          contentType: content.cardNewsType,
          promotionLevel: content.cardNewsType === 'COMMUNITY_PROMO' ? 'SOFT' : 'PURE',
          postText: threadsCaption,
          hashtags,
          imageUrls: [rendered.thumbnailUrl],
          cardNewsType: content.cardNewsType,
          platformPostId: thResult.id,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[SocialPosterVisual] Threads 이미지 게시 완료: ${thResult.id}`)
    } catch (err) {
      console.error('[SocialPosterVisual] Threads 게시 실패:', err)
    }
  }

  // 6. Band 게시
  if (bandClient.isConfigured()) {
    try {
      const bandCaption = `${content.topic}\n\n${caption.split('\n\n').slice(1).join('\n\n')}`
      const bandResult = await bandClient.postWithImage(bandCaption, rendered.imageUrls)
      await prisma.socialPost.create({
        data: {
          platform: 'BAND',
          contentType: content.cardNewsType,
          promotionLevel: content.cardNewsType === 'COMMUNITY_PROMO' ? 'SOFT' : 'PURE',
          postText: bandCaption,
          hashtags,
          imageUrls: rendered.imageUrls,
          cardNewsType: content.cardNewsType,
          platformPostId: bandResult.postKey,
          postingSlot: slot,
          linkUrl: SITE_URL,
          status: 'POSTED',
          postedAt: new Date(),
        },
      })
      postedCount++
      console.log(`[SocialPosterVisual] Band 게시 완료: ${bandResult.postKey}`)
    } catch (err) {
      console.error('[SocialPosterVisual] Band 게시 실패:', err)
    }
  }

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'CARD_NEWS_POST',
      status: postedCount > 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({
        cardNewsType: content.cardNewsType,
        topic: content.topic,
        slides: content.slides.length,
        platforms: postedCount,
        imageUrls: rendered.imageUrls,
      }),
      itemCount: postedCount,
      executionTimeMs: durationMs,
    },
  })

  await notifySlack({
    level: postedCount > 0 ? 'info' : 'warn',
    agent: 'SOCIAL_POSTER_VISUAL',
    title: '카드뉴스 멀티채널 게시',
    body: `${content.cardNewsType} — "${content.topic}"\n슬라이드 ${content.slides.length}장 → ${postedCount}개 플랫폼 게시\n소요: ${Math.round(durationMs / 1000)}초`,
  })

  console.log(`[SocialPosterVisual] 완료 — ${postedCount}개 플랫폼, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[SocialPosterVisual] 치명적 오류:', err)
  await disconnect()
  process.exit(1)
})
