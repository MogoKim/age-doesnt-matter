import type { CafeConfig, ContentCategory } from './types.js'

// ── 외부 사이트 크롤링 설정 (네이버 카페 외) ──

export interface ExternalSiteConfig {
  id: string
  name: string
  url: string
  /** 크롤링할 게시판 경로 */
  boards: ExternalBoardConfig[]
}

export interface ExternalBoardConfig {
  name: string
  /** 게시판 번호 (URL 파라미터 bn) */
  boardNumber: number
  /** 수집할 페이지 수 */
  maxPages: number
  priority: 'high' | 'medium'
  category: ContentCategory
}

/**
 * 82cook 커뮤니티 크롤링 설정
 * URL 패턴:
 *   목록: https://www.82cook.com/entiz/enti.php?bn=15&page=1
 *   글: https://www.82cook.com/entiz/read.php?num=XXXXX&bn=15
 *
 * 82cook 특징:
 *   - 네이버 카페보다 솔직하고 날것인 글이 많음
 *   - 불만, 고민, 논쟁, 현실적 이야기 → 부정/비판 페르소나 콘텐츠 소싱에 최적
 *   - 로그인 불필요 (공개 게시판)
 */
export const EXTERNAL_CONFIGS: ExternalSiteConfig[] = [
  {
    id: '82cook',
    name: '82쿡',
    url: 'https://www.82cook.com',
    boards: [
      // 커뮤니티 게시판만 (유저 요청)
      { name: '자유게시판', boardNumber: 15, maxPages: 3, priority: 'high', category: 'lifestyle' },
    ],
  },
]

/**
 * 크롤링 대상 네이버 카페 3곳
 *
 * boards: discover-boards.ts 실행 후 실제 menuId로 교체 예정
 * 현재는 menuId: 0 (전체글보기)으로 설정 — 블랙리스트로 필터링
 *
 * priority:
 *   high — 50-60대에 직접 유용한 콘텐츠 (건강, 취미, 맛집, 유머, 일자리, 생활팁)
 *   medium — 참여도 높지만 품질 편차 (자유게시판, 일상수다)
 *   skip — 콘텐츠 가치 없음 (가입인사, 공지, 출석)
 */
export const CAFE_CONFIGS: CafeConfig[] = [
  {
    id: 'wgang',
    name: '우갱 (우아한 갱년기)',
    url: 'https://cafe.naver.com/wgang',
    numericId: 29349320,
    boards: [
      // ── high: 50-60대 핵심 관심사 ──
      { name: '웃으면 복이와요', menuId: 101, maxPages: 3, priority: 'high', category: 'humor' },
      { name: '약/영양제/건강/병원', menuId: 66, maxPages: 3, priority: 'high', category: 'health' },
      { name: '갱년기 몸 증상', menuId: 8, maxPages: 2, priority: 'high', category: 'health' },
      { name: '갱년기 극복후기', menuId: 81, maxPages: 2, priority: 'high', category: 'health' },
      { name: '운동/다이어트', menuId: 10, maxPages: 2, priority: 'high', category: 'health' },
      { name: '식품/집밥', menuId: 11, maxPages: 2, priority: 'high', category: 'food' },
      { name: '취미/특기', menuId: 14, maxPages: 2, priority: 'high', category: 'hobby' },
      { name: '나들이/여행/외식', menuId: 13, maxPages: 2, priority: 'high', category: 'hobby' },
      { name: '돈 이야기', menuId: 32, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '은퇴 노후 계획', menuId: 112, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '좋은 글 나누기', menuId: 48, maxPages: 2, priority: 'high', category: 'lifestyle' },
      // ── medium: 참여도 높지만 품질 편차 ──
      { name: '자유 주제', menuId: 34, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '영화/음악/공연/문화', menuId: 9, maxPages: 1, priority: 'medium', category: 'hobby' },
      { name: '내가 찍은 사진', menuId: 27, maxPages: 1, priority: 'medium', category: 'hobby' },
      { name: '반려 동식물', menuId: 28, maxPages: 1, priority: 'medium', category: 'hobby' },
      { name: '성형/피부/헤어/패션', menuId: 12, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '보험 이야기', menuId: 114, maxPages: 1, priority: 'medium', category: 'finance' },
    ],
  },
  {
    id: 'welovesilver',
    name: '은사랑 카페 (5060,7080)',
    url: 'https://cafe.naver.com/welovesilver',
    numericId: 28648142,
    boards: [
      // ── high ──
      { name: '유머/웃음/개그', menuId: 74, maxPages: 3, priority: 'high', category: 'humor' },
      { name: '감동 이야기', menuId: 75, maxPages: 2, priority: 'high', category: 'humor' },
      { name: '건강', menuId: 23, maxPages: 3, priority: 'high', category: 'health' },
      { name: '운동', menuId: 24, maxPages: 2, priority: 'high', category: 'health' },
      { name: '치료/병원/한의원/재활', menuId: 14, maxPages: 2, priority: 'high', category: 'health' },
      { name: '음식/요리', menuId: 25, maxPages: 2, priority: 'high', category: 'food' },
      { name: '식사하셨나요', menuId: 135, maxPages: 2, priority: 'high', category: 'food' },
      { name: '취미/등산/댄스/운동', menuId: 15, maxPages: 2, priority: 'high', category: 'hobby' },
      { name: '여행', menuId: 71, maxPages: 2, priority: 'high', category: 'hobby' },
      { name: '각종 생활 정보', menuId: 26, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '취업 정보/구인/구직', menuId: 98, maxPages: 2, priority: 'high', category: 'job' },
      { name: '금융/저축/보험/증권/투자', menuId: 27, maxPages: 2, priority: 'high', category: 'finance' },
      // ── medium ──
      { name: '자유게시판', menuId: 1, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '음악/노래', menuId: 69, maxPages: 1, priority: 'medium', category: 'hobby' },
      { name: '바람 쐬고 왔어요', menuId: 137, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '위로받기/응원하기', menuId: 79, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '부동산/주택/아파트', menuId: 34, maxPages: 1, priority: 'medium', category: 'finance' },
      { name: '반려동물', menuId: 127, maxPages: 1, priority: 'medium', category: 'hobby' },
      { name: '귀농 귀촌', menuId: 134, maxPages: 1, priority: 'medium', category: 'lifestyle' },
    ],
  },
  {
    id: '5060years',
    name: '50대60대 인생2막',
    url: 'https://cafe.naver.com/5060years',
    numericId: 28962370,
    boards: [
      // ── high ──
      { name: '자작 글/유머/재치', menuId: 23, maxPages: 3, priority: 'high', category: 'humor' },
      { name: '나만 아는 건강법', menuId: 17, maxPages: 3, priority: 'high', category: 'health' },
      { name: '오늘 뭐 드셨습니까', menuId: 14, maxPages: 2, priority: 'high', category: 'food' },
      { name: '맛집/음식/요리 솜씨 자랑', menuId: 102, maxPages: 2, priority: 'high', category: 'food' },
      { name: '생활의 지혜 공유', menuId: 16, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '국내 나들이 여행', menuId: 126, maxPages: 2, priority: 'high', category: 'hobby' },
      { name: '골프/낚시/라이딩', menuId: 116, maxPages: 2, priority: 'high', category: 'hobby' },
      { name: '걷기/등산/댄스', menuId: 121, maxPages: 2, priority: 'high', category: 'hobby' },
      { name: '인생 2막 설계/경험담', menuId: 389, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '꽃/나무/풍경/사진', menuId: 53, maxPages: 2, priority: 'high', category: 'hobby' },
      // ── medium ──
      { name: '시시콜콜 일상이야기', menuId: 13, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '사랑/이별/그리움', menuId: 304, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '반려동물 사랑방', menuId: 109, maxPages: 1, priority: 'medium', category: 'hobby' },
      { name: '국외 나들이 여행', menuId: 127, maxPages: 1, priority: 'medium', category: 'hobby' },
      { name: '귀촌/귀농/귀어 일기', menuId: 46, maxPages: 1, priority: 'medium', category: 'lifestyle' },
    ],
  },
]

/** Chrome 사용자 프로필 경로 (macOS) */
export const CHROME_USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR ??
  `${process.env.HOME}/Library/Application Support/Google/Chrome`

export const CHROME_PROFILE = process.env.CHROME_PROFILE ?? 'Profile 1'

/** 크롤링 제한 */
export const CRAWL_LIMITS = {
  /** 카페당 최대 수집 글 수 */
  maxPostsPerCafe: 30,
  /** 본문 최대 길이 (자) */
  maxContentLength: 3000,
  /** 페이지 로드 대기 (ms) */
  pageTimeout: 15000,
  /** 글 간 딜레이 (ms) — 차단 방지 */
  delayBetweenPosts: 2000,
  /** 글 목록 간 딜레이 (ms) */
  delayBetweenPages: 3000,
}

// ── 블랙리스트 ──

/** 크롤링 제외 게시판 이름 패턴 */
export const BOARD_BLACKLIST = [
  '가입인사', '공지사항', '가입양식', '출석체크', '출석부', '출석이벤트',
  '이벤트당첨', '운영자공지', '광고', '홍보', '규칙', '카페규칙',
  '공구', '판매', '중고거래',
]

/** 크롤링 제외 토픽 패턴 (제목/내용에 포함 시 스킵) */
export const TOPIC_BLACKLIST = [
  '정치', '선거', '정당', '대통령', '국회',
  '스팸', '도박', '카지노', '대출', '코인추천', '투자수익',
  '다단계', '네트워크마케팅',
]

/** 품질 점수 기준 */
export const QUALITY_THRESHOLDS = {
  /** 이 점수 미만은 DB 저장 안 함 */
  minSave: 30,
  /** 이 점수 이상은 isUsable = true */
  minUsable: 60,
}
