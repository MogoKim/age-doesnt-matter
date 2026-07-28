/**
 * Google 전용 커뮤니티 글 색인 판단 (PR-B1 → B2 → B3, 순수 함수 — DB/서버 의존 없음).
 *
 * 배경: 구글에는 얇은 커뮤니티 URL이 수천 개인 사이트로 보이지만, 네이버 검색 성과는 양호하다.
 * 따라서 **네이버에는 손대지 않고 구글에만** 색인을 줄인다.
 *   - `<meta name="robots" content="index, follow">`      ← 네이버(Yeti) 등 전체 봇: 그대로 색인 허용
 *   - `<meta name="googlebot" content="noindex, follow">` ← 구글봇만 색인 제외(링크는 계속 따라감)
 *   - `/sitemap.xml`·`robots.txt`는 **일절 변경하지 않는다**(네이버 수집 경로 보존).
 *
 * 보드별 정책:
 *   - **HUMOR (B2)**: 보드 전체를 구글에서 제외. 연예·방송 잡담이라 우나어 정체성과 가장 멀다.
 *   - **STORY / LIFE2 (B3)**: 기본 제외. 우나어 핵심 주제(A좁)에 해당하고 분량·메타까지 갖춘
 *     글만 구글에 남긴다. "애매하면 제거, 확실히 우나어다운 글만 남긴다"가 원칙이다.
 *     실측(2026-07-28) 근거: 이 두 보드 6,401건 중 90일간 구글 노출을 1회라도 받은 글은
 *     224건(3.5%)뿐이라, 나머지는 색인돼 있어도 "얇은 URL 수천 개" 신호만 남긴다.
 *     B1의 글 단위 저품질 조건(300자·댓글0·14일)은 이 B3 기준으로 **대체**됐다.
 *   - **MENOPAUSE(갱년기톡)**: 핵심 성장축 — 어느 정책에도 넣지 않고 전면 보호.
 *   - MAGAZINE·JOB·기타: 대상 아님.
 *
 * ※ greeting/이벤트 글의 기존 `robots {index:false, follow:false}` 정책이 항상 우선한다(호출부에서 처리).
 */
import { stripHtmlTags } from '@/lib/sanitize'

/** 보드 전체를 구글 색인에서 빼는 대상 (B2) — 주제·길이·메타와 무관하게 무조건 제외 */
const BOARD_WIDE_NOINDEX_TYPES = ['HUMOR'] as const

/** 주제 + 분량으로 글 단위 판단하는 대상 (B3) */
const TOPIC_GATED_BOARD_TYPES = ['STORY', 'LIFE2'] as const

/**
 * 우나어 핵심 주제 키워드(A좁).
 *
 * 범용 생활 어휘(남편·딸·가족·병원·약·동네·여행 등)는 **일부러 뺐다**. 실측 결과 그런 단어는
 * 일상 잡담을 포함해 STORY/LIFE2의 72%에 등장해 필터로 기능하지 않았다.
 * 여기 남긴 것은 45~65 여성의 **검색 의도가 분명한 축**뿐이다.
 */
const NARROW_IDENTITY_TOPICS = [
  // 갱년기·여성 건강
  '갱년기', '폐경', '완경', '호르몬', '안면홍조', '불면', '식은땀', '골다공증',
  // 질환·의료·돌봄
  '관절', '당뇨', '혈압', '수술', '검사', '진료', '간병', '돌봄',
  // 가족 전환기(관계 갈등·상실·독립)
  '시댁', '이혼', '재혼', '상속', '장례', '부모님', '자녀 독립', '자녀독립', '빈둥지',
  // 일·재취업
  '은퇴', '퇴직', '재취업', '일자리', '알바', '자격증',
  // 노후 자금
  '연금', '노후', '건강보험', '보험료', '세금', '상속세', '재테크',
  // 주거
  '전세', '월세', '청약', '이사', '주거', '지역 선택',
  // 연령대·정체성
  '40대', '50대', '60대', '중년', '우리 또래', '우리또래', '인생 2막', '인생2막',
] as const

/** 주제에 해당해도 이 분량은 돼야 구글에 남긴다(SEO 메타 완비 시 면제) */
const MIN_TEXT_LENGTH = 500

export interface CommunityGoogleNoindexInput {
  boardType: string
  title: string
  content: string | null
  seoTitle: string | null
  seoDescription: string | null
}

/** HTML을 걷어낸 본문 텍스트 (길이 판정·주제 판정 공용) */
function plainText(content: string | null): string {
  return stripHtmlTags(content ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 제목·본문에 우나어 핵심 주제(A좁)가 있는지 판단한다.
 * 제목까지 보는 이유: 커뮤니티 글은 제목에만 주제가 드러나는 경우가 많다.
 */
export function isNarrowUnaeoIdentityTopic(
  post: Pick<CommunityGoogleNoindexInput, 'title' | 'content'>,
): boolean {
  const haystack = `${post.title ?? ''} ${plainText(post.content)}`
  return NARROW_IDENTITY_TOPICS.some((keyword) => haystack.includes(keyword))
}

/**
 * 구글 전용 noindex 대상인지 판단한다. true면 `googlebot: noindex, follow`를 붙인다.
 *
 *   - HUMOR          → 항상 true (B2)
 *   - STORY / LIFE2  → 기본 true. **A좁 주제 && (본문 500자 이상 || SEO 메타 완비)** 일 때만 false (B3)
 *   - 그 외 보드      → 항상 false (MENOPAUSE·MAGAZINE·JOB 등 보호)
 *
 * 댓글 수는 기준으로 쓰지 않는다 — 봇·운영으로 쉽게 생기므로 구글 품질 신호가 아니다.
 * 신규 글 유예도 두지 않는다 — 주제·분량은 시간이 지나도 달라지지 않으므로 유예에 의미가 없다.
 * GSC 실적도 쓰지 않는다 — 코드에서 조회할 수 없고, "노출이 있어야 색인"은 신규 글이 영원히
 * 색인되지 않는 자기충족 함정이 된다.
 */
export function shouldGoogleNoindexCommunityPost(post: CommunityGoogleNoindexInput): boolean {
  // 1) 보드 전면 제외 (HUMOR)
  if ((BOARD_WIDE_NOINDEX_TYPES as readonly string[]).includes(post.boardType)) return true

  // 2) 주제 게이트 대상이 아니면 보호 (MENOPAUSE·MAGAZINE·JOB·기타 전부)
  if (!(TOPIC_GATED_BOARD_TYPES as readonly string[]).includes(post.boardType)) return false

  // 3) 우나어 핵심 주제가 아니면 제외 — 애매하면 구글에서 뺀다
  if (!isNarrowUnaeoIdentityTopic(post)) return true

  // 4) 주제가 맞아도 읽을 분량이거나 운영자가 메타를 손본 글만 남긴다
  if (post.seoTitle && post.seoDescription) return false
  return plainText(post.content).length < MIN_TEXT_LENGTH
}
