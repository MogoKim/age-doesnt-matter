/**
 * Google 전용 커뮤니티 글 색인 제외 판단 (PR-B1 + PR-B2, 순수 함수 — DB/서버 의존 없음).
 *
 * 배경: 구글에는 얇은 커뮤니티 URL이 수천 개인 사이트로 보이지만, 네이버 검색 성과는 양호하다.
 * 따라서 **네이버에는 손대지 않고 구글에만** 색인을 줄인다.
 *   - `<meta name="robots" content="index, follow">`      ← 네이버(Yeti) 등 전체 봇: 그대로 색인 허용
 *   - `<meta name="googlebot" content="noindex, follow">` ← 구글봇만 색인 제외(링크는 계속 따라감)
 *   - `/sitemap.xml`·`robots.txt`는 **일절 변경하지 않는다**(네이버 수집 경로 보존).
 *
 * 두 갈래로 판단한다.
 *   - **보드 전면 제외(B2)**: HUMOR는 무조건 구글 색인 제외.
 *   - **글 단위 품질(B1)**: STORY/LIFE2는 "가장 명확한 저품질"만 자르고,
 *     반응·본문·메타 중 하나라도 있으면 보호한다. 신규 글은 14일 유예(반응이 붙을 시간).
 * MENOPAUSE(갱년기톡)는 핵심 성장축이라 어느 갈래에도 넣지 않고 전면 보호한다.
 *
 * ※ greeting/이벤트 글의 기존 `robots {index:false, follow:false}` 정책이 항상 우선한다(호출부에서 처리).
 */
import { stripHtmlTags } from '@/lib/sanitize'

/**
 * 보드 전체를 구글 색인에서 빼는 대상 (PR-B2).
 * HUMOR(웃음방)는 연예·방송 잡담이 대부분이라 우나어 정체성(45~65 여성 갱년기·관계·인생2막)과
 * 가장 멀다. 실측(2026-07-28, GSC 90일): HUMOR 실적 상위가 전부 연예 검색어이고
 * 사이트 전체 클릭의 11%(25건)·노출의 15%(197건)뿐이라, 정체성 재구축을 위해 통째로 뺀다.
 * 길이·댓글·SEO 메타·작성일과 무관하게 적용한다.
 */
const BOARD_WIDE_NOINDEX_TYPES = ['HUMOR'] as const

/** 글 단위 품질 조건(B1)으로 판단하는 보드 (MENOPAUSE·MAGAZINE·JOB 등은 대상 아님) */
const TARGET_BOARD_TYPES = ['STORY', 'LIFE2'] as const

/** 본문이 이 길이 미만이면 "얇은 글" */
const MIN_TEXT_LENGTH = 300

/** 발행 후 이 기간이 지나야 판단 대상 (신규 글 유예) */
const MIN_AGE_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export interface CommunityGoogleNoindexInput {
  boardType: string
  content: string | null
  commentCount: number
  seoTitle: string | null
  seoDescription: string | null
  createdAt: Date | string
}

/**
 * 구글 전용 noindex 대상인지 판단한다.
 *
 * (A) boardType이 HUMOR면 다른 조건을 보지 않고 무조건 true (PR-B2, 보드 전면 제외).
 * (B) 그 외에는 아래 조건을 **모두** 만족할 때만 true (PR-B1 유지).
 *   1) boardType이 STORY/LIFE2
 *   2) 본문 텍스트 300자 미만
 *   3) 댓글 0개
 *   4) seoTitle·seoDescription 중 하나라도 없음
 *   5) 작성 후 14일 이상 경과
 * 하나라도 어긋나면 false(= 보호)이며, 판단 불가한 입력도 보호 쪽으로 떨어진다.
 */
export function shouldGoogleNoindexCommunityPost(
  post: CommunityGoogleNoindexInput,
  now: Date = new Date(),
): boolean {
  // 0) 보드 전면 제외 (HUMOR) — 본문 길이·댓글·SEO 메타·작성일과 무관하게 구글에서 뺀다
  if ((BOARD_WIDE_NOINDEX_TYPES as readonly string[]).includes(post.boardType)) return true

  // 1) 글 단위 판단 대상 보드만 (MENOPAUSE·MAGAZINE·JOB·기타 전부 보호)
  if (!(TARGET_BOARD_TYPES as readonly string[]).includes(post.boardType)) return false

  // 3) 반응이 있으면 보호
  if (post.commentCount >= 1) return false

  // 4) SEO 메타가 모두 갖춰졌으면 보호(운영자가 손본 글)
  if (post.seoTitle && post.seoDescription) return false

  // 2) 본문이 충분하면 보호
  const text = stripHtmlTags(post.content ?? '').replace(/\s+/g, ' ').trim()
  if (text.length >= MIN_TEXT_LENGTH) return false

  // 5) 신규 글 유예 — 날짜 파싱 실패 시에도 보호
  const createdAt = post.createdAt instanceof Date ? post.createdAt : new Date(post.createdAt)
  const createdMs = createdAt.getTime()
  if (Number.isNaN(createdMs)) return false
  const ageDays = (now.getTime() - createdMs) / DAY_MS
  if (ageDays < MIN_AGE_DAYS) return false

  return true
}
