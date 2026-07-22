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
  // 3. 레몬테라스 (10298136) — core 소스 (Phase 2-a 승격, 2026-07-10. 1-a-② publishable 경유)
  //    sourceStage:'core' → 발행 + killer 후보 경쟁 동급(killerScore 순). trend/성공판정은 미편입(2-b 이후).
  //    발행 시 production과 동일: usedAt 마킹 + Post.cafePostId 연결 + 전체 가드.
  //    legacyCrawler:true + allArticlesUrl 미지정 → 전체글보기 우회, boards 루프(menuId 23)만 수집.
  //    육아·살림 카페라 연령 필터(passesShadowAgeFilter, crawler.ts — SECONDARY 키)로 isUsable 보정 유지.
  // ─────────────────────────────────────────────────────────
  {
    id: 'remonterrace',
    name: '레몬테라스',
    url: 'https://cafe.naver.com/f-e/cafes/10298136',
    numericId: 10298136,
    legacyCrawler: true,
    sourceStage: 'core',
    boards: [
      { name: '쫑알쫑알', menuId: 23, maxPages: 15, priority: 'medium', category: 'lifestyle' },  // 2026-07-07 5→15: 글이 빨라 1h에 10p+ 밀림. shadow page loop(crawler.ts)로 실제 page1~15 순회. pre-visit(c>=5) 통과만 상세, detailCap 30
    ],
  },
  // ─────────────────────────────────────────────────────────
  // 4. goondae (10797658) — core 소스 (Phase 2-a 승격, 2026-07-10. shadow 파일럿→1-a-② publishable 경유)
  //    ⚠️ 실제 카페 정체(2026-07-22 read-only dry-run 실측): id는 'goondae'지만 numericId 10797658은
  //       "수원광교동탄맘"(115만 지역 맘카페)이다. 기존 'name: 군대카페' 및 "405060 관계·남편·아들" 설명은
  //       사실과 불일치(오식별). id/name/sourceStage는 이 PR에서 변경하지 않음(리플 방지) — core 유지 여부는
  //       "996 추가 후 saved 관찰" 별도 판단(창업자). 콘텐츠가 이벤트/등업/육아/지역 중심이라 age-fit/pre-visit이
  //       대부분 정상 hard-reject → 07-08 이후 saved≈0의 원인은 "저활성"이 아니라 소스-타깃 성격 불일치일 가능성.
  //    게시판(2026-07-22 실측 게시판명): menuId 997 = "걱정/고민/위로 수다방", menuId 996 = "친해져요 수다방".
  //    goondae가 보는 게시판은 이 2개(997, 996)뿐. 메뉴 URL은 게시판별로 스코프되며(실측: 두 게시판 일반글 ID 교집합 0),
  //    겹치는 상단 공지/이벤트만 공통 노출 → passesPreVisit(isNotice/광고패턴/c<10)가 상세 방문 전 거부(격리 보장).
  //    sourceStage:'core' → 발행 + killer 후보 동급. trend/성공판정 미편입(2-b 이후). SECONDARY page loop 유지.
  //    ⚠️ CRAWL_CAFE_FILTER에 'goondae' 추가해야 실제 크롤됨. CRAWL_EXPECTED_CAFE_IDS엔 추가 금지(성공판정 오판 방지).
  // ─────────────────────────────────────────────────────────
  {
    id: 'goondae',
    name: '군대카페',
    url: 'https://cafe.naver.com/f-e/cafes/10797658',
    numericId: 10797658,
    legacyCrawler: true,   // allArticlesUrl 미지정 → collectAllArticleUrls(전체글보기) 우회하고 boards page loop만 사용 (remon과 동일). 누락 시 crawl-only에서 0개 수집됨.
    sourceStage: 'core',
    boards: [
      { name: '걱정/고민/위로 수다방', menuId: 997, maxPages: 3, priority: 'medium', category: 'lifestyle' },  // 2026-07-22 5→3: 997이 maxPostsPerCafe=80을 혼자 채워(5p≈82) 996이 slice로 컷되던 문제 — 996 pipeline 진입 실험(전역 cap·순서·crawler 무변경)
      { name: '친해져요 수다방', menuId: 996, maxPages: 5, priority: 'medium', category: 'lifestyle' },  // 2026-07-22 추가: 997 단일 후보 부족 보완. 실측 게시판명.
    ],
  },
  // ─────────────────────────────────────────────────────────
  // 5. masanmam 줌마렐라 (14793916) — publishable 온보딩 (2026-07-12 사전조사 기반)
  //    자유이야기방(menuId 87): 경남 주부 카페 — 시댁·가족·중년 담론 일부 적합(사전조사 적합 ~23%,
  //    육아 ~17%·지역/홍보 ~10%는 age-fit LOCAL_TRADE 필터로 차단). 활성도 ~180건/일, c>=5 ≈ 20%.
  //    sourceStage:'publishable' → refs 발행 + PUBLISHABLE_ONLY 보충 lane(production 우선, killer 미편입).
  //    24h 운영검증 PASS 시 core 승격 = 이 줄 'publishable'→'core' + 테스트 기대값만 (로직 0줄 — remon/goondae 선례).
  //    ⚠️ readLevel(멤버 등급) 본문 제한 가능성 — 첫 크롤에서 ACCESS_BLOCKED 안내문 비율 실측(100%면 온보딩 철회).
  //    ⚠️ CRAWL_CAFE_FILTER에 'masanmam' 추가해야 실제 크롤됨(.env.local 수동 — wgang 관찰 필터와 공존,
  //       2026-07-21 wgang 원복으로 필터 삭제 시 자동 포함). CRAWL_EXPECTED_CAFE_IDS엔 추가 금지.
  // ─────────────────────────────────────────────────────────
  {
    id: 'masanmam',
    name: '줌마렐라',
    url: 'https://cafe.naver.com/f-e/cafes/14793916',
    numericId: 14793916,
    legacyCrawler: true,   // goondae/remon과 동일 — boards page loop 전용
    sourceStage: 'core',   // 2026-07-14 core 승격 — 24h 운영검증 PASS(usable5 0→16, 발행 1건 정합, 톤 무사고). 필터·크롤 전략 무변경(SECONDARY 유지)
    boards: [
      { name: '자유이야기방', menuId: 87, maxPages: 5, priority: 'medium', category: 'lifestyle' },
    ],
  },
]

/**
 * 소스 스테이지 사다리 (Phase 2-a: production > core > publishable > shadow)
 *   production(미지정 포함): 발행 + killer 후보 + trend + CRAWL_EXPECTED 성공판정 전부
 *   core: 발행 + killer 후보 경쟁 동급 — trend/성공판정/크롤품질 미편입 (Phase 2-b 이후)
 *   publishable: 발행(refs) + 보충 lane — 신규 카페 온보딩 단계
 *   shadow: 발행 금지 관찰 전용
 * 크롤 전략(페이지 루프·pre-visit·연령필터·detailCap)은 발행 정책과 별개 축 — SECONDARY_CAFE_IDS 사용
 * (core/publishable/shadow 모두 포함 — 승격해도 연령필터가 꺼지지 않는 것이 이 축 분리의 핵심).
 * 정책 문서: docs/analysis/content-curate-phase2-core-promotion-design-2026-07-10.md
 *
 * ⚠️ isProductionCafe는 "미지정 또는 명시적 production"만 인정한다.
 *    (core/publishable을 PRODUCTION에 넣으면 trend·CRAWL_EXPECTED 성공판정·크롤품질 기준이
 *     자동 오염되는 함정 — Phase 1-a-①에서 교정된 원칙 유지)
 */
export const isProductionCafe = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  !c.sourceStage || c.sourceStage === 'production'
export const isCurationCoreSource = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  isProductionCafe(c) || c.sourceStage === 'core'
export const isPublishableSource = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  isCurationCoreSource(c) || c.sourceStage === 'publishable'
export const isSecondarySource = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  c.sourceStage === 'shadow' || c.sourceStage === 'publishable' || c.sourceStage === 'core'
export const isShadowSource = (c: Pick<CafeConfig, 'sourceStage'>): boolean =>
  c.sourceStage === 'shadow'

/** trend/CRAWL_EXPECTED 성공판정/크롤품질에 쓰는 production 카페 id (현재: wgang, dlxogns01 — core 승격과 무관하게 불변) */
export const PRODUCTION_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isProductionCafe).map(c => c.id)
/** killer 후보 경쟁군 = production + core (Phase 2-a, 현재: wgang, dlxogns01, remonterrace, goondae) — content-curator killer 쿼리 전용 */
export const CURATION_CORE_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isCurationCoreSource).map(c => c.id)
/** 발행(refs) 가능 카페 id = production + core + publishable (현재: wgang, dlxogns01, remonterrace, goondae) */
export const PUBLISHABLE_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isPublishableSource).map(c => c.id)
/** 비핵심 소스(core+publishable+shadow) — 크롤 전략(페이지 루프·pre-visit·연령필터) 전용 키 (현재: remonterrace, goondae) */
export const SECONDARY_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isSecondarySource).map(c => c.id)
/** 발행 금지 관찰 전용 shadow 카페 id (현재: 없음) */
export const SHADOW_CAFE_IDS: string[] = CAFE_CONFIGS.filter(isShadowSource).map(c => c.id)
/** publishable 전용(비-core) 카페 id — source-backed 보충 lane 용 (Phase 1-b, 현재: 없음 — remon/goondae는 core 승격).
 *  신규 카페 온보딩 경로로 유지: shadow → publishable(보충 lane) → core(동급 경쟁) → production. */
export const PUBLISHABLE_ONLY_CAFE_IDS: string[] = CAFE_CONFIGS.filter(c => c.sourceStage === 'publishable').map(c => c.id)

/** cafeId → sourceStage 판정 (BotLog refSourceStage 기록용 — content-curator에서 사용) */
export function sourceStageOfCafe(cafeId: string): 'production' | 'core' | 'publishable' | 'shadow' | 'unknown' {
  const c = CAFE_CONFIGS.find(x => x.id === cafeId)
  if (!c) return 'unknown'
  if (isProductionCafe(c)) return 'production'
  if (c.sourceStage === 'core') return 'core'
  return c.sourceStage === 'publishable' ? 'publishable' : 'shadow'
}

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
