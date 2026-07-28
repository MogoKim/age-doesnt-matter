/**
 * 갱년기 주제 허브(/topic/menopause) 큐레이션 — read-only.
 *
 * 배경: 갱년기 자산은 이미 매거진 43건 + 갱년기톡 51건이 있는데, GSC 90일 기준
 * 갱년기축 쿼리 노출이 10회·클릭 0이다(2026-07-28 실측). 글이 부족한 게 아니라
 * 흩어져 있어 주제 권위 신호가 만들어지지 않는 상태다. 이 허브는 흩어진 자산을
 * 네 개의 검색 의도 축으로 묶어 내부링크를 모으는 역할을 한다.
 *
 * 원칙:
 *   - DB read만 한다(write·raw SQL 없음).
 *   - 게시글 원문을 복제하지 않는다 — 제목 + 짧은 발췌 + 링크만 쓴다(중복 콘텐츠 회피).
 *   - 한 글은 한 섹션에만 배치한다(섹션 간 중복 링크 방지).
 */
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { stripHtmlTags } from '@/lib/sanitize'

/** 매거진에서 갱년기 글을 고르는 제목 키워드 */
const MAGAZINE_TOPIC_KEYWORDS = [
  '갱년기', '폐경', '완경', '호르몬', '안면홍조', '상열', '식은땀', '골다공증', '여성호르몬',
] as const

/**
 * 섹션 정의. `keywords` 특이도가 높은 순서대로 배열한다 —
 * 앞 섹션부터 매칭해 한 글이 한 곳에만 들어가게 한다.
 * (예: "산부인과 추천 - 갱년기, 폐경"은 '폐경'보다 '산부인과'가 검색 의도에 가깝다.)
 */
export const MENOPAUSE_SECTIONS = [
  {
    id: 'care',
    title: '병원·치료 선택',
    heading: '병원에 갈지, 호르몬 치료를 받을지 고민될 때',
    description:
      '산부인과를 언제 가야 하는지, 호르몬 치료나 영양제를 시작해도 되는지는 우리 또래가 가장 많이 묻는 질문입니다. '
      + '치료를 결정하는 것은 의료진의 몫이지만, 먼저 겪은 사람들이 무엇을 물어보고 어떻게 선택했는지 알면 진료실에서 할 말이 정리됩니다.',
    keywords: [
      '산부인과', '병원', '진료', '검진', '검사', '호르몬치료', '호르몬 치료', '호르몬제',
      '미레나', '처방', '영양제', '유산균', '치료제', '호르몬 요법',
    ],
  },
  {
    id: 'emotion',
    title: '감정과 관계',
    heading: '감정이 널뛰고, 가까운 사람과 자꾸 부딪힐 때',
    description:
      '이유 없이 눈물이 나거나 사소한 일에 화가 치미는 것은 갱년기에 아주 흔한 변화입니다. '
      + '문제는 그 감정이 남편·자녀·시댁과의 관계로 번진다는 점입니다. 같은 시기를 지나는 50대 60대가 '
      + '가족과 어떻게 지냈는지, 무엇을 말하고 무엇을 참았는지 모았습니다.',
    keywords: [
      '우울', '불안', '짜증', '예민', '감정', '눈물', '서럽', '화가', '기분', '벅차', '사춘기',
      '남편', '부부', '시어머니', '시댁', '며느리', '자녀', '아들', '딸', '싸우',
    ],
  },
  {
    id: 'body',
    title: '몸의 변화',
    heading: '얼굴이 화끈거리고, 잠을 못 자고, 살이 붙을 때',
    description:
      '안면홍조와 식은땀, 새벽에 깨는 불면, 관절 통증, 갑자기 늘어난 뱃살 — 갱년기의 몸은 여러 곳에서 동시에 신호를 보냅니다. '
      + '증상마다 지나가는 시기와 대처법이 다르기 때문에, 우리 또래가 실제로 겪은 순서와 기간을 아는 것이 도움이 됩니다.',
    keywords: [
      '홍조', '열감', '상열', '화끈', '식은땀', '더운', '더워', '에어컨',
      '불면', '잠을', '잠이', '못자', '수면', '졸리', '새벽',
      '관절', '골다공증', '무릎', '어깨', '손가락', '통증', '근육',
      '체중', '살이', '살 찌', '살찌', '뱃살', '복부', '다이어트', '배나옴', '몸무게',
      '질건조', '유두', '어지럼', '이명', '탈모', '피부', '몸이', '몸 신호', '몸의 변화',
    ],
  },
  {
    id: 'transition',
    title: '폐경·완경',
    heading: '언제부터 갱년기이고, 언제 끝나는 걸까',
    description:
      '생리가 불규칙해지는 이행기부터 완경까지는 사람마다 몇 년씩 차이가 납니다. '
      + '내가 지금 어디쯤 왔는지, 앞으로 무엇이 남았는지 가늠하는 것만으로도 불안이 줄어듭니다. '
      + '완경을 먼저 지난 우리 또래의 기록을 모았습니다.',
    keywords: [
      '폐경', '완경', '생리', '월경', '초경', '이행기', '언제', '나이', '끝나', '몇 살', '몇살',
    ],
  },
] as const

export type MenopauseSectionId = (typeof MENOPAUSE_SECTIONS)[number]['id']

export interface HubLink {
  /** 앵커 텍스트 = 글 제목(검색 의도 그대로) */
  title: string
  href: string
  /** 원문 복제가 아닌 짧은 발췌 */
  excerpt: string
  /** 커뮤니티 글에만 표시 */
  commentCount?: number
}

export interface HubSection {
  id: MenopauseSectionId
  title: string
  heading: string
  description: string
  magazine: HubLink[]
  community: HubLink[]
}

const MAX_MAGAZINE_PER_SECTION = 4
const MAX_COMMUNITY_PER_SECTION = 5
const EXCERPT_LENGTH = 90

function toPlainText(html: string | null): string {
  return stripHtmlTags(html ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toExcerpt(source: string): string {
  const text = source.trim()
  if (text.length <= EXCERPT_LENGTH) return text
  return `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`
}

/** 특이도 높은 섹션부터 매칭 — 첫 매칭 섹션에만 넣는다 */
function matchSectionId(haystack: string): MenopauseSectionId | null {
  for (const section of MENOPAUSE_SECTIONS) {
    if (section.keywords.some((keyword) => haystack.includes(keyword))) return section.id
  }
  return null
}

const getHubSourceRows = unstable_cache(
  async () => {
    const [magazine, community] = await Promise.all([
      // 매거진은 본문을 읽지 않는다 — 제목으로 주제를 가리고 발췌는 seoDescription을 쓴다(페이로드 절감)
      prisma.post.findMany({
        where: { boardType: 'MAGAZINE', status: { in: ['PUBLISHED', 'SEO_ONLY'] }, slug: { not: null } },
        select: { slug: true, title: true, seoDescription: true, viewCount: true },
        orderBy: { viewCount: 'desc' },
      }),
      prisma.post.findMany({
        where: { boardType: 'MENOPAUSE', status: { in: ['PUBLISHED', 'SEO_ONLY'] }, slug: { not: null } },
        select: { slug: true, title: true, content: true, commentCount: true },
        orderBy: { commentCount: 'desc' },
      }),
    ])
    return { magazine, community }
  },
  ['topic-menopause-sources'],
  { revalidate: 3600, tags: ['topic-menopause'] },
)

/**
 * 허브 섹션 4개를 채워 돌려준다. 링크가 하나도 없는 섹션은 해설만 남기지 않고 제외한다
 * (빈 섹션은 얇은 페이지 신호가 된다).
 */
export async function getMenopauseHubSections(): Promise<HubSection[]> {
  const { magazine, community } = await getHubSourceRows()

  const magazineTopical = magazine.filter((post) =>
    MAGAZINE_TOPIC_KEYWORDS.some((keyword) => post.title.includes(keyword)),
  )

  const buckets = new Map<MenopauseSectionId, { magazine: HubLink[]; community: HubLink[] }>(
    MENOPAUSE_SECTIONS.map((section) => [section.id, { magazine: [], community: [] }]),
  )

  for (const post of magazineTopical) {
    const sectionId = matchSectionId(post.title)
    if (!sectionId || !post.slug) continue
    const bucket = buckets.get(sectionId)
    if (!bucket || bucket.magazine.length >= MAX_MAGAZINE_PER_SECTION) continue
    bucket.magazine.push({
      title: post.title,
      href: `/magazine/${post.slug}`,
      excerpt: toExcerpt(post.seoDescription ?? ''),
    })
  }

  for (const post of community) {
    if (!post.slug) continue
    // 제목으로만 분류한다. 본문까지 보면 "관절통이 심한데…" 글이 본문의 '감정' 한 단어 때문에
    // 엉뚱한 섹션으로 가고, 주제어가 스쳐 지나가는 잡담·공지성 글까지 딸려 들어온다.
    const sectionId = matchSectionId(post.title)
    if (!sectionId) continue
    const bucket = buckets.get(sectionId)
    if (!bucket || bucket.community.length >= MAX_COMMUNITY_PER_SECTION) continue
    bucket.community.push({
      title: post.title,
      href: `/community/menopause/${post.slug}`,
      excerpt: toExcerpt(toPlainText(post.content)),
      commentCount: post.commentCount,
    })
  }

  return MENOPAUSE_SECTIONS.map((section) => {
    const bucket = buckets.get(section.id)
    return {
      id: section.id,
      title: section.title,
      heading: section.heading,
      description: section.description,
      magazine: bucket?.magazine ?? [],
      community: bucket?.community ?? [],
    }
  }).filter((section) => section.magazine.length > 0 || section.community.length > 0)
}
