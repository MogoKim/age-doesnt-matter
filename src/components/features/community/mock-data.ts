import type { PostSummary, PostDetail, CommentItem, UserSummary } from '@/types/api'

/* ── 게시판 설정 ── */

export interface BoardConfig {
  slug: string
  boardType: string
  displayName: string
  description: string
  categories: string[]
}

export const BOARD_CONFIGS: Record<string, BoardConfig> = {
  stories: {
    slug: 'stories',
    boardType: 'STORIES',
    displayName: '사는이야기',
    description: '일상을 나누는 공간',
    categories: ['전체', '일상', '건강', '고민', '자녀', '기타'],
  },
  humor: {
    slug: 'humor',
    boardType: 'HUMOR',
    displayName: '활력충전소',
    description: '웃음과 힐링이 있는 곳',
    categories: ['전체', '유머', '힐링', '자랑', '추천', '기타'],
  },
  weekly: {
    slug: 'weekly',
    boardType: 'WEEKLY',
    displayName: '수다방',
    description: '가벼운 수다와 토론',
    categories: ['전체'],
  },
}

/* ── Mock 작성자 ── */

const MOCK_AUTHORS: UserSummary[] = [
  { id: 'u1', nickname: '행복한순자', grade: 'REGULAR', gradeEmoji: '🌿', profileImage: null },
  { id: 'u2', nickname: '영희맘', grade: 'SPROUT', gradeEmoji: '🌱', profileImage: null },
  { id: 'u3', nickname: '건강하자', grade: 'VETERAN', gradeEmoji: '💎', profileImage: null },
  { id: 'u4', nickname: '동네이장님', grade: 'WARM_NEIGHBOR', gradeEmoji: '☀️', profileImage: null },
  { id: 'u5', nickname: '산책매니아', grade: 'REGULAR', gradeEmoji: '🌿', profileImage: null },
  { id: 'u6', nickname: '텃밭농부', grade: 'SPROUT', gradeEmoji: '🌱', profileImage: null },
  { id: 'u7', nickname: '여행좋아', grade: 'REGULAR', gradeEmoji: '🌿', profileImage: null },
]

/* ── Mock 게시글 (사는이야기) ── */

export const MOCK_STORIES_POSTS: PostSummary[] = [
  {
    id: 's1', boardType: 'STORIES', category: '일상', title: '오늘 손주 돌잔치에 다녀왔어요 ㅎㅎ',
    preview: '기다리고 기다리던 손주 돌잔치! 표정이 얼마나 귀여운지 사진 공유해요.',
    thumbnailUrl: null, author: MOCK_AUTHORS[0], likeCount: 24, commentCount: 8, viewCount: 156,
    promotionLevel: 'HOT', createdAt: '2026-03-19T10:30:00Z',
  },
  {
    id: 's2', boardType: 'STORIES', category: '건강', title: '무릎 관절에 좋은 운동 추천해요',
    preview: '정형외과 선생님이 알려주신 무릎 관절에 좋은 운동 3가지 공유합니다.',
    thumbnailUrl: null, author: MOCK_AUTHORS[2], likeCount: 42, commentCount: 15, viewCount: 320,
    promotionLevel: 'HOT', createdAt: '2026-03-19T09:15:00Z',
  },
  {
    id: 's3', boardType: 'STORIES', category: '고민', title: '퇴직 후 뭘 해야 할지 모르겠어요',
    preview: '30년 다니던 회사를 그만두고 나니 뭘 해야 할지... 비슷한 경험 있으신 분?',
    thumbnailUrl: null, author: MOCK_AUTHORS[4], likeCount: 18, commentCount: 22, viewCount: 245,
    promotionLevel: 'NORMAL', createdAt: '2026-03-19T08:00:00Z',
  },
  {
    id: 's4', boardType: 'STORIES', category: '자녀', title: '아들이 결혼한다고 하네요',
    preview: '드디어! 내년 봄에 결혼한다고 합니다. 기쁘기도 하고 서운하기도 하고...',
    thumbnailUrl: null, author: MOCK_AUTHORS[1], likeCount: 35, commentCount: 12, viewCount: 198,
    promotionLevel: 'NORMAL', createdAt: '2026-03-18T16:30:00Z',
  },
  {
    id: 's5', boardType: 'STORIES', category: '일상', title: '텃밭에서 딸기가 열렸어요',
    preview: '작년에 심어둔 딸기가 올해 드디어 열매를 맺었습니다! 빨갛게 익어가고 있어요.',
    thumbnailUrl: null, author: MOCK_AUTHORS[5], likeCount: 28, commentCount: 6, viewCount: 132,
    promotionLevel: 'NORMAL', createdAt: '2026-03-18T14:00:00Z',
  },
  {
    id: 's6', boardType: 'STORIES', category: '건강', title: '아침 산책 시작했더니 잠이 잘 와요',
    preview: '불면증이 심했는데 매일 아침 30분 걷기 시작한 지 2주 만에 효과가 나타나네요.',
    thumbnailUrl: null, author: MOCK_AUTHORS[6], likeCount: 15, commentCount: 9, viewCount: 178,
    promotionLevel: 'NORMAL', createdAt: '2026-03-18T11:00:00Z',
  },
  {
    id: 's7', boardType: 'STORIES', category: '일상', title: '오랜만에 부부 영화 데이트',
    preview: '결혼 30년 만에 처음으로 같이 영화관 갔어요. 옛날 생각도 나고 좋았습니다.',
    thumbnailUrl: null, author: MOCK_AUTHORS[3], likeCount: 52, commentCount: 18, viewCount: 410,
    promotionLevel: 'HOT', createdAt: '2026-03-18T08:30:00Z',
  },
  {
    id: 's8', boardType: 'STORIES', category: '기타', title: '스마트폰 사용법 배우고 있어요',
    preview: '주민센터에서 하는 스마트폰 교실 다니고 있는데 재미있네요!',
    thumbnailUrl: null, author: MOCK_AUTHORS[1], likeCount: 10, commentCount: 5, viewCount: 88,
    promotionLevel: 'NORMAL', createdAt: '2026-03-17T15:00:00Z',
  },
]

/* ── Mock 게시글 (활력충전소) ── */

export const MOCK_HUMOR_POSTS: PostSummary[] = [
  {
    id: 'h1', boardType: 'HUMOR', category: '유머', title: '마트에서 생긴 웃긴 일 ㅋㅋ',
    preview: '오늘 마트에서 계산대 줄 서 있는데 앞에 아주머니가...',
    thumbnailUrl: null, author: MOCK_AUTHORS[3], likeCount: 67, commentCount: 23, viewCount: 520,
    promotionLevel: 'HOT', createdAt: '2026-03-19T11:00:00Z',
  },
  {
    id: 'h2', boardType: 'HUMOR', category: '힐링', title: '우리 집 고양이 자는 모습이 너무 귀여워요',
    preview: '배 깔고 뒤집어져서 자는데 세상 편해 보여요 ㅎㅎ',
    thumbnailUrl: null, author: MOCK_AUTHORS[0], likeCount: 45, commentCount: 11, viewCount: 340,
    promotionLevel: 'NORMAL', createdAt: '2026-03-19T09:30:00Z',
  },
  {
    id: 'h3', boardType: 'HUMOR', category: '자랑', title: '60세에 마라톤 완주했습니다!',
    preview: '3년 전부터 준비한 풀코스 마라톤, 드디어 해냈어요!',
    thumbnailUrl: null, author: MOCK_AUTHORS[2], likeCount: 89, commentCount: 32, viewCount: 780,
    promotionLevel: 'HOT', createdAt: '2026-03-19T07:00:00Z',
  },
  {
    id: 'h4', boardType: 'HUMOR', category: '추천', title: '요즘 재밌는 TV 프로그램 추천해요',
    preview: '주말에 볼만한 예능 프로그램 정리해봤어요. 하나같이 재미있어요!',
    thumbnailUrl: null, author: MOCK_AUTHORS[6], likeCount: 22, commentCount: 14, viewCount: 215,
    promotionLevel: 'NORMAL', createdAt: '2026-03-18T20:00:00Z',
  },
  {
    id: 'h5', boardType: 'HUMOR', category: '유머', title: '손주가 할머니를 그렸는데... ㅋㅋ',
    preview: '유치원에서 할머니를 그려왔는데 너무 웃겨서 올려봅니다.',
    thumbnailUrl: null, author: MOCK_AUTHORS[1], likeCount: 55, commentCount: 19, viewCount: 450,
    promotionLevel: 'HOT', createdAt: '2026-03-18T16:00:00Z',
  },
  {
    id: 'h6', boardType: 'HUMOR', category: '힐링', title: '벚꽃이 피기 시작했어요',
    preview: '동네 공원에 벚꽃이 하나둘 피기 시작합니다. 봄이 왔네요!',
    thumbnailUrl: null, author: MOCK_AUTHORS[4], likeCount: 31, commentCount: 7, viewCount: 190,
    promotionLevel: 'NORMAL', createdAt: '2026-03-18T13:00:00Z',
  },
]

/* ── Mock 게시글 (수다방) ── */

export const MOCK_WEEKLY_POSTS: PostSummary[] = [
  {
    id: 'w1', boardType: 'STORIES', category: '', title: '[이번 주 토론] 손주에게 용돈 얼마가 적당할까요?',
    preview: '초등학생 손주에게 설날 용돈으로 얼마를 주시나요?',
    thumbnailUrl: null, author: MOCK_AUTHORS[3], likeCount: 34, commentCount: 45, viewCount: 680,
    promotionLevel: 'HOT', createdAt: '2026-03-19T06:00:00Z',
  },
  {
    id: 'w2', boardType: 'STORIES', category: '', title: '요즘 물가 너무 올랐죠?',
    preview: '마트 가면 한숨이 나와요... 다들 장보실 때 어떻게 절약하세요?',
    thumbnailUrl: null, author: MOCK_AUTHORS[5], likeCount: 28, commentCount: 38, viewCount: 520,
    promotionLevel: 'NORMAL', createdAt: '2026-03-18T12:00:00Z',
  },
  {
    id: 'w3', boardType: 'STORIES', category: '', title: '은퇴 후 가장 좋은 취미 활동은?',
    preview: '등산, 낚시, 텃밭, 독서, 운동... 다들 뭘 하시나요?',
    thumbnailUrl: null, author: MOCK_AUTHORS[6], likeCount: 19, commentCount: 27, viewCount: 340,
    promotionLevel: 'NORMAL', createdAt: '2026-03-17T10:00:00Z',
  },
]

/* ── 게시판별 Mock 데이터 매핑 ── */

export function getMockPosts(boardSlug: string): PostSummary[] {
  switch (boardSlug) {
    case 'stories': return MOCK_STORIES_POSTS
    case 'humor': return MOCK_HUMOR_POSTS
    case 'weekly': return MOCK_WEEKLY_POSTS
    default: return []
  }
}

/* ── Mock 게시글 상세 ── */

export function getMockPostDetail(postId: string): PostDetail | null {
  const allPosts = [...MOCK_STORIES_POSTS, ...MOCK_HUMOR_POSTS, ...MOCK_WEEKLY_POSTS]
  const summary = allPosts.find(p => p.id === postId)
  if (!summary) return null

  return {
    ...summary,
    content: `<p>${summary.preview}</p><p>이것은 Mock 데이터로 생성된 상세 내용입니다. 실제 서비스에서는 사용자가 작성한 본문이 여기에 표시됩니다.</p><p>우리 나이가 어때서! 나이에 상관없이 자유롭게 이야기를 나눠보세요. 서로의 경험과 지혜를 공유하면 더 풍요로운 하루가 됩니다.</p>`,
    imageUrls: [],
    youtubeUrl: null,
    isLiked: false,
    isScrapped: false,
    updatedAt: summary.createdAt,
  }
}

/* ── Mock 댓글 ── */

export function getMockComments(postId: string): CommentItem[] {
  // postId에 상관없이 동일한 Mock 댓글 반환
  void postId
  return [
    {
      id: 'c1',
      content: '좋은 글이네요! 공감합니다 ^^',
      author: MOCK_AUTHORS[1],
      likeCount: 5,
      isLiked: false,
      isDeleted: false,
      createdAt: '2026-03-19T11:00:00Z',
      replies: [
        {
          id: 'c1r1',
          content: '저도 공감해요~ 힘내세요!',
          author: MOCK_AUTHORS[4],
          likeCount: 2,
          isLiked: false,
          isDeleted: false,
          createdAt: '2026-03-19T11:30:00Z',
          replies: [],
        },
      ],
    },
    {
      id: 'c2',
      content: '비슷한 경험이 있어서 더 와닿네요. 저도 요즘 비슷한 고민을 하고 있었거든요.',
      author: MOCK_AUTHORS[2],
      likeCount: 8,
      isLiked: false,
      isDeleted: false,
      createdAt: '2026-03-19T10:00:00Z',
      replies: [],
    },
    {
      id: 'c3',
      content: '',
      author: null,
      likeCount: 0,
      isLiked: false,
      isDeleted: true,
      createdAt: '2026-03-19T09:30:00Z',
      replies: [
        {
          id: 'c3r1',
          content: '원래 댓글이 삭제되었지만 대댓글은 남아있습니다.',
          author: MOCK_AUTHORS[5],
          likeCount: 1,
          isLiked: false,
          isDeleted: false,
          createdAt: '2026-03-19T09:45:00Z',
          replies: [],
        },
      ],
    },
    {
      id: 'c4',
      content: '유익한 정보 감사합니다! 주변에도 공유할게요.',
      author: MOCK_AUTHORS[6],
      likeCount: 3,
      isLiked: false,
      isDeleted: false,
      createdAt: '2026-03-19T08:00:00Z',
      replies: [],
    },
  ]
}
