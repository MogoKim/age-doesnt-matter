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
 * 크롤링 대상 네이버 카페 5곳
 *
 * 선정 원칙 (욕망 독해 최적화):
 *   정보글 < 취미글 < 고민/감정/불만 글 우선
 *   제거: 사진, 여행/나들이, 음식/요리, 유머, 취미, 골프/낚시 게시판
 *   유지: 건강증상, 가족갈등, 돈걱정, 은퇴고민, 외로움, 위로 게시판
 *
 * priority:
 *   high — 욕망/감정/고민이 직접 드러나는 게시판 (DEEP + QUICK 모두)
 *   medium — 참고용, DEEP 모드에서만 수집
 *
 * TODO: dlxogns01, wgang 신규 게시판, welovesilver·5060years 신규 게시판의
 *       menuId는 카페 방문 후 URL ?menuid= 파라미터 확인 필요 (현재 0으로 임시 설정)
 */
export const CAFE_CONFIGS: CafeConfig[] = [
  // ─────────────────────────────────────────────────
  // 1) 은퇴 후 50년 (dlxogns01) — 신규 추가
  // ─────────────────────────────────────────────────
  // TODO: numericId — 카페 접속 후 개발자도구 네트워크 탭에서 clubId 파라미터 확인 필요
  // TODO: 각 게시판 menuId — 게시판 클릭 후 URL ?menuid= 확인 필요
  {
    id: 'dlxogns01',
    name: '은퇴 후 50년',
    url: 'https://cafe.naver.com/dlxogns01',
    numericId: 0, // TODO: 실제 numericId로 교체 필요
    boards: [
      // ── high: 욕망/감정이 직접 드러나는 게시판 ──
      { name: '자유로운 이야기', menuId: 0, maxPages: 2, priority: 'high', category: 'lifestyle' },    // TODO: menuId
      { name: '예비은퇴자 이야기', menuId: 0, maxPages: 2, priority: 'high', category: 'finance' },   // TODO: menuId
      { name: '은퇴 일기', menuId: 0, maxPages: 2, priority: 'high', category: 'lifestyle' },          // TODO: menuId
      { name: '건강 이야기', menuId: 0, maxPages: 2, priority: 'high', category: 'health' },           // TODO: menuId
      { name: '고민 있어요(QnA)', menuId: 0, maxPages: 2, priority: 'high', category: 'lifestyle' },   // TODO: menuId
      { name: '투자 이야기(금융/부동산)', menuId: 0, maxPages: 2, priority: 'high', category: 'finance' }, // TODO: menuId
      { name: '일자리·자격증 이야기', menuId: 0, maxPages: 2, priority: 'high', category: 'job' },    // TODO: menuId
      // ── medium ──
      { name: '귀농·귀촌 이야기', menuId: 0, maxPages: 1, priority: 'medium', category: 'lifestyle' }, // TODO: menuId
      { name: '소소한 일상과 행복', menuId: 0, maxPages: 1, priority: 'medium', category: 'lifestyle' }, // TODO: menuId
    ],
  },

  // ─────────────────────────────────────────────────
  // 2) 우아한 갱년기 (wgang) — 게시판 재설계
  //    제거: 웃으면 복이와요, 식품/집밥, 취미/특기, 나들이/여행/외식,
  //           좋은 글 나누기, 영화/음악, 내가 찍은 사진, 반려동식물,
  //           성형/피부/헤어/패션, 보험 이야기
  //    추가: 갱년기 마음 증상, 딸아들 이야기, 남편 이야기 (menuId 확인 필요)
  // ─────────────────────────────────────────────────
  {
    id: 'wgang',
    name: '우아한 갱년기',
    url: 'https://cafe.naver.com/wgang',
    numericId: 29349320,
    boards: [
      // ── high: 건강·가족·돈·은퇴 욕망 집중 ──
      { name: '갱년기 몸 증상', menuId: 8, maxPages: 3, priority: 'high', category: 'health' },
      { name: '갱년기 마음 증상', menuId: 0, maxPages: 3, priority: 'high', category: 'health' }, // TODO: menuId
      { name: '갱년기 극복후기', menuId: 81, maxPages: 2, priority: 'high', category: 'health' },
      { name: '약/영양제/건강/병원', menuId: 66, maxPages: 2, priority: 'high', category: 'health' },
      { name: '운동/다이어트', menuId: 10, maxPages: 2, priority: 'high', category: 'health' },
      { name: '은퇴 노후 계획', menuId: 112, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '돈 이야기', menuId: 32, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '딸아들 이야기', menuId: 0, maxPages: 2, priority: 'high', category: 'lifestyle' },   // TODO: menuId
      { name: '남편 이야기', menuId: 0, maxPages: 2, priority: 'high', category: 'lifestyle' },     // TODO: menuId
      // ── medium ──
      { name: '자유 주제', menuId: 34, maxPages: 1, priority: 'medium', category: 'lifestyle' },
    ],
  },

  // ─────────────────────────────────────────────────
  // 3) 은사랑 카페 (welovesilver) — 게시판 재설계
  //    제거: 유머/웃음/개그, 감동 이야기, 운동, 치료/병원, 음식/요리,
  //           식사하셨나요, 취미/등산/댄스/운동, 여행, 취업 정보/구인/구직,
  //           자유게시판, 음악/노래, 바람 쐬고 왔어요, 부동산, 반려동물
  //    추가: 가족/자녀/부모/손주/손녀 (menuId 확인 필요)
  //    승격: 위로받기/응원하기 medium → high
  // ─────────────────────────────────────────────────
  {
    id: 'welovesilver',
    name: '은사랑 카페',
    url: 'https://cafe.naver.com/welovesilver',
    numericId: 28648142,
    boards: [
      // ── high ──
      { name: '건강', menuId: 23, maxPages: 3, priority: 'high', category: 'health' },
      { name: '가족/자녀/부모/손주/손녀', menuId: 0, maxPages: 2, priority: 'high', category: 'lifestyle' }, // TODO: menuId
      { name: '금융/저축/보험/증권/투자', menuId: 27, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '위로받기/응원하기', menuId: 79, maxPages: 2, priority: 'high', category: 'lifestyle' }, // medium → high 승격
      // ── medium ──
      { name: '각종 생활 정보', menuId: 26, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '귀농 귀촌', menuId: 134, maxPages: 1, priority: 'medium', category: 'lifestyle' },
    ],
  },

  // ─────────────────────────────────────────────────
  // 4) 50대60대 인생2막 (5060years) — 게시판 재설계
  //    제거: 자작 글/유머/재치, 오늘 뭐 드셨습니까, 맛집/음식/요리 솜씨 자랑,
  //           국내 나들이 여행, 골프/낚시/라이딩, 걷기/등산/댄스, 꽃/나무/풍경/사진,
  //           시시콜콜 일상이야기, 반려동물 사랑방, 국외 나들이 여행, 귀촌/귀농/귀어 일기
  //    추가: 자격증/노후대비, 아~ 화가 나요. 왜? (menuId 확인 필요)
  // ─────────────────────────────────────────────────
  {
    id: '5060years',
    name: '50대60대 인생2막',
    url: 'https://cafe.naver.com/5060years',
    numericId: 28962370,
    boards: [
      // ── high ──
      { name: '자격증/노후대비', menuId: 0, maxPages: 2, priority: 'high', category: 'job' },        // TODO: menuId
      { name: '나만 아는 건강법', menuId: 17, maxPages: 2, priority: 'high', category: 'health' },
      { name: '인생 2막 설계/경험담/고민', menuId: 389, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '아~ 화가 나요. 왜?', menuId: 0, maxPages: 2, priority: 'high', category: 'lifestyle' }, // TODO: menuId
      { name: '사랑/이별/그리움', menuId: 304, maxPages: 2, priority: 'high', category: 'lifestyle' },
      // ── medium ──
      { name: '생활의 지혜 공유', menuId: 16, maxPages: 1, priority: 'medium', category: 'lifestyle' },
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
