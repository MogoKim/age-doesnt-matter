/**
 * 인생 2막 주제 허브(/topic/second-act) 큐레이션 — read-only.
 *
 * 배경: 재취업·은퇴 자산은 매거진 55건 + 커뮤니티(B3 통과분) 208건이 이미 쌓여 있는데
 * 흩어져 있다. GSC 28일 실측(2026-07-26)에서 `쿠팡 알바 60대`·`40대 재취업 후기`가
 * 18위, `40대 커뮤니티`가 13.5위로 이미 걸려 있고 `/guide/50대-쿠팡알바-재취업-현실`은
 * 12.5위에서 클릭까지 만들고 있다. 이 허브는 그 자산을 검색 의도 다섯 갈래로 묶는다.
 *
 * 원칙:
 *   - DB read만 한다(write·raw SQL 없음).
 *   - 게시글 원문을 복제하지 않는다 — 제목 + 짧은 발췌 + 링크만(중복 콘텐츠 회피).
 *   - 한 글은 한 섹션에만 배치한다.
 *   - **개별 채용공고(/jobs/{cuid})는 연결하지 않는다** — slug가 없고(전 273건) 만료일
 *     데이터도 없어(JobDetail 0건) 시간이 지나면 죽은 공고를 가리키게 된다.
 *     대신 지역 랜딩(/jobs/region/{시도})만 연결한다.
 *   - Google noindex 대상 글(PR-B3 미통과)은 앵커로 쓰지 않는다.
 */
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { stripHtmlTags } from '@/lib/sanitize'
import { shouldGoogleNoindexCommunityPost } from '@/lib/seo/community-google-noindex'
import { JOB_SIDO_LIST } from '@/lib/jobs-regions'
import { GUIDES } from '@/lib/guides'

/** 재취업·은퇴 축에 해당하는 글을 1차로 거르는 제목 키워드 */
const SECOND_ACT_KEYWORDS = [
  '재취업', '취업', '일자리', '알바', '아르바이트', '구직', '이력서', '면접', '자격증', '부업',
  '쿠팡', '청소', '돌봄', '요양보호사', '간병', '미화', '경비', '택배', '배달', '노인일자리',
  '은퇴', '퇴직', '퇴직금', '연금', '국민연금', '노후', '건강보험', '건보료', '보험료',
  'IRP', '연금저축', 'ISA', '세금', '재테크', '투자', '생활비', '절약', '명퇴', '희망퇴직',
  '인생2막', '인생 2막', '제2의', '빈둥지', '외로움', '취미', '봉사', '창업', '귀농',
] as const

export interface SecondActSection {
  id: string
  title: string
  heading: string
  description: string
  /** 이 섹션에 배치할 글을 고르는 제목 키워드 */
  keywords: readonly string[]
}

/**
 * 화면에 보이는 순서. 재취업 준비 → 실제 직종 → 제도 → 돈 → 남은 시간 순으로,
 * 퇴직을 앞둔 사람이 실제로 부딪히는 순서를 따랐다.
 */
export const SECOND_ACT_SECTIONS = [
  {
    id: 'reemployment',
    title: '50대 재취업, 현실은 이렇습니다',
    heading: '다시 일하려고 마음먹었을 때 가장 먼저 부딪히는 것',
    description:
      '나이 때문에 서류에서 걸린다는 말, 자격증을 따면 달라진다는 말이 함께 돕니다. '
      + '먼저 겪은 우리 또래가 이력서를 어떻게 고쳤고 어떤 자격증이 실제로 쓰였는지, '
      + '그리고 어디까지가 현실이었는지 모았습니다.',
    keywords: ['이력서', '면접', '자격증', '재취업', '취업', '구직', '채용'],
  },
  {
    id: 'real-work',
    title: '우리 또래가 실제로 하는 일',
    heading: '쿠팡·청소·돌봄·배달 — 직접 해본 사람들의 이야기',
    description:
      '조건표만 봐서는 알 수 없는 것들이 있습니다. 하루가 얼마나 고된지, 몸은 버티는지, '
      + '얼마나 오래 할 수 있는지. 실제로 그 일을 하고 있는 50대 60대가 남긴 후기와 '
      + '지역별로 올라오는 일자리를 함께 봤습니다.',
    keywords: [
      '알바', '아르바이트', '쿠팡', '배달', '청소', '미화', '경비', '요양보호사',
      '돌봄', '간병', '카페', '택배', '노인일자리', '파트타임', '부업',
    ],
  },
  {
    id: 'pension',
    title: '퇴직금·연금·건강보험',
    heading: '퇴직하는 순간 한꺼번에 결정해야 하는 것들',
    description:
      '퇴직금을 IRP로 받을지, 국민연금을 언제부터 받을지, 직장가입자에서 빠지면 건강보험료가 '
      + '얼마나 되는지 — 며칠 사이에 답해야 하는 질문들입니다. 제도는 자주 바뀌고 개인 상황에 '
      + '따라 유불리가 갈리니, 여기 글은 방향을 잡는 용도로 보시고 결정 전에는 반드시 '
      + '공단·금융기관에 직접 확인하세요.',
    // '세금' 단독은 넣지 않는다 — "이런 세금은 없어져야" 같은 잡담 글이 딸려 들어온다
    keywords: [
      '퇴직금', '연금', 'IRP', 'ISA', '국민연금', '연금저축', '건강보험', '건보료',
      '보험료', '노란우산', '공제회', '상속세', '종부세', '연말정산',
    ],
  },
  {
    id: 'living-cost',
    title: '은퇴 후 돈은 얼마나 드나',
    heading: '한 달에 얼마면 되는지, 먼저 겪은 사람들의 셈',
    description:
      '연금이 나오는데도 빠듯하다는 이야기가 많습니다. 사는 지역과 주거 형태, 의료비에 따라 '
      + '차이가 크기 때문입니다. 은퇴 첫 해를 지나온 우리 또래가 실제로 얼마를 썼고 어디서 '
      + '줄였는지 정리했습니다.',
    keywords: ['생활비', '생활자금', '주거', '노후', '물가', '절약', '재테크', '투자', '은퇴', '퇴직', '명퇴', '희망퇴직'],
  },
  {
    id: 'after-work',
    title: '일 말고 남은 시간',
    heading: '일을 놓은 다음의 하루를 어떻게 채울까',
    description:
      '돈 문제가 정리돼도 남는 것이 있습니다. 매일 나가던 곳이 사라지고, 사람 만날 일이 줄고, '
      + '집에 있는 시간이 갑자기 길어집니다. 인생 2막의 시간을 다시 짜본 사람들의 이야기입니다.',
    keywords: [
      '취미', '외로움', '빈둥지', '관계', '봉사', '친구', '우울', '지루', '허전',
      '인생2막', '인생 2막', '제2의', '창업', '귀농',
    ],
  },
] as const satisfies readonly SecondActSection[]

/**
 * 매칭 순서 — 표시 순서와 다르다.
 * 구체적인 직종·제도어를 먼저 잡아야 "은퇴"처럼 넓은 단어에 다 빨려 들어가지 않는다.
 * (living-cost가 사실상 fallback 역할이라 맨 뒤)
 */
const MATCH_ORDER = ['real-work', 'pension', 'reemployment', 'after-work', 'living-cost'] as const

export interface HubLink {
  title: string
  href: string
  excerpt: string
  commentCount?: number
}

export interface ResolvedSection {
  id: string
  title: string
  heading: string
  description: string
  magazine: HubLink[]
  community: HubLink[]
  /** 섹션 1에만 붙는 가이드 앵커 */
  guides: HubLink[]
  /** 섹션 2에만 붙는 지역 랜딩 */
  regions: readonly string[]
}

const MAX_MAGAZINE = 4
const MAX_COMMUNITY = 5
const EXCERPT_LENGTH = 90

/** 섹션 1 최상단 앵커 — GSC 28일 기준 노출 14·클릭 1·평균 12.5위로 이미 작동 중인 가이드 */
const PRIMARY_GUIDE_SLUG = '50대-쿠팡알바-재취업-현실'
/** 생활비 감각에 직접 도움이 되는 보조 가이드 */
const COST_GUIDE_SLUGS = ['장보기-물가-줄이는법', '50대-살기좋은지역-고르는법'] as const

function toPlainText(content: string | null): string {
  return stripHtmlTags(content ?? '')
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

function isSecondActTopic(title: string): boolean {
  return SECOND_ACT_KEYWORDS.some((keyword) => title.includes(keyword))
}

/**
 * T2 앵커 정렬용 — 우나어 정체성이 강하게 드러나는 어휘.
 * 이 목록은 **색인 여부를 바꾸지 않는다**(색인 판정은 E0 단일 함수가 전담).
 */
const T2_STRONG_TOPICS = [
  '갱년기', '폐경', '완경', '병원', '수술', '검사', '간병', '돌봄', '부모님', '친정', '시댁',
  '자녀', '아들', '딸', '남편', '부부', '이혼', '은퇴', '퇴직', '재취업', '연금', '노후',
  '생활비', '외로움', '상속', '건강보험', '보험료', '자격증',
] as const

/**
 * T2 앵커 정렬용 — 허브 대표 링크로 어울리지 않는 성격(광고·종목·먹거리 소식 등).
 * **차단이 아니라 감점만** 한다. 오탐이 있는 목록이라 단독으로 글을 떨어뜨리지 않고,
 * 길이·주제 점수가 충분하면 그대로 남는다.
 */
const T2_PENALTY_TITLE_PATTERNS = [
  '구독', '할인', '이벤트', '증정', '쿠폰', '특가', '[LG', '[삼성', '복기',
  '하이닉스', '삼성전자', '삼전', '닉스', '종목', '매수', '매도', '코스피', '나스닥',
  'ETF', '수급', '차트', '애널', '주가', '맛집', '대방출', '먹방', 'jpg', '근황',
  '기자회견', '드라마', '연예', '방송',
] as const

/**
 * 허브 앵커 우선순위 점수(T2).
 *
 * 기존 정렬은 `viewCount desc` 단일 기준이라, E0로 후보가 넓어지면 **조회수만 높은 짧은 글이
 * 긴 정보성 글을 밀어냈다**(시뮬레이션에서 25개 중 18개 교체·평균 1,424자 → 816자).
 * 길이와 주제 적합성을 함께 보고, 조회수는 log로 눌러 동점 판정에만 쓴다.
 *
 *   주제 강매칭 +2 / 800자↑ +3 · 500자↑ +2 · 300자↑ +1 · 300자↓ −2 / 감점 패턴 −3 / +log10(조회수+1)
 */
function anchorScore(input: { title: string; text: string; viewCount: number }): number {
  const haystack = `${input.title} ${input.text}`
  let score = 0
  if (T2_STRONG_TOPICS.some((keyword) => haystack.includes(keyword))) score += 2

  const length = input.text.length
  if (length >= 800) score += 3
  else if (length >= 500) score += 2
  else if (length >= 300) score += 1
  else score -= 2

  if (T2_PENALTY_TITLE_PATTERNS.some((pattern) => input.title.includes(pattern))) score -= 3

  return score + Math.log10(input.viewCount + 1)
}

/** 특이도 높은 섹션부터 매칭 — 첫 매칭 섹션에만 넣는다 */
function matchSectionId(title: string): string | null {
  for (const sectionId of MATCH_ORDER) {
    const section = SECOND_ACT_SECTIONS.find((s) => s.id === sectionId)
    if (section?.keywords.some((keyword) => title.includes(keyword))) return section.id
  }
  return null
}

function guideLink(slug: string): HubLink | null {
  const guide = GUIDES[slug]
  if (!guide) return null
  return {
    title: guide.breadcrumbLabel,
    href: `/guide/${guide.slug}`,
    excerpt: toExcerpt(guide.description),
  }
}

const getSecondActSources = unstable_cache(
  async () => {
    const [magazine, community] = await Promise.all([
      // 매거진은 본문을 읽지 않는다 — 제목으로 주제를 가리고 발췌는 seoDescription을 쓴다
      prisma.post.findMany({
        where: { boardType: 'MAGAZINE', status: { in: ['PUBLISHED', 'SEO_ONLY'] }, slug: { not: null } },
        select: { slug: true, title: true, seoDescription: true, viewCount: true },
        orderBy: { viewCount: 'desc' },
      }),
      prisma.post.findMany({
        where: {
          boardType: { in: ['LIFE2', 'STORY'] },
          status: { in: ['PUBLISHED', 'SEO_ONLY'] },
          slug: { not: null },
          category: { notIn: ['가입인사', '이벤트'] },
        },
        select: {
          slug: true, title: true, content: true, commentCount: true,
          boardType: true, viewCount: true,
          // E0 색인 판정 + T2 앵커 정렬의 입력 (seoTitle/seoDescription은 E0에서 기준으로 쓰지 않는다)
          source: true,
        },
        orderBy: { viewCount: 'desc' },
      }),
    ])
    return { magazine, community }
  },
  ['topic-second-act-sources'],
  { revalidate: 3600, tags: ['topic-second-act'] },
)

const BOARD_SLUG: Record<string, string> = { LIFE2: 'life2', STORY: 'stories' }

/**
 * 허브 섹션 5개를 채워 돌려준다. 링크가 하나도 없는 섹션은 제외한다(얇은 페이지 신호 회피).
 */
export async function getSecondActSections(): Promise<ResolvedSection[]> {
  const { magazine, community } = await getSecondActSources()

  const buckets = new Map<string, { magazine: HubLink[]; community: HubLink[] }>(
    SECOND_ACT_SECTIONS.map((section) => [section.id, { magazine: [], community: [] }]),
  )

  for (const post of magazine) {
    if (!post.slug || !isSecondActTopic(post.title)) continue
    const sectionId = matchSectionId(post.title)
    if (!sectionId) continue
    const bucket = buckets.get(sectionId)
    if (!bucket || bucket.magazine.length >= MAX_MAGAZINE) continue
    bucket.magazine.push({
      title: post.title,
      href: `/magazine/${post.slug}`,
      excerpt: toExcerpt(post.seoDescription ?? ''),
    })
  }

  // 앵커 후보를 먼저 모은다 — 색인 자격(E0)과 배치 우선순위(T2)는 별개 단계다.
  const candidates: { sectionId: string; link: HubLink; score: number }[] = []
  for (const post of community) {
    if (!post.slug || !isSecondActTopic(post.title)) continue
    // Google 색인을 유지한 글만 앵커로 쓴다 — 판정은 E0 단일 함수가 전담한다
    const noindexed = shouldGoogleNoindexCommunityPost({
      boardType: post.boardType,
      title: post.title,
      content: post.content,
      source: post.source,
    })
    if (noindexed) continue
    const sectionId = matchSectionId(post.title)
    if (!sectionId) continue
    const boardSlug = BOARD_SLUG[post.boardType]
    if (!boardSlug) continue
    const text = toPlainText(post.content)
    candidates.push({
      sectionId,
      score: anchorScore({ title: post.title, text, viewCount: post.viewCount }),
      link: {
        title: post.title,
        href: `/community/${boardSlug}/${post.slug}`,
        excerpt: toExcerpt(text),
        commentCount: post.commentCount,
      },
    })
  }

  // 점수 높은 순으로 섹션을 채운다(T2). 동점이면 원래 조회수 정렬 순서가 유지된다.
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    const bucket = buckets.get(candidate.sectionId)
    if (!bucket || bucket.community.length >= MAX_COMMUNITY) continue
    bucket.community.push(candidate.link)
  }

  return SECOND_ACT_SECTIONS.map((section) => {
    const bucket = buckets.get(section.id)
    const guides =
      section.id === 'reemployment'
        ? [guideLink(PRIMARY_GUIDE_SLUG)].filter((g): g is HubLink => g !== null)
        : section.id === 'living-cost'
          ? COST_GUIDE_SLUGS.map(guideLink).filter((g): g is HubLink => g !== null)
          : []
    return {
      id: section.id,
      title: section.title,
      heading: section.heading,
      description: section.description,
      magazine: bucket?.magazine ?? [],
      community: bucket?.community ?? [],
      guides,
      regions: section.id === 'real-work' ? JOB_SIDO_LIST : [],
    }
  }).filter(
    (section) =>
      section.magazine.length > 0
      || section.community.length > 0
      || section.guides.length > 0
      || section.regions.length > 0,
  )
}
