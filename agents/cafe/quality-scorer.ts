/**
 * 카페 크롤링 품질 점수 시스템
 *
 * 다중 요소 가중 점수 (0-100):
 * - 참여도 40%: likes, comments, views 기반 (감정/고민글 우대)
 * - 콘텐츠 길이 20%: 너무 짧으면 감점
 * - 미디어 5%: 텍스트 전용 감정글 불이익 최소화
 * - 게시판 우선도 20%: high/medium/skip
 * - 최신성 15%: 오늘 > 어제 > 2-3일 전 > 이전 (dateParseFailure → 0)
 */

import type { RawCafePost } from './types.js'

interface QualityFactors {
  engagement: number   // 0-100
  contentLength: number // 0-100
  media: number        // 0-100
  boardPriority: number // 0-100
  recency: number      // 0-100
}

const WEIGHTS = {
  engagement: 0.40,   // Bug 4: 0.30 → 0.40 (감정/고민 텍스트글 우대)
  contentLength: 0.20,
  media: 0.05,        // Bug 4: 0.15 → 0.05 (텍스트 전용 고가치 글 불이익 최소화)
  boardPriority: 0.20,
  recency: 0.15,
}

/** 참여도 점수 (30%) */
function scoreEngagement(post: RawCafePost): number {
  // 가중 합산: 좋아요×3 + 댓글×2 + 조회×0.01
  const raw = post.likeCount * 3 + post.commentCount * 2 + post.viewCount * 0.01

  // 구간별 점수 (50-60대 카페 기준 현실적 수치)
  if (raw >= 100) return 100
  if (raw >= 50) return 80
  if (raw >= 20) return 60
  if (raw >= 10) return 40
  if (raw >= 5) return 25
  return 10
}

/** 콘텐츠 길이 점수 (20%) */
function scoreContentLength(post: RawCafePost): number {
  const len = post.content.length
  if (len >= 1500) return 100
  if (len >= 800) return 80
  if (len >= 500) return 60
  if (len >= 200) return 40
  if (len >= 100) return 20
  return 5 // 너무 짧음 (제목만 있는 글 등)
}

/** 미디어 점수 (15%) */
function scoreMedia(post: RawCafePost): number {
  const imageCount = post.imageUrls.length
  const videoCount = post.videoUrls.length

  if (videoCount > 0 && imageCount >= 3) return 100
  if (videoCount > 0) return 80
  if (imageCount >= 3) return 80
  if (imageCount >= 1) return 50
  return 10 // 텍스트 전용
}

/** 게시판 우선도 점수 (20%) */
function scoreBoardPriority(post: RawCafePost): number {
  // boardCategory가 있으면 config에서 설정한 카테고리 기반
  // category(원본 게시판명)로 블랙리스트 패턴 매칭
  const category = post.boardCategory
  if (!category) {
    // 카테고리 없으면 원본 게시판명으로 판단
    const name = (post.category ?? '').toLowerCase()
    if (name.includes('인기') || name.includes('베스트')) return 100
    if (name.includes('건강') || name.includes('요리') || name.includes('취미')) return 80
    if (name.includes('유머') || name.includes('웃음')) return 80
    if (name.includes('일자리') || name.includes('채용')) return 80
    if (name.includes('자유') || name.includes('수다') || name.includes('일상')) return 50
    return 40 // 알 수 없는 게시판
  }

  // config에서 설정한 카테고리별 점수
  const categoryScores: Record<string, number> = {
    health: 90,
    hobby: 85,
    food: 85,
    humor: 80,
    job: 90,
    finance: 85,
    lifestyle: 75,
    general: 50,
  }
  return categoryScores[category] ?? 50
}

/** 최신성 점수 (15%) — dateParseFailure이면 0점 (오래된 글로 취급하지 않고 명시적 0) */
function scoreRecency(post: RawCafePost): number {
  // Bug 3 연동: 날짜 파싱 실패 시 recency=0 (임의 날짜로 점수 부풀리기 방지)
  if (post.dateParseFailure) return 0

  const now = new Date()
  const diffHours = (now.getTime() - post.postedAt.getTime()) / (1000 * 60 * 60)

  if (diffHours <= 12) return 100  // 12시간 이내
  if (diffHours <= 24) return 80   // 오늘
  if (diffHours <= 48) return 60   // 어제
  if (diffHours <= 72) return 40   // 2-3일 전
  if (diffHours <= 168) return 20  // 1주 이내
  return 5                          // 오래된 글
}

/** 종합 품질 점수 계산 (0-100) */
export function calculateQualityScore(post: RawCafePost): number {
  const factors: QualityFactors = {
    engagement: scoreEngagement(post),
    contentLength: scoreContentLength(post),
    media: scoreMedia(post),
    boardPriority: scoreBoardPriority(post),
    recency: scoreRecency(post),
  }

  const score =
    factors.engagement * WEIGHTS.engagement +
    factors.contentLength * WEIGHTS.contentLength +
    factors.media * WEIGHTS.media +
    factors.boardPriority * WEIGHTS.boardPriority +
    factors.recency * WEIGHTS.recency

  return Math.round(score)
}
