// 거울 보드 카드 정의 — 전체 백로그(5분류).
// 원칙: "카드 목록"은 손 정의(거의 불변), "카드 상태(컬럼)"는 probe가 자동 판정(안 썩음).
// probe 있는 카드 = 자동 판정 / probe 없는 정적 카드 = baseCategory 고정(미래 작업은 시작되면 probe 부착).
import type { CardProbeResults, Column } from '../probes/probe.types.js'

export interface Card {
  id: string
  title: string
  track: 'T1-검증' | 'T2-성능' | 'T3-봇'
  /** 5분류 컬럼. probe 없으면 이 값이 그대로 표시됨 */
  baseCategory: Column
  probes?: { git?: string; ci?: string; http?: string[]; db?: { label: string; sql: string } }
  /** probe 가정이 마지막으로 사람에 의해 검증된 날(YYYY-MM-DD). 90일 초과 시 메타-stale 경고 */
  probeReviewedAt: string
  note?: string
  /** probe 결과 → 컬럼 판정. 없으면 baseCategory 고정(정적 카드) */
  decide?: (r: CardProbeResults) => { column: Column; label: string }
}

const SITE = 'https://age-doesnt-matter.com'
const REVIEWED = '2026-06-04'

/** 정적 카드(probe 없음) 헬퍼 */
function s(id: string, title: string, track: Card['track'], baseCategory: Column, note?: string): Card {
  return { id, title, track, baseCategory, probeReviewedAt: REVIEWED, note }
}

/** git 커밋 + CI 공통 판정 → 배포완료·적용확인 (DB 증명은 각 카드 decide에서 완료됨으로 승격) */
function decideGitCi(r: CardProbeResults, reviewLabel: string): { column: Column; label: string } {
  const g = r.git
  const c = r.ci
  if (!g || g.ok === null) return { column: '배포완료-적용확인', label: '⚠️ git 판정불가' }
  if (g.ok === false) return { column: '배포완료-적용확인', label: '커밋 미반영' }
  if (!c) return { column: '배포완료-적용확인', label: reviewLabel }
  if (c.ok === false) return { column: '지금가능', label: 'CI 실패 — 확인 필요' }
  if (c.ok === null) return { column: '배포완료-적용확인', label: `${reviewLabel} (CI 판정불가)` }
  return { column: '배포완료-적용확인', label: reviewLabel }
}

/** CI 워크플로우 건강도 → 정상이면 배포완료·적용확인(관찰중), 실패면 지금가능(확인필요) */
function decideCi(r: CardProbeResults, okLabel: string): { column: Column; label: string } {
  const c = r.ci
  if (!c || c.ok === null) return { column: '배포완료-적용확인', label: '⚠️ CI 판정불가' }
  if (c.ok === false) return { column: '지금가능', label: '워크플로우 실패 — 확인 필요' }
  const ok = String(c.detail.successCount ?? '?')
  const n = String(c.detail.sampleSize ?? '?')
  return { column: '배포완료-적용확인', label: `${okLabel} (${ok}/${n} success)` }
}

export const CARDS: Card[] = [
  // ═══════════ probe 카드 (자동 판정) ═══════════
  {
    id: 'C-MAGJOB-BLOCK',
    title: 'MAGAZINE/JOB 봇 engagement 차단',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: {
      git: 'e01ed14',
      ci: 'CI (Smart QA)',
      db: {
        label: 'magazine/job bot engagement after block',
        sql: `SELECT (
          SELECT count(*)::int
          FROM "Comment" c
          JOIN "Post" p ON p.id = c."postId"
          JOIN "User" u ON u.id = c."authorId"
          WHERE p."boardType" IN ('MAGAZINE','JOB')
            AND c."createdAt" > '2026-06-04T08:25:00Z'
            AND (u.email LIKE '%@unao.bot%' OR u.email LIKE '%bot%')
        ) + (
          SELECT count(*)::int
          FROM "Like" l
          JOIN "Post" p ON p.id = l."postId"
          JOIN "User" u ON u.id = l."userId"
          WHERE p."boardType" IN ('MAGAZINE','JOB')
            AND l."createdAt" > '2026-06-04T08:25:00Z'
            AND (u.email LIKE '%@unao.bot%' OR u.email LIKE '%bot%')
        ) AS n`,
      },
    },
    probeReviewedAt: REVIEWED,
    note: '차단 후 MAG/JOB BOT 댓글·좋아요 0건이면 완료. 사람 댓글은 정책상 허용.',
    decide: (r) => {
      const db = r.db
      if (!db || db.ok === null) return decideGitCi(r, 'DB 검증 대기 — MAG/JOB BOT 0건 확인 필요')
      const n = Number(db.detail.count ?? 0)
      if (n === 0) return { column: '완료됨', label: '신규 MAG/JOB 봇 engagement 0건 — 차단 확인' }
      return { column: '지금가능', label: `신규 MAG/JOB 봇 engagement ${n}건 — 즉시 확인 필요` }
    },
  },
  {
    id: 'C-SHEET-V15',
    title: 'SHEET v1.5 댓글 품질(source-only fact 차단)',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: { git: 'd1861dd', ci: 'CI (Smart QA)' },
    probeReviewedAt: REVIEWED,
    note: 'DB proof(후속): 신규 SHEET 댓글 source-only fact 0건',
    decide: (r) => decideGitCi(r, '신규 SHEET 글 댓글 검증 대기'),
  },
  {
    id: 'C-EVENTLOG-V1',
    title: '고객 참여 이벤트 측정 v1',
    track: 'T1-검증',
    baseCategory: '배포완료-적용확인',
    probes: {
      git: 'edc3f36',
      ci: 'CI (Smart QA)',
      db: {
        label: 'post_cta_clicked/scrap/share/comment_create',
        sql: `SELECT count(*)::int AS n FROM "EventLog" WHERE "eventName" IN ('post_cta_clicked','scrap','share','comment_create') AND "createdAt" > '2026-06-04T08:00:00Z'`,
      },
    },
    probeReviewedAt: REVIEWED,
    note: '회원 참여 이벤트. 비회원 댓글(GuestCommentInput)은 측정 누락 — 사각지대 발견됨',
    decide: (r) => {
      const db = r.db
      if (!db || db.ok === null) return decideGitCi(r, 'EventLog 데이터 축적 대기 (DB 미연결)')
      const n = Number(db.detail.count ?? 0)
      if (n === 0) return { column: '배포완료-적용확인', label: '⚠️ 측정 이벤트 0건 — 회원 행동 없음 + 비회원 미측정' }
      return { column: '완료됨', label: `측정 작동 확인 — CTA/scrap/share/comment ${n}건 수집` }
    },
  },
  {
    id: 'C-AGENT-DB-SATURATION',
    title: 'Agent DB 포화 재발 방지(운영 관찰)',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: { ci: 'Agents — Cafe Comment Wave' },
    probeReviewedAt: REVIEWED,
    note: '대표 워크플로우: Cafe Comment Wave(5분 간격). 실패 시 DB 포화/연결 재점검',
    decide: (r) => decideCi(r, '운영 정상 관찰중'),
  },
  {
    id: 'C-CAFE-WAVE',
    title: 'Cafe Comment Wave 안정성',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: { ci: 'Agents — Cafe Comment Wave' },
    probeReviewedAt: REVIEWED,
    note: 'success + EMAXCONN/timeout 없음',
    decide: (r) => decideCi(r, '안정 가동중'),
  },
  {
    id: 'C-CAFE-CURATION',
    title: 'Cafe Hourly Curation 안정성',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: { ci: 'Agents — Cafe Hourly Curation (08:20~01:15 KST, 45분 간격, 100건/일)' },
    probeReviewedAt: REVIEWED,
    note: 'success, 실패/timeout 없음',
    decide: (r) => decideCi(r, '안정 가동중'),
  },
  {
    id: 'C-PREWARM',
    title: 'Prewarm Detail Pages',
    track: 'T2-성능',
    baseCategory: '배포완료-적용확인',
    probes: { ci: 'Prewarm Detail Pages' },
    probeReviewedAt: REVIEWED,
    note: 'skip 없이 success, failed:0',
    decide: (r) => decideCi(r, '자동 실행 정상'),
  },
  {
    id: 'C-OPS-DAILY',
    title: 'Ops Daily Report',
    track: 'T1-검증',
    baseCategory: '배포완료-적용확인',
    probes: { ci: 'Ops — Daily Report' },
    probeReviewedAt: REVIEWED,
    note: '08:30 KST summary/artifact 생성',
    decide: (r) => decideCi(r, '정기 실행 정상'),
  },
  {
    id: 'C-SPEED-CACHE',
    title: '속도/캐시 상태(주요 페이지)',
    track: 'T2-성능',
    baseCategory: '지금가능',
    probes: { http: ['/', '/best', '/community/stories', '/magazine', '/jobs', '/login'].map((p) => SITE + p) },
    probeReviewedAt: REVIEWED,
    note: 'x-vercel-cache HIT/MISS + 상태코드 실측',
    decide: (r) => {
      const hs = r.http ?? []
      if (hs.length === 0) return { column: '지금가능', label: 'http probe 없음' }
      const nullCount = hs.filter((h) => h.ok === null).length
      const failCount = hs.filter((h) => h.ok === false).length
      const edgeCacheCount = hs.filter((h) => h.detail.cache === 'HIT' || h.detail.cache === 'STALE').length
      if (nullCount === hs.length) return { column: '지금가능', label: '⚠️ 전부 판정불가' }
      if (failCount > 0) return { column: '지금가능', label: `${failCount}개 페이지 비정상(4xx/5xx)` }
      return { column: '배포완료-적용확인', label: `${hs.length}개 정상 · CDN 캐시(HIT/STALE) ${edgeCacheCount}개` }
    },
  },

  // ═══════════ 완료됨 (정적) ═══════════
  s('C-WAVE-V2', 'USER Wave Engine v2', 'T1-검증', '완료됨', 'wave1~5 E2E PASS'),
  s('C-WAVE-ANCHOR', 'USER wave anchor 반복 방지', 'T1-검증', '완료됨', '신규 USER 글 anchor 반복 0건'),
  s('C-SEED-RETIRE', 'seed bot 글쓰기 retired', 'T3-봇', '완료됨', 'seed bot 신규 글쓰기 경로 종료 (9c98ad7)'),
  s('C-AZBA-LIFE2', 'P1-1B AZ/BA LIFE2 (종료)', 'T3-봇', '완료됨', 'seed bot 글쓰기 retired로 검증 대상 사라짐'),
  s('C-CURATOR-NICK', 'curator suffix 닉네임 재발 방지', 'T3-봇', '완료됨', 'suffix 계정 0건, 새 닉네임 반영'),
  s('C-POSTCTA-CTA', 'PostCTA 가입/앱 설치 CTA', 'T2-성능', '완료됨', '비회원/로그인 모바일 조건별 표시'),
  s('C-POSTCTA-CHIP', 'PostCTA/홈 chip 가+ 반응', 'T2-성능', '완료됨', '창업자 눈검수 완료'),
  s('C-HOME-FEEDLINE', '홈 3개 피드 하단선 인터랙션', 'T2-성능', '완료됨', '창업자 눈검수 완료'),
  s('C-NAVER-BLOG-RETIRE', 'Naver blog 자동화 폐기', 'T3-봇', '완료됨', 'Gemini 구독 종료 반영 (bdc673f)'),
  s('C-MAGAZINE-CHATGPT', '매거진 이미지 엔진 ChatGPT 전환', 'T3-봇', '완료됨', 'SingletonLock 근본 해결 (d734893)'),
  s('C-JOBS-SEO', '지역 일자리 SEO 랜딩', 'T2-성능', '완료됨', '/jobs/region/[시도] 17개 (0ea2008)'),
  s('C-COMM-DUP-URL', '커뮤니티 중복 목록 URL 리다이렉트', 'T2-성능', '완료됨', '중복 URL 정리 (614e579)'),

  // ═══════════ 배포완료·적용확인 (정적 — probe 없는 수동 검증) ═══════════
  s('C-GUEST-COMMENT-UX', '비회원 댓글 UX v1', 'T2-성능', '배포완료-적용확인', 'E2E: 비회원 모바일 댓글 작성 → 등록 성공 + 가입 유도 카드'),
  s('C-POSTCTA-CLICK', 'PostCTA 클릭/가입 시작', 'T2-성능', '배포완료-적용확인', '비회원 CTA 클릭 → 카카오 이동 전 내부 지연 없음'),
  s('C-WRITE-SPEED', '글쓰기 진입 속도', 'T2-성능', '배포완료-적용확인', '로그인 후 /community/write 진입 지연 완화 (7448ba6)'),

  // ═══════════ 지금 가능 (정적 — read-only 검증 작업) ═══════════
  s('C-KAKAO-SIGNUP-SPEED', '카카오 가입 시작 속도 진단', 'T1-검증', '완료됨', '진단완료(2026-06-07): 3진입점(LoginForm/PostCTA/KakaoSignupButton) 트래킹 fire-and-forget+setTimeout(0) → 카카오 이동 블로킹 없음. 후속 불필요'),
  s('C-WRITE-SPEED-2', '글쓰기 속도 2차 진단', 'T1-검증', '완료됨', '진단완료: 진입/draft/editor/제출 정상(a654b04·7448ba6). 잔여=이미지/동영상 업로드 병목 → 백로그 분리'),
  s('C-MAG-JOB-SPEED', '/magazine·/jobs 속도 재측정', 'T1-검증', '완료됨', '측정완료(2026-06-07): magazine 0.89s(MISS)·jobs region 0.58s(PRERENDER)·목록 STALE 0.26s'),
  s('C-DETAIL-SPEED', '게시글 상세 속도 재측정', 'T1-검증', '완료됨', '측정완료: 개별글 MISS 1.19s vs 목록 0.26s. MISS 절감은 C-BL-DETAIL-MISS 백로그'),
  s('C-LIGHTHOUSE', 'Lighthouse 접근성 진단', 'T1-검증', '완료됨', '진단완료: 홈 a11y 96점, target-size 위반없음(52px준수). color-contrast 1종(caption text-primary-text 3.45:1<4.5) → 개선 백로그 분리'),
  s('C-SEO-CHECK', 'SEO/Search Advisor 점검', 'T1-검증', '완료됨', 'sitemap/robots 정상, jobs canonical 상대→절대경로 수정 완료. 네이버 Search Advisor는 창업자 토큰(B-20260530-012)'),
  s('C-ROADMAP-DOC', '로드맵 문서 재작성', 'T1-검증', '완료됨', 'project_roadmap.md 운영판 재작성(2026-06-07): P1리텐션(고객분석46명)/P2성능/P3봇 + board 카드ID 연계 + 6월 완료이력'),
  s('C-DIRTY-FILES', 'dirty 파일 정리', 'T1-검증', '완료됨', 'agents/scripts/_*.ts gitignore(측정 5개 보존)+진단 19개 삭제, docs/analysis 보존 완료'),
  s('C-WORKTREE-SETUP', '병렬 세션 worktree 세팅', 'T1-검증', '백로그', '보류(2026-06-07): 현재 단일 작업 흐름이라 불필요. 멀티 AI 세션(Claude+Codex 동시) 시작 시 생성'),

  // ═══════════ 백로그 — 고객 임팩트/리텐션 순 (정적) ═══════════
  s('C-BL-READ-FUNNEL', '가입 전 정독 동선 강화', 'T2-성능', '백로그', '비회원에게 좋은 글 노출→가입 유도. 정독자 재방문 100% vs 미정독 14% 근거(고객분석 46명). 리텐션 P1 최우선'),
  s('C-BL-FIRST-ACTION', '첫 활동 유도 강화', 'T2-성능', '백로그', '첫 댓글/공감/저장 유도 UX → 가입 후 첫 활동률 상승'),
  s('C-BL-GUEST-CONVERT', '비회원 댓글 → 가입 전환 측정', 'T1-검증', '백로그', '댓글 성공 후 가입 funnel 연결'),
  s('C-BL-CTA-MISSING', 'PostCTA 클릭 누락 원인', 'T1-검증', '완료됨', '진단완료(2026-06-07): 유실 가능지점 ①rate limit 30/분 공유버킷(events route:30, page_view 합산→cta 429 유실 유력) ②sendBeacon text/plain ③isBot 오분류시 리포트 제외. 조치=C-BL-CTA-FIX'),
  s('C-BL-CTA-FIX', 'PostCTA 이벤트 유실 방지', 'T1-검증', '완료됨', '코드조치 완료(2026-06-07): 전환이벤트(post_cta_clicked/sign_up/signup_step) rate limit 면제 + sendBeacon Blob(application/json). 유실률 정밀검증은 EventLog DB(role 후)'),
  s('C-BL-REAL-FILTER', '실제 고객 기준 필터', 'T1-검증', '완료됨', '검증(2026-06-07): admin 웹/OKR(UV·PV·가입·monthlySignups)·members·insights 봇필터 완비. 슬랙 총유저 2곳(slack-commands+slack-commander) 봇제외 보강. 잔여=기준통일은 C-BL-FILTER-UNIFY'),
  s('C-BL-FILTER-UNIFY', '봇 제외 기준 통일', 'T1-검증', '백로그', '파일별 상이(isRealUser 순수숫자 vs @unao.bot vs seed_) → 헬퍼로 통일. agents 내부분석(journey-analyzer·user-deep-analysis) 봇필터도 점검'),
  s('C-BL-GUEST-READ', '비회원 글 읽기 측정', 'T1-검증', '백로그', '익명 식별자 + PostView schema → 비회원 readPercent'),
  s('C-BL-DETAIL-MISS', '게시글 상세 첫 요청 MISS 비용 절감', 'T2-성능', '백로그', 'auth 개인화 분리/API화 → 상세 TTFB 안정'),
  s('C-BL-LIST-STATIC', '목록 정적화 확장', 'T2-성능', '백로그', '/community, /magazine, /jobs 정적화'),
  s('C-BL-WRITE-UPLOAD', '글쓰기 동영상 업로드 타임아웃', 'T2-성능', '완료됨', '동영상 메타 await 5초 타임아웃 추가(무한대기 방지, TipTapEditor.tsx:454). 2026-06-07'),
  s('C-BL-IMG-PARALLEL', '글쓰기 이미지 업로드 병렬화', 'T2-성능', '백로그', 'presign Promise.all 병렬화(TipTapEditor.tsx:368) — editor 삽입 순서/progress state 충돌 리스크로 careful 작업'),
  s('C-BL-A11Y-CONTRAST', '접근성 대비 개선', 'T2-성능', '완료됨', 'caption 칩/배지 12곳 text-primary-text→#B23B2E(대비 5.4:1, 전역 톤 유지). 2026-06-07'),
  s('C-BL-WRITE-UX2', '글쓰기 UX/속도 2차', 'T2-성능', '백로그', '에디터 chunk/upload/submit 개선'),
  s('C-BL-SHEET-NGRAM', 'SHEET 말투/어미 반복 개선 v2', 'T3-봇', '백로그', 'n-gram 반복 guard → "근데 솔직히/했어" 감소'),
  s('C-BL-SHEET-HALLU', 'SHEET 순수 hallucination 방지', 'T3-봇', '백로그', 'source/본문 둘 다 없는 창작 사실 검출'),
  s('C-BL-IMG-COMMENT', '이미지/초단문 글 댓글 정책 강화', 'T3-봇', '백로그', 'source 신뢰도 낮은 글 skip/저강도 댓글'),
  s('C-BL-OPS-REPORT-V2', '운영 리포트 v2', 'T1-검증', '백로그', '댓글 품질/source 품질/FAILED 리포트 확장'),
  s('C-BL-TWA-AB', 'TWA 첫 진입 A/B 테스트', 'T2-성능', '백로그', '실험 지표 정의 → 가입률/재방문'),
  s('C-BL-AB-ADMIN', 'A/B 테스트 어드민', 'T2-성능', '백로그', '실험 상태/결과 관리 → 실험 누락 방지'),
  s('C-BL-COMMENT-CACHE', '댓글 per-user cache 분리', 'T2-성능', '백로그', '댓글 목록 캐시와 개인 상태 분리 → 인기글 DB 부하 감소'),
  s('C-BL-PERSONA-2', '페르소나 2차 정비 (후순위)', 'T3-봇', '백로그', 'STORY 편중/성별/중복 정리 (품질 악화 시 재개)'),
  s('C-BL-NAVER-SEO', 'Naver Search Advisor 운영 점검', 'T1-검증', '백로그', '검색 노출/색인 상태'),
  s('C-BL-SCRAPER-QUALITY', '스크래퍼 sourceSite 품질 리포트', 'T3-봇', '백로그', 'source별 발행/댓글 품질 집계'),

  // ═══════════ 제외/무시 (정적) ═══════════
  s('C-X-KAKAO-SHARE-P0', '카카오 공유 P0', 'T2-성능', '제외', '현재 우선순위 아님 — 명시 재개 요청 시만'),
  s('C-X-HOME-MANUAL', '홈 편성 수동 조정 MVP', 'T2-성능', '제외', '창업자 지시로 무시'),
  s('C-X-SEED-NEW-POST', 'seed bot 신규 글쓰기', 'T3-봇', '제외', 'retired 완료 — 재개하지 않음'),
  s('C-X-AZBA-VERIFY', 'P1-1B AZ/BA 신규 글 검증', 'T3-봇', '제외', 'seed bot 글쓰기 종료로 대상 없음'),
  s('C-X-MAGJOB-HUMAN', 'MAGAZINE/JOB 사람 댓글 차단', 'T3-봇', '제외', '사람 댓글은 유지 정책 — 막지 않음'),
  s('C-X-BOT-COMMENT-DEL', 'MAGAZINE/JOB 기존 봇 댓글 일괄 삭제', 'T3-봇', '제외', '이번 정책은 신규 유입 차단만 — 별도 승인 시'),
  s('C-X-AWKWARD-DEL', '기존 어색한 봇 댓글 삭제/숨김', 'T3-봇', '제외', '삭제는 운영 리스크 — 별도 정책 승인 시'),
  s('C-X-PERSONA-DIST', 'STORY 편중/성별 분포/중복 페르소나', 'T3-봇', '제외', '고객 체감 P0 아님 — 품질 악화 시 재개'),
  s('C-X-SPA', '전체 SPA 전환', 'T2-성능', '제외', 'SEO/초기 로딩 악화 — 하지 않음'),
  s('C-X-AUTH-REMOVE', 'auth 완전 제거', 'T2-성능', '제외', '권한/개인화 손상 — 하지 않음'),
  s('C-X-RAW-SQL', 'DB raw SQL 운영 수정', 'T1-검증', '제외', '프로젝트 원칙상 금지 — Prisma/정식 migration만'),
]
