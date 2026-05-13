/**
 * 네이버 블로그 자동 포스터 — 설정
 *
 * 사용 전 필수:
 *   1. Chrome에서 hihihihi1023 새 프로필로 로그인
 *   2. npx tsx agents/naver-blog/export-blog-cookies.ts
 *   3. NAVER_BLOG_ID 확인 (blog.naver.com/{여기} 의 영문명)
 *
 * 환경변수 (.env.local):
 *   NAVER_BLOG_ID         — 블로그 ID (영문, 필수)
 *   BLOG_CHROME_PROFILE   — Chrome 프로필 이름 (기본: "Profile 2")
 *   DRY_RUN               — "true" 시 발행 버튼 누르지 않음
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Chrome 프로필 (카페 크롤러와 완전 별도) ──
// 카페 크롤러: Default profile (hihihi1023, 우리 나이가 어때서)
// 블로그 포스터: Profile 1 (k-agelab, korea.age.not.matter) ← 쿠키 DB 완전 격리
export const CHROME_USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR ??
  `${process.env.HOME}/Library/Application Support/Google/Chrome`

export const BLOG_CHROME_PROFILE = process.env.BLOG_CHROME_PROFILE ?? 'Profile 1'

// ── 블로그 계정 ──
export const NAVER_BLOG_ID = process.env.NAVER_BLOG_ID ?? ''
export const NAVER_BLOG_URL = NAVER_BLOG_ID ? `https://blog.naver.com/${NAVER_BLOG_ID}` : ''
// 실제 확인된 글쓰기 URL — PostWriteForm.naver은 리다이렉트됨
export const NAVER_BLOG_WRITE_URL = NAVER_BLOG_ID
  ? `https://blog.naver.com/${NAVER_BLOG_ID}?Redirect=Write&`
  : 'https://blog.naver.com/PostWriteForm.naver'
export const NAVER_LOGIN_VERIFY_URL = 'https://www.naver.com/'

// ── 파일 경로 ──
const __dirname = dirname(fileURLToPath(import.meta.url))

export const BLOG_DIR = __dirname
export const BLOG_STORAGE_STATE_PATH = resolve(__dirname, 'blog-storage-state.json')
export const QUEUE_PATH = resolve(__dirname, 'queue.json')
export const BLOG_HALTED_FLAG = resolve(__dirname, '.blog-halted')
export const BANNERS_DIR = resolve(__dirname, 'banners')
export const TEMP_DIR = resolve(__dirname, 'temp')
export const DRY_RUN_SCREENSHOTS_DIR = resolve(__dirname, 'dry-run-screenshots')

// ── 발행 정책 ──
export const POSTING_POLICY = {
  /** 1회 실행당 최대 발행 건수 (catch-up 1 + 정기 1) */
  maxPerRun: 2,
  /** 이 시간(시간) 초과된 pending 항목은 expired 처리 (stale content) */
  expireAfterHours: 48,
  /** 발행 실패 최대 재시도 횟수 */
  maxRetries: 3,
  /** BLOG_HALTED 트리거: retryCount >= maxRetries 인 항목이 이 수 이상이면 중단 */
  haltAfterFailedItems: 2,
  /** 초기 안정화 기간(일) — 이 기간은 1회/일만 발행 */
  stabilizationDays: 30,
  /** 안정화 이후 최대 발행 횟수/일 */
  maxPerDayNormal: 2,
} as const

// ── 콘텐츠 정책 ──
export const CONTENT_POLICY = {
  minChars: 1000,
  maxChars: 6000,
  minHashtags: 5,
  maxHashtags: 10,
  maxExternalLinks: 2,          // Naver 스팸 방지
  maxBodyImages: 2,             // 매거진 본문 이미지 최대 삽입 수
  forbiddenWords: ['노인', '할머니', '시니어', '어르신'],
  targetChars: 1800,            // 네이버 SEO 2025: 1500-2000자 권장
} as const

// ── SmartEditor ONE 셀렉터 (2026-05-12 DOM 프로브로 확인) ──
// 에디터는 PostWriteForm.naver iframe 안에 있음 — smart-editor.ts에서 frame 전환 필요
// data-click-area 속성이 CSS 모듈 hash보다 안정적 (Naver 업데이트 내성)
export const SELECTORS = {
  // 제목 영역 — se-title-text 클래스 div 클릭 후 타이핑
  TITLE_INPUT: '.se-title-text',
  // 본문 편집 영역 — iframe 내 단일 contenteditable div
  CONTENT_AREA: '[contenteditable="true"]',
  // 사진 버튼 — aria-label="이미지 글감" (하단 플로팅 메뉴)
  PHOTO_BUTTON: '.se-floating-category-button-photo',
  // 내 PC에서 업로드 (사진 버튼 클릭 후 파일 선택 dialog 대기로 대체)
  UPLOAD_FROM_PC: '.se-photo-menu-upload-btn',
  // 업로드된 이미지 확인용
  UPLOADED_IMAGE: '.se-image-resource',
  // 태그 입력 — 발행 패널 내 id=tag-input (안정적 id)
  TAG_INPUT: '#tag-input',
  // 발행 버튼 — data-click-area 속성으로 식별 (hash-suffix 클래스보다 안정적)
  // 1차 클릭: 패널 오픈 / 2차 클릭(태그 입력 후): 최종 발행
  PUBLISH_BUTTON: '[data-click-area="tpb.publish"]',
  // 도움말 오버레이 — 글쓰기 진입 시 자동으로 나타남, JS로 숨김 처리
  HELP_PANEL: '[class*="container__HW"]',
  // 로그인 확인 (미사용 — URL 리다이렉트 방식으로 대체)
  LOGIN_CHECK: '.gnb_name',
} as const

// ── Playwright 브라우저 설정 ──
export const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--disable-dev-shm-usage',
  // SmartEditor rAF/타이머 스로틀링 방지 — 창이 백그라운드에 있어도 JS 정상 실행
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  // 창 위치 및 크기 명시 — 화면 좌상단에 표시되도록 강제
  '--window-position=0,0',
  '--window-size=1280,900',
]

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// ── 타이밍 (안티-탐지) ──
export const TIMING = {
  /** 타이핑 딜레이 (ms/자) — 너무 빠른 타이핑 방지 */
  typingDelay: 70,
  /** 주요 액션 간 기본 대기 (ms) */
  actionDelay: 3000,
  /** 페이지 로드 후 추가 안정 대기 (ms) */
  pageStabilize: 3000,
  /** 이미지 업로드 완료 대기 timeout (ms) */
  imageUploadTimeout: 20000,
  /** 발행 후 네비게이션 timeout (ms) */
  publishTimeout: 30000,
  /** 실행 시작 전 최대 랜덤 지연 (ms) — ±5분 */
  startJitter: 5 * 60 * 1000,
} as const

// ── 유틸 ──
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export function randomDelay(baseMs: number, minFactor = 0.8, maxFactor = 1.5): number {
  return Math.floor(baseMs * (minFactor + Math.random() * (maxFactor - minFactor)))
}

export function kstNow(): string {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}

export function kstDateString(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}
