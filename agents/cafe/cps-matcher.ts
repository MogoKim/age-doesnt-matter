/**
 * CPS 상품 매칭 — 매거진 카테고리별 쿠팡 상품 추천
 * 매거진 글에 관련 상품 CPS 링크를 자동 삽입
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import { createDeepLink } from '../../src/lib/coupang.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

/** 카테고리별 기본 추천 상품 URL (쿠팡 베스트셀러) */
const CATEGORY_PRODUCTS: Record<string, Array<{ name: string; url: string; imageUrl?: string }>> = {
  '건강': [
    { name: '종합비타민 (50대 이상)', url: 'https://www.coupang.com/vp/products/7335498' },
    { name: '무릎 보호대', url: 'https://www.coupang.com/vp/products/6281849' },
    { name: '혈압계', url: 'https://www.coupang.com/vp/products/5923847' },
  ],
  '요리': [
    { name: '에어프라이어', url: 'https://www.coupang.com/vp/products/6834521' },
    { name: '밀폐용기 세트', url: 'https://www.coupang.com/vp/products/7123456' },
  ],
  '여행': [
    { name: '경량 백팩', url: 'https://www.coupang.com/vp/products/6543210' },
    { name: '넥쿠션', url: 'https://www.coupang.com/vp/products/5678901' },
  ],
  '생활': [
    { name: '안마기', url: 'https://www.coupang.com/vp/products/7654321' },
    { name: '스팀청소기', url: 'https://www.coupang.com/vp/products/6789012' },
  ],
}

interface CpsRecommendation {
  productName: string
  productUrl: string
  trackingUrl: string
  productImageUrl?: string
  reason: string
}

/**
 * AI로 매거진 본문에 맞는 상품 추천 (카테고리 기반)
 */
export async function matchCpsProducts(
  category: string,
  articleTitle: string,
  articleContent: string,
): Promise<CpsRecommendation[]> {
  const products = CATEGORY_PRODUCTS[category]
  if (!products || products.length === 0) return []

  // AI에게 매칭 요청
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `매거진 기사와 가장 관련 있는 상품을 1~2개 골라주세요.
응답 형식 (JSON): [{"index": 0, "reason": "추천 이유 (15자 이내)"}]
관련 없으면 빈 배열 []을 반환하세요.`,
    messages: [{
      role: 'user',
      content: `기사 제목: ${articleTitle}\n기사 요약: ${articleContent.slice(0, 300)}\n\n상품 목록:\n${products.map((p, i) => `${i}. ${p.name}`).join('\n')}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  let picks: Array<{ index: number; reason: string }> = []
  try {
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
    picks = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned)
  } catch {
    return []
  }

  if (!Array.isArray(picks) || picks.length === 0) return []

  // 유효한 인덱스만 필터
  const validPicks = picks.filter(p =>
    typeof p.index === 'number' && p.index >= 0 && p.index < products.length,
  ).slice(0, 2)

  if (validPicks.length === 0) return []

  // 쿠팡 딥링크 생성
  const urls = validPicks.map(p => products[p.index].url)
  const deepLinks = await createDeepLink(urls, 'magazine')

  return validPicks.map((pick, i) => ({
    productName: products[pick.index].name,
    productUrl: products[pick.index].url,
    trackingUrl: deepLinks[i]?.trackingUrl ?? products[pick.index].url,
    productImageUrl: products[pick.index].imageUrl,
    reason: pick.reason,
  }))
}

/**
 * 매거진 글에 CPS 링크 저장
 */
export async function saveCpsLinks(
  postId: string,
  recommendations: CpsRecommendation[],
): Promise<void> {
  if (recommendations.length === 0) return

  await prisma.cpsLink.createMany({
    data: recommendations.map(r => ({
      postId,
      productName: r.productName,
      productUrl: r.trackingUrl,
      productImageUrl: r.productImageUrl,
    })),
  })
}
