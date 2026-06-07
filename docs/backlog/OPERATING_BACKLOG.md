# 운영 백로그

마지막 업데이트: 2026-06-07 KST

## 문서 목적

이 문서는 "우리 나이가 어때서"의 운영 백로그다.
단순 작업 목록이 아니라, 각 작업의 목적, 목표, 배경, 현재 상태, 하지 말아야 할 것, 시작 조건, 다음 액션을 함께 기록한다.

앞으로 "B-20260530-002 하자"처럼 ID로 작업을 부르면, 이 문서를 먼저 보고 왜 하는 일인지와 어디까지 해야 하는지 확인한다.

## 상태 기준

- Backlog: 중요하지만 아직 구현 준비가 안 됨
- Ready for Diagnosis: read-only 진단 가능
- Ready for Build: 구현 범위와 검증 기준 확정
- Waiting: 시간, 데이터, 외부 결과, 선행 작업 대기
- Doing: 한 agent가 진행 중
- Done: 배포 및 검증 완료
- Archived: 폐기, 대체, 장기 보류

## 우선순위 기준

- P0: 현재 운영 안정성. 새 제품 작업보다 우선
- P1: 성장, 신뢰, 참여에 직접 영향이 큰 작업
- P2: 운영 효율, 모니터링, 구조 개선
- P3: 문서화, 정리, 낮은 긴급도 작업

## 현재 운영 게이트

- 게이트: 없음 — cap=8 wave 검증 게이트는 2026-06-01 Wave Engine v2 E2E PASS로 **해소됨**.
- 현재 운영 방식: 자율 위임(`.claude/rules/autonomy.md`) — 모든 작업을 AUTO / HANDOFF / WAIT로 자가 분류해 진행.
- 여전히 승인 후(HANDOFF/WAIT): generator·wave 로직 변경, persona pool 확장, auth/prisma/CI 변경, DB write.
- 운영 메모: SHEET 댓글 품질(B-20260530-002)과 스크래퍼 신규 소스(오늘의유머/네이트판/네이버카페/82cook) 품질은 source별 감사(B-20260530-017)와 함께 본다.

---

## B-20260602-P0PERF - CDN 정적화 성능 최적화 (완료)

- Priority: P0
- Status: Done
- Owner: Claude Code
- 목적: Vercel CDN `x-vercel-cache: MISS` → `HIT` 전환으로 TTFB 280~660ms → 50ms 이하 달성.
- 목표: 홈(`/`) 및 로그인(`/login`) 페이지 정적화. CDN HIT 운영 검증.
- 배경: root layout `headers()`/`cookies()` + auth island 4개 + 페이지별 `force-dynamic`/`auth()` 호출이 서비스 전 페이지를 force-dynamic으로 만들어 CDN HTML 캐시 불가 상태였음.
- 완료 내역:
  - 1단계: `likes.ts` round-trip 1회 제거 (`b62a547`), root layout `headers()`/`cookies()` 제거 (`16012d1`), middleware Set-Cookie 제거 (`aeeab40`)
  - 2단계: auth island 4개(AuthNavTop/AuthFAB/AuthBanners/TopPromoBanner) 제거 + useSession 기반 전환 (`7610eb4`)
  - 3단계 QW-1: `/login` 정적화 — await searchParams → LoginForm useSearchParams() (`9aee463`)
  - 3단계 M-1: `/` 홈 정적화 — force-dynamic 제거 + auth() wrapper 4개 → useSession() 전환 (`7aad5cb`)
- 운영 검증 (2026-06-02):
  - `/login` → `x-vercel-cache: HIT` ✅
  - `/` → `x-vercel-cache: HIT` ✅ (2회차 확인)
  - `/terms`, `/privacy`, `/rules` → HIT ✅
- 부대 상태:
  - MyActivity 홈 카드 임시 비노출 (파일 보존, `/api/home/counts` 신설 시 복원 가능)
- 보류 (후속 스프린트):
  - `/best`: await searchParams → /api/best route 신설 필요 (현재 금지 조건)
  - `/magazine`, `/jobs`: force-dynamic + searchParams 이중 blocker, 대규모 재설계 필요
  - `/community/*`: 목록 force-dynamic + searchParams, 상세 page.tsx 자체 auth() 호출
- 홈 리스트 카드 hover 인터랙션 완료:
  - TrendingSection/StoriesSection/HumorSection — 코랄 배경·제목 색·화살표 (`a130739`)
  - 순수 Tailwind CSS. / Static·CDN HIT 유지 확인. use client·JS 추가 없음
- 마지막 업데이트: 2026-06-02

---

## B-20260530-001 - cap=8 댓글 wave 검증

- Priority: P0
- Status: Waiting
- Owner: Claude Code read-only 검증, Codex 운영 판정
- 목적: `BOT_DAILY_COMMENT_CAP` 3→8 상향이 BOT+cafePostId 댓글 부족을 실제로 해결하는지 확인한다.
- 목표: WAVE_PROCESS_V2 충족률 85~90% 이상 유지, 의미 있는 `bot_cap` 재발 없음, 특정 persona 과사용 없음.
- 배경: 12:15 KST 1차 검증은 성공적이었지만, 14:30 KST 검증에서 wave3/wave4에 `bot_cap`이 다시 나타났다.
- AS-IS: cap=8 배포 완료. wave1/wave2는 대부분 정상. wave3/wave4와 저녁 피크, 24h 누적 검증이 남았다.
- 문제정의: 직접 병목은 개선됐지만, 하루 누적 운영에서 후반 wave가 persona cap을 다시 소진할 수 있다.
- TO-BE: 24h 데이터로 cap=8 유지, 조정, 또는 구조 개선 필요 여부를 판단한다.
- 하지 말 것: 24h 검증 전 cap 추가 상향/하향, persona pool 확장, wave target 변경, comment-activator 수정 금지.
- 선행 조건: 20:30 KST 저녁 피크 검증, 2026-05-31 08:30~12:00 KST 24h 검증.
- 다음 액션: 20:30 KST read-only 검증. waveNum별, skippedReasons별, persona 사용량별로 본다.
- 검증 기준: WAVE_PROCESS_V2 status, target/actual, skippedReasons, BOT+cafePostId commentCount, due queue delay, persona usage.
- 관련: `agents/cafe/wave-processor.ts`, `CommentWaveQueue`, `BotLog.action=WAVE_PROCESS_V2`
- 마지막 업데이트: 2026-05-30

## B-20260530-002 - SHEET 댓글 AI티 개선

- Priority: P1-1
- Status: Backlog
- Owner: TBD
- 목적: 스크래퍼/SHEET 댓글이 실제 사람의 참여처럼 보여 커뮤니티 신뢰를 유지한다.
- 목표: 같은 글의 댓글들이 동일 키워드나 동일 소재에 몰리지 않고, 원본 댓글의 다양한 관점을 반영한다.
- 배경: 스크래퍼 글에는 댓글과 좋아요가 붙지만, 댓글들이 같은 핵심 표현을 반복해 AI티가 난다는 운영 관찰이 있었다. 2026-05-30 저녁 스크래퍼 입력 소스에 오늘의 유머, 네이트판, 네이버 카페, 82cook 링크가 추가됐다.
- AS-IS: Shadow Mode가 준비되어 있다. `generateSheetViralComment`, keyTerms 검증, sourceComments 활용 방식이 댓글 소재 수렴을 만들 가능성이 있다. 입력 소스가 늘어났으므로 source별 댓글 톤/품질 차이도 함께 확인해야 한다.
- 문제정의: 수량 문제가 아니라 품질/신뢰 문제다.
- TO-BE: sourceComments를 각도 anchor로 쓰고, keyTerms 강제 수렴을 줄이며, Shadow Mode에서 비교 후 반영한다.
- 하지 말 것: 댓글 target 수 증가로 해결하려 하지 말 것. read-only 품질 감사 전 generator 수정 금지. DB에 테스트 댓글 write 금지.
- 선행 조건: cap=8 운영이 심각하게 흔들리지 않을 것.
- 다음 액션: SHEET 글 5개 이상을 골라 sourceCommentsRaw, 필터 후 sourceComments, 실제 생성 댓글의 반복 소재와 표현을 비교하는 read-only 감사. 가능하면 오늘의 유머, 네이트판, 네이버 카페, 82cook source를 각각 포함한다.
- 검증 기준: Shadow Mode 전후 비교, 반복 소재 감소, source별 댓글 톤 차이 확인, 필터/욕설/광고 안전성 회귀 없음.
- 관련: `agents/seed/generator.ts`, `agents/scripts/_shadow-comment-pack.ts`, SHEET BotLog details
- 마지막 업데이트: 2026-05-30

## B-20260530-003 - 게시글 하단 PostCTA 가입/앱 설치 유도

- Priority: P1-2
- Status: Backlog
- Owner: TBD
- 목적: 게시글을 읽은 고의도 사용자를 가입 또는 앱 설치로 전환한다.
- 목표: 비회원 글 상세 방문→카카오 가입, 웹 회원→Play Store/TWA 앱 설치 유입을 측정하고 개선한다.
- 배경: 사용자가 글을 읽고 떠나는 순간에 다음 행동 유도 장치가 약하다. SignupPromptBanner는 지연/세션 제한으로 글 본문 직후 순간을 놓칠 수 있다.
- AS-IS: 댓글 직전 전용 CTA가 없다. TWA/web/member/guest 분기와 EventLog/GA4 추적 상태는 먼저 확인해야 한다.
- 문제정의: 단순 카드 추가가 아니라 측정 가능한 전환 실험이다.
- TO-BE: 비회원, 웹 회원, TWA 사용자 상태별 CTA 분기와 노출/클릭/전환 이벤트를 함께 설계한다.
- 하지 말 것: 이벤트 없이 카드만 추가하지 말 것. 비회원 참여를 해칠 만큼 가입 압박을 강하게 만들지 말 것.
- 선행 조건: TWA/EventLog/GA4 측정 AS-IS 감사.
- 다음 액션: 측정 감사 후 PostCTA 실험 설계.
- 검증 기준: CTA 노출수, 클릭률, 가입 전환, Play Store 클릭, TWA 미노출, 댓글 전 레이아웃 회귀 없음.
- 관련: 게시글 상세 페이지, `useAppEnvironment`, Kakao signup button, EventLog/GA4
- 마지막 업데이트: 2026-05-30

## B-20260530-004 - TWA/EventLog/GA4 측정 AS-IS 감사

- Priority: P1-3
- Status: Backlog
- Owner: TBD
- 목적: 웹, TWA, 비회원, 회원 행동을 신뢰도 있게 구분할 수 있는지 확인한다.
- 목표: PostCTA와 OKR 실험 전, 현재 무엇이 기록되고 무엇이 빠졌는지 확정한다.
- 배경: 기존 문서가 충돌한다. 일부는 TWA browser_env/UTM이 이미 구현됐다고 하고, 오래된 문서는 누락이라고 한다.
- AS-IS: 코드에는 TWA 관련 helper가 있는 것으로 보이나, 실제 EventLog/GA4 payload는 검증이 필요하다.
- 문제정의: 상충 문서 때문에 바로 구현하면 오진 가능성이 크다.
- TO-BE: page_view, login, signup, CTA 노출/클릭, platform, referrer, TWA 감지에 대한 추적 맵을 확정한다.
- 하지 말 것: JSON `properties`로 충분한지 확인하기 전 DB migration 금지. raw SQL 금지.
- 선행 조건: 없음. read-only로 언제든 가능.
- 다음 액션: `gtm.ts`, `track.ts`, `PageViewTracker`, EventLog schema, 최근 EventLog properties를 Prisma read-only로 확인.
- 검증 기준: 이벤트명, properties, platform/referrer 존재 여부, GA4 browser_env, 누락 필드 표.
- 관련: `src/lib/gtm.ts`, `src/lib/track.ts`, `src/components/common/PageViewTracker.tsx`, `EventLog`
- 마지막 업데이트: 2026-05-30

## B-20260530-005 - 비회원 댓글 UX / Turnstile 정책 재설계

- Priority: P1-4
- Status: Backlog
- Owner: TBD
- 목적: 비회원도 댓글을 더 쉽게 달 수 있게 하되, 스팸과 악성 댓글을 막는다.
- 목표: 비회원 댓글 완료율을 높이면서 신고/스팸/저품질 댓글 증가를 억제한다.
- 배경: 현재 화면은 닉네임, 비밀번호, 댓글, Cloudflare Turnstile, 카카오 시작, 비회원 작성 버튼이 함께 보여 비회원 댓글보다 카카오 유도가 더 강하게 느껴질 수 있다.
- AS-IS: 비회원 댓글 기능은 존재한다. Turnstile 검증과 닉네임/비밀번호를 사용한다. Cloudflare 위젯은 사용자에게 낯설고 큰 마찰일 수 있다.
- 문제정의: Cloudflare 제거 문제가 아니라 참여, 전환, 신뢰, 스팸 방어의 균형 문제다.
- TO-BE: 비회원 댓글 흐름을 더 명확히 하고, 위험 기반 또는 제출 시점 인증 등 점진적 방어를 검토한다.
- 하지 말 것: 대체 방어 없이 Turnstile 제거 금지. 비회원 댓글 폐쇄 금지. 카카오 강제 전환 금지.
- 선행 조건: 비회원 댓글 시작/완료, Turnstile 실패, 신고/스팸, 현재 UI 행동에 대한 read-only 감사.
- 다음 액션: guest comment funnel 진단과 옵션 비교.
- 검증 기준: guest comment start/completion, spam rate, moderation reports, signup conversion impact, mobile usability.
- 관련: `GuestCommentInput`, `guest-comments` action, Turnstile verification, comment UI
- 마지막 업데이트: 2026-05-30

## B-20260530-006 - 글쓰기 UI/UX 개선

- Priority: P1-5
- Status: Backlog
- Owner: TBD
- 목적: 실제 사용자가 글쓰기를 더 쉽게 시작하고 완료하게 만든다.
- 목표: post_create_started→post_create 전환율을 높이고, 모바일 글쓰기 이탈을 줄인다.
- 배경: 커뮤니티 성장은 결국 사용자 작성글이 늘어야 한다. 현재 글쓰기에는 임시저장, 카테고리, 제목, TipTap 에디터가 있지만 여전히 무겁거나 막막할 수 있다. 특히 이미지/동영상을 올린 뒤 커서가 매체 아래로 자연스럽게 이동하지 않으면 글을 이어 쓰는 흐름이 끊긴다.
- AS-IS: PostWriteForm은 제목, 카테고리, TipTap, draft, write funnel event를 갖고 있다. 정확한 마찰 지점은 데이터와 화면 감사가 필요하다. 이미지/동영상 삽입 후 커서 위치와 다음 문단 생성 동작도 확인해야 한다.
- 문제정의: 에디터 스타일 문제가 아니라 글쓰기 활성화 문제다.
- TO-BE: 시작 힌트, 카테고리 선택, 툴바 단순화, draft 안정감, 모바일 버튼/피드백을 개선한다. 이미지나 동영상 업로드 후에는 커서가 매체 아래 새 문단으로 이동해 사용자가 바로 글을 이어 쓸 수 있어야 한다.
- 하지 말 것: 데이터 없이 editor redesign 금지. 기존 draft 안전장치 제거 금지. desktop-first 수정 금지.
- 선행 조건: post_write_started, post_write_abandoned, post_create 분석과 화면 감사.
- 다음 액션: 글쓰기 퍼널과 UI 감사.
- 검증 기준: 글쓰기 완료율 개선, 이탈률 감소, 수정 페이지 회귀 없음, 모바일 사용성 확인. 이미지/동영상 삽입 직후 커서가 매체 아래 새 문단에 위치하고, 연속 입력이 자연스럽게 가능해야 한다.
- 관련: `PostWriteForm`, `TipTapEditor`, 글쓰기 route, post write tracking events
- 마지막 업데이트: 2026-05-30

## B-20260530-007 - SEO 메타/디스크립션 감사

- Priority: P1-6
- Status: Backlog
- Owner: TBD
- 목적: 검색 노출 페이지가 올바른 대상과 가치를 전달하도록 한다.
- 목표: 50대·60대 한국인, 특히 제품 전략상 중요한 여성 타겟을 명확히 하되 jobs/life2처럼 넓게 가야 할 페이지는 과하게 좁히지 않는다.
- 배경: 현재 메타는 50대·60대 커뮤니티 방향은 있으나, "50대·60대 여성" 메시지는 `/landing`에 가장 강하고 해당 페이지는 noindex다.
- AS-IS: 홈, 게시판, 일자리, 매거진, 게시글 상세에는 메타가 있다. 일부 정적 페이지는 약하거나 description이 없다. 게시판 description은 DB 확인이 필요하다.
- 문제정의: SEO 기반은 있으나 검색 노출 페이지의 타겟 포지셔닝이 다소 넓고 흐릴 수 있다.
- TO-BE: 페이지별 title/description/target keyword/recommendation 표를 만든다.
- 하지 말 것: 감사 전 metadata 수정 금지. 모든 페이지를 여성 전용처럼 바꾸지 말 것. noindex/index 정책 변경 금지.
- 선행 조건: 없음.
- 다음 액션: 페이지별 메타 감사표 작성.
- 검증 기준: 중복/충돌 없는 메타, canonical 정상, sitemap/robots 정상, 타겟 명확성 개선.
- 관련: `src/app/layout.tsx`, page metadata, board config descriptions, sitemap, robots
- 마지막 업데이트: 2026-05-30

## B-20260530-008 - persona 활동 AS-IS 분석

- Priority: P1-7
- Status: Backlog
- Owner: TBD
- 목적: cap=8 이후 실제 persona 사용량을 파악하고 pool/voice 전략을 결정한다.
- 목표: 과사용, 미사용, 게시판 편중, 말투 중복 persona를 찾는다.
- 배경: wave 후보 수는 DB BotUser 전체가 아니라 persona-data 기준이다. cap=8은 수량 병목을 줄이지만 persona 다양성 압박을 키울 수 있다.
- AS-IS: 후보 pool은 BotUser count가 아니라 wave-processor candidate filter 기준으로 해석해야 한다.
- 문제정의: AS-IS 없이 persona를 늘리면 비슷한 목소리만 늘어날 수 있다.
- TO-BE: 1일/7일/14일 persona 사용량, board 분포, tier 분포, style cluster를 본다.
- 하지 말 것: AS-IS 전 persona 추가 금지. DB BotUser 수를 후보 수로 착각 금지.
- 선행 조건: cap=8 24h 검증 완료 또는 안정.
- 다음 액션: comments, BotLog, posts, persona definitions 기반 read-only 분석.
- 검증 기준: 상위/하위 persona, board distribution, cap 도달 수, unused pool, 추천안.
- 관련: persona data, wave-processor filters, comments, BotLog
- 마지막 업데이트: 2026-05-30

## B-20260530-009 - wave tier/처리 순서 분석

- Priority: P2
- Status: Backlog
- Owner: TBD
- 목적: KILLER/HOT/NORMAL wave가 persona capacity를 비효율적으로 선점하는지 확인한다.
- 목표: 남은 wave3/wave4 실패가 cap, tier 우선순위, queue 순서, target 구조 중 무엇 때문인지 판단한다.
- 배경: 14:30 cap=8 검증에서 `bot_cap`이 wave3/wave4에 집중됐다.
- AS-IS: 후반 wave는 앞선 wave들이 persona cap을 소모한 뒤 실행될 수 있다.
- 문제정의: 남은 실패는 단순 cap 상향보다 배정/순서 전략 문제일 수 있다.
- TO-BE: tier target, scheduling, persona assignment 조정 필요 여부를 데이터로 판단한다.
- 하지 말 것: 24h cap 데이터 전 tier target 수정 금지. 평균 충족률만 보고 NORMAL 실패를 숨기지 말 것.
- 선행 조건: cap=8 24h 검증.
- 다음 액션: tier, waveNum, boardType, hour별 target/actual/skippedReasons read-only 분석.
- 검증 기준: 실패 집중 지도와 추천안.
- 관련: `WAVE_PROCESS_V2`, wave target logic, tier detection
- 마지막 업데이트: 2026-05-30

## B-20260530-010 - wave 모니터링 자동화

- Priority: P2
- Status: Backlog
- Owner: TBD
- 목적: 댓글 wave 상태를 매번 수동 스크립트로 진단하지 않도록 한다.
- 목표: fulfillment, failure reason, persona pressure, backlog risk를 매일 요약한다.
- 배경: 최근 디버깅은 임시 스크립트와 수동 보고에 의존했다.
- AS-IS: BotLog에는 필요한 데이터가 상당히 있으나 정기 운영 리포트가 없다.
- 문제정의: 모니터링 없이는 silent degradation이 다시 생길 수 있다.
- TO-BE: 일일 Slack 또는 admin report로 fulfillment, bot_cap, source_not_enough, due delay, persona usage를 보여준다.
- 하지 말 것: threshold 결정 전 noisy alert 생성 금지. raw SQL 금지.
- 선행 조건: cap=8/persona AS-IS 작업으로 metric 정의 안정화.
- 다음 액션: 리포트 필드와 threshold 정의.
- 검증 기준: 특정 날짜 수동 진단과 자동 리포트 결과 일치.
- 관련: BotLog, CommentWaveQueue, Slack reporting
- 마지막 업데이트: 2026-05-30

## B-20260530-011 - SHEET 파동 관측 개선 scheduler

- Priority: P2
- Status: Backlog
- Owner: TBD
- 목적: SHEET 댓글 파동 실패가 SUCCESS로 묻히지 않게 한다.
- 목표: insertedCount, targetCount, skipReasons, PARTIAL/FAILED status를 기록한다.
- 배경: `agents/seed/scheduler.ts`에 관련 modified diff가 존재하지만, BOT+cafePostId wave cap 문제와는 별개다.
- AS-IS: working tree에 scheduler 변경이 남아 있다. 다른 작업과 섞으면 안 된다.
- 문제정의: 이는 SHEET 관측/안전장치이지 BOT wave cap 해결책이 아니다.
- TO-BE: SHEET wave가 실제 삽입 결과와 실패 사유를 정직하게 남긴다.
- 하지 말 것: unrelated work와 함께 커밋 금지. BOT wave 진단 선결조건처럼 취급 금지.
- 선행 조건: 현재 diff 리뷰 및 범위 확인.
- 다음 액션: `agents/seed/scheduler.ts` diff 코드리뷰.
- 검증 기준: diff scope, typecheck, 다음 SHEET wave BotLog status/details.
- 관련: `agents/seed/scheduler.ts`, SHEET BotLog actions
- 마지막 업데이트: 2026-05-30

## B-20260530-012 - 네이버 소유확인/사이트맵 SEO

- Priority: P2
- Status: Backlog
- Owner: TBD
- 목적: 네이버 Search Advisor 소유확인과 사이트맵 상태를 확인해 브랜드 검색 안정성을 높인다.
- 목표: 현재 verification meta와 Search Advisor 요구값, sitemap 제출 상태를 확인한다.
- 배경: 오래된 기획에 naver-site-verification mismatch가 있었지만, 현재 코드 값은 달라져 있을 수 있다.
- AS-IS: `layout.tsx`에는 naver verification 값이 있다. Search Advisor의 현재 요구값은 외부 확인이 필요하다.
- 문제정의: stale plan일 수 있으므로 무작정 verification 값을 바꾸면 현재 소유확인을 깨뜨릴 수 있다.
- TO-BE: Search Advisor 소유확인과 sitemap 제출이 완료된 상태.
- 하지 말 것: 현재 Search Advisor token 확인 없이 코드 수정 금지.
- 선행 조건: 창업자가 현재 Naver Search Advisor 요구 token/status 제공.
- 다음 액션: 제공 token과 현재 코드/deployed HTML 비교.
- 검증 기준: Search Advisor ownership success, sitemap submitted, deployed meta value confirmed.
- 관련: `src/app/layout.tsx`, `sitemap.xml`, Naver Search Advisor
- 마지막 업데이트: 2026-05-30

## B-20260530-013 - 어드민 OKR/KPI 재설계

- Priority: P2
- Status: Backlog
- Owner: TBD
- 목적: 어드민 대시보드 지표를 실제 성장과 리텐션 중심으로 재정렬한다.
- 목표: 로그인 회원 중심 MAU가 아니라 UV, PV, 전환율, D7 등 방문자 기반 지표를 신뢰도 있게 본다.
- 배경: 광고와 TWA가 들어오면 비회원 visitor tracking이 중요해진다.
- AS-IS: 일부 admin OKR 작업은 이미 반영된 것으로 보이나, EventLog 신뢰도와 TWA 구분 확인이 먼저다.
- 문제정의: 측정 신뢰 없이 KPI를 바꾸면 잘못된 목표를 운영하게 된다.
- TO-BE: 실제 트래픽 품질, 전환, 리텐션, 커뮤니티 건강을 보여주는 admin KPI.
- 하지 말 것: EventLog/TWA 감사 전 OKR 공식 변경 금지. admin page merge/removal을 성급히 하지 말 것.
- 선행 조건: B-20260530-004 측정 감사.
- 다음 액션: 현재 admin KPI 코드와 데이터 정의 감사.
- 검증 기준: KPI 정의, 기간 정렬, bot/founder 제외, admin 페이지 간 숫자 일치.
- 관련: admin dashboard, analytics page, EventLog, admin query modules
- 마지막 업데이트: 2026-05-30

## B-20260530-014 - 오래된 GA4/EventLog 감사 플랜 재검증

- Priority: P2
- Status: Backlog
- Owner: TBD
- 목적: 이미 해결된 analytics 작업과 아직 남은 데이터 신뢰도 리스크를 분리한다.
- 목표: 오래된 May 플랜을 그대로 실행하지 않고, 현재 남은 문제만 추린다.
- 배경: 기존 GA4/EventLog 플랜에는 이미 구현된 항목과 아직 열린 항목이 섞여 있다.
- AS-IS: bot patterns 등 일부는 구현되어 있다. 남은 gap은 재확인이 필요하다.
- 문제정의: 누락도 위험하지만 stale plan을 다시 적용하는 것도 위험하다.
- TO-BE: 현재 기준 open/stale/done 표.
- 하지 말 것: 오래된 플랜 그대로 구현 금지. raw SQL 금지.
- 선행 조건: 없음.
- 다음 액션: 오래된 항목과 현재 코드/EventLog를 read-only 비교.
- 검증 기준: evidence가 있는 closed/open/stale table.
- 관련: bot patterns, middleware, events API, GTM, EventLog, GA4 settings
- 마지막 업데이트: 2026-05-30

## B-20260530-015 - 백로그/워크트리 정리

- Priority: P3
- Status: Backlog
- Owner: TBD
- 목적: 운영 작업을 추적 가능하게 만들고, 임시 파일이 현재 작업 판단을 흐리지 않게 한다.
- 목표: pending change를 각각 commit, archive, ignore, explicit leave 중 하나로 분류한다.
- 배경: 현재 working tree에는 여러 untracked script/assets와 삭제된 docs 파일이 있다.
- AS-IS: `agents/seed/scheduler.ts` modified, `docs/google-ads-planning.html` deleted, 다수 untracked 파일 존재.
- 문제정의: dirty worktree는 리뷰와 안전한 handoff를 어렵게 한다.
- TO-BE: 각 변경의 owner/purpose/status가 명확한 상태.
- 하지 말 것: 사용자/Claude 파일을 승인 없이 삭제하거나 되돌리지 말 것.
- 선행 조건: 긴급 운영 검증 마무리.
- 다음 액션: dirty file inventory를 owner/purpose별로 작성.
- 검증 기준: clean 또는 의도적으로 문서화된 worktree.
- 관련: git status, docs, agents scripts
- 마지막 업데이트: 2026-05-30

## B-20260530-016 - 네이버 뿜 링크 기반 스크래퍼 소스 확장

- Priority: P2
- Status: Backlog
- Owner: TBD
- 목적: 네이버 뿜 링크를 입력하면 원문 게시글과 댓글을 수집해 우나어 게시글 후보로 만들 수 있는 신규 콘텐츠 소스 가능성을 검토한다.
- 목표: 네이버 뿜을 신규 source로 사용할 수 있는지 법적/기술적/품질적으로 검증하고, 가능하다면 기존 SHEET 스크래퍼와 충돌하지 않는 수집 플로우를 설계한다.
- 배경: `https://m.bboom.naver.com/` 글은 가벼운 이슈/공감/유머 콘텐츠와 댓글이 있어 우나어의 웃음방, 사는이야기, 매거진 소재 후보가 될 수 있다. 사용자가 링크를 넣으면 게시글과 댓글을 가져와 내부 게시글로 만드는 아이디어가 제안됐다.
- AS-IS: 현재 스크래퍼는 Google Sheet 기반 source URL을 처리하고, `sourceComments`를 댓글 파동 생성에 활용한다. 네이버 카페/기타 사이트 처리 경로는 있으나 네이버 뿜 전용 파서는 확인되지 않았다.
- 문제정의: 단순히 HTML을 긁는 작업이 아니라, 소스 권리/출처/댓글 품질/중복/카테고리 매핑/봇 티 방지 정책을 먼저 정해야 한다.
- TO-BE: 네이버 뿜 링크를 read-only로 파싱해 title, content, images, sourceComments, sourceUrl, sourceType 후보를 추출하고, 발행 여부는 기존 SHEET PENDING/검수 흐름과 같은 안전장치를 탄다.
- 하지 말 것: 권리/출처 정책 확인 없이 자동 발행 금지. 네이버 로그인/쿠키 우회 수집 금지. 댓글 원문을 그대로 대량 복사 금지. 기존 SHEET 스크래퍼에 무리하게 끼워 넣기 금지.
- 선행 조건: 네이버 뿜 페이지 구조, robots/접근 가능성, 저작권/출처 표기 정책, 기존 sheet-scraper 확장 지점 read-only 확인.
- 다음 액션: 네이버 뿜 샘플 URL 3~5개를 기준으로 read-only 파싱 가능성, 댓글 수집 가능성, 이미지/본문 구조, 차단/동적 렌더링 여부를 진단한다.
- 검증 기준: 샘플별 title/content/sourceComments 추출률, 댓글 품질, 중복 위험, 카테고리 매핑 가능성, 발행 전 검수 플로우 설계안.
- 관련: `agents/community/sheet-scraper.ts`, `agents/community/site-configs.ts`, `sourceComments`, 네이버 뿜 모바일 페이지
- 마지막 업데이트: 2026-05-30

## B-20260530-017 - 스크래퍼 입력 소스별 품질 감사

- Priority: P1-8
- Status: Backlog
- Owner: TBD
- 목적: 스크래퍼에 추가된 외부 링크 소스별로 본문 품질, 댓글 품질, 발행 적합성, AI티 위험을 비교한다.
- 목표: 오늘의 유머, 네이트판, 네이버 카페, 82cook에서 들어온 글이 우나어 게시글/댓글 파동에 적합한지 판단한다.
- 배경: 2026-05-30 저녁 스크래퍼 입력에 여러 외부 소스 링크가 추가됐다. source가 다양해지면 콘텐츠 폭은 넓어지지만, 댓글 말투/수위/중복/저작권/카테고리 매핑 리스크도 함께 늘어난다.
- AS-IS: Google Sheet 기반 스크래퍼는 URL을 처리하고 `sourceComments`를 댓글 파동 생성에 활용한다. source별 품질 기준은 아직 명확히 문서화되어 있지 않다.
- 문제정의: "링크를 넣으면 발행된다"가 아니라, source별로 어떤 글과 댓글이 우나어에 맞는지 판별 기준이 필요하다.
- TO-BE: source별 발행 적합성 기준을 만든다. 예: 오늘의 유머는 웃음방 후보, 네이트판은 사는이야기/고민 후보, 네이버 카페는 기존 큐레이션 흐름, 82cook은 생활/가족/건강 후보처럼 1차 매핑을 검증한다.
- 하지 말 것: source별 품질 감사 전 자동 대량 발행 확대 금지. 원문 댓글을 그대로 복사하는 방향 금지. 수위 높은 댓글을 필터 없이 sourceComments로 쓰지 말 것.
- 선행 조건: 2026-05-30 저녁 추가 링크가 실제로 스크래퍼 처리되어 게시글/BotLog/sourceComments로 남은 뒤 확인.
- 다음 액션: 추가된 각 source에서 생성된 게시글과 sourceComments를 read-only로 샘플링해 본문 품질, 댓글 품질, 카테고리 매핑, 필터링 필요성을 표로 정리한다.
- 검증 기준: source별 게시글 발행 성공률, sourceComments 유효 개수, 필터 탈락 이유, 댓글 파동 결과, 숨김/삭제 필요 글 여부.
- 관련: Google Sheet 입력 링크, `agents/community/sheet-scraper.ts`, `sourceComments`, SHEET BotLog
- 마지막 업데이트: 2026-05-30

---

## Done — 종결 처리 (창업자 확인 완료)

> 보드(`/board`)·백로그 ID 밖에서 창업자가 직접 확인·완료한 항목. 추적 가능성을 위해 기록.

| 종결일 | 항목 | 창업자 판정 | 비고 |
|--------|------|------------|------|
| 2026-06-07 | placeholder 1건 노출 | 숨김 처리 완료 | 창업자가 직접 숨김 처리함 |
| 2026-06-07 | 광고/띠배너 어드민 QA (F10 최상단 띠배너 / F14 목록 광고 띠배너) | 문제 없음 | 어드민 통제·노출 정상 확인 |
| 2026-06-07 | Android 로그아웃 / OOM | 정상 동작 | TWA 로그아웃·메모리 이슈 재현 안 됨, 정상 |
