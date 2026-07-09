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
    allArticlesUrl: 'https://cafe.naver.com/f-e/cafes/29349320/menus/0?viewType=L',
    boards: [
      // ── 인기글 (커뮤니티 검증 최고품질 — 2026-04-08 추가) ──
      { name: '인기글', menuId: 0, isPopular: true, maxPages: 2, priority: 'high', category: 'general' },

      // ── 갱년기 증상 그룹 (HEALTH 핵심) ──
      { name: '갱년기 몸 증상', menuId: 8, maxPages: 2, priority: 'high', category: 'health' },
      { name: '갱년기 마음 증상', menuId: 3, maxPages: 2, priority: 'high', category: 'health' },
      { name: '갱년기 극복후기', menuId: 81, maxPages: 2, priority: 'high', category: 'health' },

      // ── 관계·가족 그룹 (RELATION/FAMILY 욕망 핵심) ──
      { name: '혼잣말 반말일기', menuId: 38, maxPages: 3, priority: 'high', category: 'lifestyle' },
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
      { name: '자유 주제', menuId: 34, maxPages: 3, priority: 'high', category: 'lifestyle' },

      // ── 내 몸 아끼기 (HEALTH) ──
      { name: '운동/다이어트', menuId: 10, maxPages: 2, priority: 'high', category: 'health' },
      { name: '약/영양제/건강/병원', menuId: 66, maxPages: 2, priority: 'high', category: 'health' },
      { name: '식품/집밥', menuId: 11, maxPages: 1, priority: 'medium', category: 'health' },
      { name: '성형/피부/헤어/패션', menuId: 12, maxPages: 1, priority: 'medium', category: 'lifestyle' },

      // ── 여가·문화·취미 (HOBBY/ENTERTAIN) ──
      { name: '독서/공부/자격증', menuId: 79, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '취미/특기', menuId: 14, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: 'TV/연예인/영상', menuId: 46, maxPages: 2, priority: 'high', category: 'lifestyle' },
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
    allArticlesUrl: 'https://cafe.naver.com/f-e/cafes/23676262/menus/0?viewType=L',
    // P1-1: 은퇴후50년은 창업자 지정 게시판만 수집한다.
    // crawl-only 모드의 전체글보기(allArticlesUrl) 우회를 막고 boards 루프만 사용한다.
    legacyCrawler: true,
    boards: [
      // ── 창업자 지정 허용 게시판 13개만 수집 (2026-06-02) ──
      { name: '귀농·귀촌 이야기', menuId: 198, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '일자리·자격증 이야기', menuId: 149, maxPages: 2, priority: 'high', category: 'job' },
      { name: '취미 이야기', menuId: 314, maxPages: 1, priority: 'high', category: 'lifestyle' },
      { name: '자유로운 이야기', menuId: 45, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '예비은퇴자 이야기', menuId: 356, maxPages: 2, priority: 'high', category: 'finance' },
      { name: '은퇴 일기', menuId: 29, maxPages: 3, priority: 'high', category: 'lifestyle' },
      { name: '여행 이야기', menuId: 102, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '맛집 이야기', menuId: 136, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '꽃·식물·반려동물', menuId: 139, maxPages: 1, priority: 'high', category: 'lifestyle' },
      { name: '나의 버킷리스트', menuId: 97, maxPages: 1, priority: 'high', category: 'lifestyle' },
      { name: '유머·이슈·정보', menuId: 61, maxPages: 2, priority: 'high', category: 'lifestyle' },
      { name: '건강 이야기', menuId: 65, maxPages: 2, priority: 'high', category: 'health' },
      { name: '운동 이야기', menuId: 103, maxPages: 1, priority: 'high', category: 'health' },
    ],
  },
  // ─────────────────────────────────────────────────────────
  // 3. 레몬테라스 (10298136) — shadow 소스(관찰 전용)
  //    sourceStage:'shadow' → content-curator/trend/run-pipeline 품질가드에서 격리(발행·trend 미편입).
  //    legacyCrawler:true + allArticlesUrl 미지정 → 전체글보기 우회, boards 루프(menuId 23)만 수집.
  //    육아·살림 카페라 연령 필터(passesShadowAgeFilter, crawler.ts)로 isUsable 보정.
  // ─────────────────────────────────────────────────────────
  {
    id: 'remonterrace',
    name: '레몬테라스',
    url: 'https://cafe.naver.com/f-e/cafes/10298136',
    numericId: 10298136,
    legacyCrawler: true,
    sourceStage: 'shadow',
    boards: [
      { name: '쫑알쫑알', menuId: 23, maxPages: 15, priority: 'medium', category: 'lifestyle' },  // 2026-07-07 5→15: 글이 빨라 1h에 10p+ 밀림. shadow page loop(crawler.ts)로 실제 page1~15 순회. pre-visit(c>=5) 통과만 상세, detailCap 30
    ],
  },
  // ─────────────────────────────────────────────────────────
  // 4. goondae (10797658) — shadow 파일럿(2026-07-08 추가, 관찰 전용)
  //    걱정/고민/위로 수다방(menuId 997): 405060 관계·남편·아들·고민 글 적합(실측 c>=5 다수, 오파싱 없음).
  //    sourceStage:'shadow' → content-curator/trend/run-pipeline 격리(발행·trend 미편입). shadow page loop 적용.
  //    ⚠️ CRAWL_CAFE_FILTER에 'goondae' 추가해야 실제 크롤됨. CRAWL_EXPECTED_CAFE_IDS엔 추가 금지(성공판정 오판 방지).
  // ─────────────────────────────────────────────────────────
  {
    id: 'goondae',
    name: '군대카페',
    url: 'https://cafe.naver.com/f-e/cafes/10797658',
    numericId: 10797658,
    legacyCrawler: true,   // allArticlesUrl 미지정 → collectAllArticleUrls(전체글보기) 우회하고 boards page loop만 사용 (remon과 동일). 누락 시 crawl-only에서 0개 수집됨.
    sourceStage: 'shadow',
    boards: [
      { name: '걱정/고민/위로 수다방', menuId: 997, maxPages: 5, priority: 'medium', category: 'lifestyle' },
    ],
  },
]

/**
 * 소스 스테이지 3단계 (Phase 1-a-①: 축 분리 — 동작 무변경 기반 작업)
 *   production(미지정 포함): 발행 + trend/killer + CRAWL_EXPECTED 성공판정 전부
 *   publishable: 발행(refs)만 — trend/killer/성공판정 미편입 (승격 중간 단계)
 *   shadow: 발행 금지 관찰 전용
 * 크롤 전략(페이지 루프·pre-visit·연령필터)은 발행 정책과 별개 축 — SECONDARY_CAFE_IDS 사용.
 * 정책 문서: docs/analysis/content-curate-source-policy-phase1a-2026-07-09.md
 *
 * ⚠️ isProductionCafe는 "미지정 또는 명시적 production"만 인정한다.
 *    (기존 `!== 'shadow'` 판정은 publishable 승격 시 remon/goondae가 PRODUCTION_CAFE_IDS에
 *     자동 편입되어 trend·성공판정·killer 후보를 오염시키는 함정이 있었음)
 */
export const isProductionCafe = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  !c.sourceStage || c.sourceStage === 'production'
export const isPublishableSource = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  isProductionCafe(c) || c.sourceStage === 'publishable'
export const isSecondarySource = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  c.sourceStage === 'shadow' || c.sourceStage === 'publishable'
export const isShadowSource = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  c.sourceStage === 'shadow'

/** trend/killer/성공판정에 쓰는 production 카페 id (현재: wgang, dlxogns01) */
export const PRODUCTION_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isProductionCafe).map(c => c.id)
/** 발행(refs) 가능 카페 id = production + publishable (현재: production과 동일 — 승격 전) */
export const PUBLISHABLE_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isPublishableSource).map(c => c.id)
/** 비핵심 소스(shadow+publishable) — 크롤 전략(페이지 루프·pre-visit·연령필터) 전용 키 (현재: remonterrace, goondae) */
export const SECONDARY_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isSecondarySource).map(c => c.id)
/** 발행 금지 관찰 전용 shadow 카페 id (현재: remonterrace, goondae) */
export const SHADOW_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isShadowSource).map(c => c.id)

/** dlxogns01(은퇴 후 50년) 창업자 지정 허용 게시판 13개 — content-curator 후보 필터용 */
export const DLXOGNS01_ALLOWED_BOARDS: string[] = [
  '귀농·귀촌 이야기', '일자리·자격증 이야기', '취미 이야기', '자유로운 이야기',
  '예비은퇴자 이야기', '은퇴 일기', '여행 이야기', '맛집 이야기',
  '꽃·식물·반려동물', '나의 버킷리스트', '유머·이슈·정보', '건강 이야기', '운동 이야기',
]

/** Chrome 사용자 프로필 경로 (macOS) */
export const CHROME_USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR ??
  `${process.env.HOME}/Library/Application Support/Google/Chrome`

export const CHROME_PROFILE = process.env.CHROME_PROFILE ?? 'Default'

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

/** 경쟁사 카페 키워드 — 크롤링·게시·댓글 차단 */
export const COMPETITOR_KEYWORDS = [
  '은오카페', '은오 카페',    // 은퇴 후 오십 카페
  '우갱',                    // 우아한 갱년기 약칭
  '우아한 갱년기',            // 우아한 갱년기 전체명
  '은퇴후 50년', '은퇴 후 50년', // 은퇴 후 50년 카페
  '은오',                    // 은퇴 후 오십 약칭 (댓글 레벨만 — 크롤러는 제외)
]

/** 품질 점수 기준 */
export const QUALITY_THRESHOLDS = {
  /** 이 점수 미만은 DB 저장 안 함 */
  minSave: 20,
  /** 이 점수 이상은 isUsable = true (trend-analyzer.ts에서 참조) */
  minUsable: 30,
}
