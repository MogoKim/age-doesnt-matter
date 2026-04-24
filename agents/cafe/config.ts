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
 * 외부 사이트 크롤링 — 2026-04-07 기준 비활성화
 * 82cook 등 외부 사이트는 데이터 품질 미달로 제거.
 * 2개 네이버 카페(우갱+은퇴) 집중 전략으로 전환.
 */
export const EXTERNAL_CONFIGS: ExternalSiteConfig[] = []

/**
 * 크롤링 대상 네이버 카페 2곳 (2026-04-07 전략 개편)
 *
 * 개편 이유:
 *   기존 4개 카페(은사랑, 5060years 포함) → 2개 딥다이브
 *   - 은사랑(welovesilver): 데이터 품질 낮음, 제거
 *   - 50대60대 인생2막(5060years): 데이터 품질 낮음, 제거
 *   - 82cook: 외부 사이트, 의미 있는 데이터 부족, 제거
 *
 * 전략:
 *   - 우아한 갱년기(wgang): 40-50대 여성, HEALTH/FAMILY/RELATION 욕망 집중
 *   - 은퇴 후 50년(dlxogns01): 5060 남녀, RETIRE/MONEY/JOB 욕망 집중
 *   - 게시판 수: 기존 각 10개 → ~30개/~25개로 전면 확대
 *   - maxPostsPerCafe: 30 → 80 (2개 카페 × 80 = 160건/일)
 *
 * priority:
 *   high — 욕망/감정/고민이 직접 드러나는 게시판 (DEEP + QUICK 모두)
 *   medium — 참고용, DEEP 모드에서만 수집
 *
 * menuId: 0 항목 → discover-boards.ts로 wgang은 iframe 구조라 자동 탐색 불가
 *   // TODO: menuId 확인 필요 — 창업자가 카페 게시판 URL에서 직접 확인 후 알려줄 것
 */
export const CAFE_CONFIGS: CafeConfig[] = [
  // ─────────────────────────────────────────────────────────
  // 1) 우아한 갱년기 (wgang) — 40-50대 여성 커뮤니티
  //    핵심 욕망: HEALTH(갱년기) / FAMILY / RELATION / MONEY
  //    주의: iframe 구조로 discover-boards.ts 자동 탐색 불가
  //          menuId:0 항목은 창업자가 카페 방문 후 URL에서 직접 확인 필요
  // ─────────────────────────────────────────────────────────
  {
    id: 'wgang',
    name: '우아한 갱년기',
    url: 'https://cafe.naver.com/wgang',
    numericId: 29349320,
    boards: [
      // ── 인기글 (커뮤니티 검증 최고품질 — 2026-04-08 추가) ──
      { name: '인기글', menuId: 0, isPopular: true, maxPages: 2, priority: 'high', category: 'general' },

      // ── 갱년기 증상 그룹 (HEALTH 핵심) ──
      { name: '갱년기 몸 증상', menuId: 8, maxPages: 3, priority: 'high', category: 'health' },
      { name: '갱년기 마음 증상', menuId: 3, maxPages: 3, priority: 'high', category: 'health' },
      { name: '갱년기 극복후기', menuId: 81, maxPages: 2, priority: 'high', category: 'health' },

      // ── 관계·가족 그룹 (RELATION/FAMILY 욕망 핵심) ──
      { name: '혼잣말 반말일기', menuId: 38, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '딸아들 이야기', menuId: 5, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '남편 이야기', menuId: 6, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '친구 이야기', menuId: 65, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '친정댁 시댁', menuId: 21, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '일터 이야기', menuId: 7, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '싱글 이야기', menuId: 105, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '지인 이야기', menuId: 82, maxPages: 1, priority: 'medium', category: 'lifestyle' },

      // ── 돈·은퇴 그룹 (MONEY/RETIRE 욕망) ──
      { name: '돈 이야기', menuId: 32, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '보험 이야기', menuId: 114, maxPages: 1, priority: 'medium', category: 'finance' },
      { name: '은퇴 노후 계획', menuId: 112, maxPages: 2, priority: 'high', category: 'finance' },

      // ── 자유 주제 ──
      { name: '자유 주제', menuId: 34, maxPages: 2, priority: 'high', category: 'lifestyle' },

      // ── 내 몸 아끼기 (HEALTH) ──
      { name: '운동/다이어트', menuId: 10, maxPages: 2, priority: 'high', category: 'health' },
      { name: '약/영양제/건강/병원', menuId: 66, maxPages: 2, priority: 'high', category: 'health' },
      { name: '식품/집밥', menuId: 11, maxPages: 1, priority: 'medium', category: 'health' },
      { name: '성형/피부/헤어/패션', menuId: 12, maxPages: 1, priority: 'medium', category: 'lifestyle' },

      // ── 여가·문화·취미 (HOBBY/ENTERTAIN) ──
      { name: '독서/공부/자격증', menuId: 79, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '취미/특기', menuId: 14, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: 'TV/연예인/영상', menuId: 46, maxPages: 1, priority: 'medium', category: 'lifestyle' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 2) 은퇴 후 50년 (dlxogns01) — 5060 은퇴 커뮤니티
  //    핵심 욕망: RETIRE / MONEY / JOB / HEALTH / HOBBY
  //    ※ discover-boards.ts로 전체 menuId 확인 완료 (2026-04-07)
  // ─────────────────────────────────────────────────────────
  {
    id: 'dlxogns01',
    name: '은퇴 후 50년',
    url: 'https://cafe.naver.com/dlxogns01',
    numericId: 23676262,
    boards: [
      // ── 인기글 (베스트 게시판 menuId=107 — wgang과 달리 일반 게시판 방식으로 접근) ──
      { name: '인기글', menuId: 107, maxPages: 2, priority: 'high', category: 'general' },

      // ── 은퇴 후 삶 (RETIRE/JOB/MONEY) ──
      { name: '귀농·귀촌 이야기', menuId: 198, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '일자리·자격증 이야기', menuId: 149, maxPages: 2, priority: 'high', category: 'job' },
      { name: '사업·자영업 이야기', menuId: 148, maxPages: 2, priority: 'high', category: 'job' },
      { name: '투자 이야기(금융)', menuId: 106, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '투자 이야기(부동산)', menuId: 274, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '해외이민 이야기', menuId: 95, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '한달살기 이야기', menuId: 85, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '취미 이야기', menuId: 314, maxPages: 1, priority: 'medium', category: 'lifestyle' },

      // ── 은오 일상 (RELATION/MEANING/FREEDOM) ──
      { name: '자유로운 이야기', menuId: 45, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '예비은퇴자 이야기', menuId: 356, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '고민 있어요(QnA)', menuId: 113, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '은퇴 일기', menuId: 29, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '소소한 일상과 행복', menuId: 98, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '여행 이야기', menuId: 102, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '맛집 이야기', menuId: 136, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '꽃·식물·반려동물', menuId: 139, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '나의 버킷리스트', menuId: 97, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '나의 창작물', menuId: 83, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '유머·이슈·정보', menuId: 61, maxPages: 2, priority: 'medium', category: 'lifestyle' },
      { name: '칼럼·에세이', menuId: 111, maxPages: 1, priority: 'medium', category: 'lifestyle' },

      // ── 은오 자기관리 (HEALTH) ──
      { name: '건강 이야기', menuId: 65, maxPages: 2, priority: 'high', category: 'health' },
      { name: '운동 이야기', menuId: 103, maxPages: 1, priority: 'medium', category: 'health' },
      { name: '공부 이야기', menuId: 44, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '독서 이야기', menuId: 112, maxPages: 1, priority: 'medium', category: 'lifestyle' },
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
  /** 카페당 최대 수집 글 수 (2개 카페 × 80 = 160건/일) */
  maxPostsPerCafe: 80,
  /** 본문 최대 길이 (자) */
  maxContentLength: 3000,
  /** 페이지 로드 대기 (ms) */
  pageTimeout: 15000,
  /** 글 간 딜레이 (ms) — 차단 방지 */
  delayBetweenPosts: 2000,
  /** HIGH 게시판 페이지 간 딜레이 (ms) */
  delayBetweenPages: 3000,
  /** MEDIUM 게시판 페이지 간 딜레이 (ms) — 속도 최적화 */
  delayBetweenPagesMedium: 1500,
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
