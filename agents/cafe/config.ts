import type { CafeConfig } from './types.js'

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
    name: '우리가남이가',
    url: 'https://cafe.naver.com/wgang',
    numericId: 29349320,
    boards: [
      // 등급 올라가면 discover-boards.ts 재실행하여 추가 게시판 확보
      { name: '전체글', menuId: 0, maxPages: 3, priority: 'high', category: 'general' },
      { name: '성형/피부/헤어/패션', menuId: 12, maxPages: 1, priority: 'medium', category: 'lifestyle' },
      { name: '내가 찍은 사진', menuId: 27, maxPages: 2, priority: 'medium', category: 'hobby' },
    ],
  },
  {
    id: 'welovesilver',
    name: '실버사랑',
    url: 'https://cafe.naver.com/welovesilver',
    numericId: 28648142,
    boards: [
      { name: '전체글', menuId: 0, maxPages: 3, priority: 'high', category: 'general' },
      { name: '식사하셨나요', menuId: 135, maxPages: 2, priority: 'high', category: 'food' },
      { name: '바람 쐬고 왔어요', menuId: 137, maxPages: 2, priority: 'medium', category: 'lifestyle' },
      { name: '은사랑 사진 앨범', menuId: 70, maxPages: 1, priority: 'medium', category: 'hobby' },
    ],
  },
  {
    id: '5060years',
    name: '5060세대',
    url: 'https://cafe.naver.com/5060years',
    numericId: 28962370,
    boards: [
      { name: '전체글', menuId: 0, maxPages: 3, priority: 'high', category: 'general' },
      { name: '시시콜콜 일상이야기', menuId: 13, maxPages: 2, priority: 'medium', category: 'lifestyle' },
      { name: '사랑/이별/그리움', menuId: 304, maxPages: 1, priority: 'medium', category: 'lifestyle' },
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
