# Claude Foundation Reset Audit Report

작성: Claude (Foundation Reset 전용 세션) · 2026-09-05 15:30~16:00 KST
대상 독자: Codex 운영 마스터 · 창업자
성격: **READ-ONLY 감사 보고.** 이 문서는 판단 자료이며 결정은 Codex 마스터가 한다.
표기 원칙: 근거(명령·파일:라인·HTTP 응답)가 있는 것만 PASS/FAIL로 쓴다. 근거 없는 것은 "미확인"으로 쓴다. env 값·secret 원문은 어디에도 쓰지 않는다.

---

## 1. 작업 범위

| 항목 | 값 | 근거 |
|---|---|---|
| 작업 경로 | `/Users/yanadoo/Documents/unao-foundation-reset` (독립 git worktree) | `pwd`, `git worktree list` |
| 브랜치 | 감사 단계: `chore/unao-foundation-reset` → 문서 PR 단계(16:10 KST 이후): `docs/foundation-pause-automation-status` (둘 다 origin/main `02e918f2`에서 분기) | `git branch --show-current` |
| HEAD commit | `02e918f2` = origin/main (`[merge 대기] chore: production 배포 트리거 (빈 커밋) (#407)`) | `git rev-parse HEAD` = `git rev-parse origin/main` |
| read-only 여부 | 감사 단계는 전부 read-only(코드·문서·DB·워크플로우·launchd·env 무변경). Codex 판정(16:05 KST) 이후 **문서 4파일만** 변경: 이 보고서 생성 + constitution.yaml(automation_status·KPI) + REGISTRY.md 배너 + SERVICE_ARCHITECTURE.md 배너. `src/`·`scripts/`·`.github/`·`launchd/`·`prisma/` 무변경 | 감사 종료 시 `git status --short` = 0줄, PR 커밋 `git diff --stat` 4파일 |
| 코드/문서 변경 여부 | 코드 0 · 문서 4(위 행). `[merge 금지] docs(foundation): pause automation status and align rescue constitution` PR로 제출. merge는 하지 않는다 | PR 본문·`gh pr view` |
| 소란소란 접근 | 없음. `/Users/yanadoo/Documents/soransoran*` 읽기·쓰기 0회. 단 **origin/main 안에 이미 들어 있는** `docs/operations/soransoran-*.md` 4파일은 우나어 repo 문서로서 존재 여부·헤더만 확인 | §3 표 참조 |
| PR #392와의 관계 | **무관.** #392는 2026-08-19에 이미 MERGED된 ISR TTL 변경 PR이며 이 worktree의 HEAD에 포함돼 있다. 이 세션은 #392를 만들거나 수정하지 않았다 | `gh pr view 392` state=MERGED · `git log origin/main --grep 3600` → `019b47e5` |
| unao-main 상태 | 건드리지 않음. 시작 시점 untracked 39개(타 세션 산출물), 브랜치 `chore/trigger-production-deploy`. 읽기만 한 파일: `docs/operations/2026-09-05-unao-rescue-mode-master-plan.md`(미커밋, R1~R6 정의 출처) | `git status --short \| wc -l` = 39 |

---

## 2. 이번에 실제 실행한 명령

전부 read-only. 실패한 것은 그대로 적었다.

| # | 목적 | 명령(요지) | 결과 |
|---|---|---|---|
| 1 | unao-main 상태 확인 | `git worktree list`, `git status --short`, `git fetch origin main`, `git rev-list --count HEAD..origin/main` | worktree 23개, untracked 39, origin/main이 1커밋 앞섬 |
| 2 | worktree 생성 | `git worktree add -b chore/unao-foundation-reset /Users/yanadoo/Documents/unao-foundation-reset origin/main` | 성공. HEAD `02e918f2` |
| 3 | 조건 검증 | `pwd`, `git branch --show-current`, `git status --short` | 3조건 모두 충족(clean) — 작업 중 3회 재확인, 매번 0줄 |
| 4 | 문서 지형 | `find docs -type d`, 디렉터리별 파일 수, `wc`, `git log -1 --format=%as -- <dir>` | docs md 177개, 24개 하위 디렉터리, 절반이 4~6월 이후 정지 |
| 5 | 헌법 읽기 | `cat docs/constitution/NORTH_STAR.md`, `sed -n` constitution.yaml 주요 절 | §3 표 D-01~D-05 |
| 6 | REGISTRY 상태 집계 | `grep -oE 'ACTIVE\|ARCHIVED' docs/features/REGISTRY.md \| uniq -c` | ACTIVE 59 · ARCHIVED 4 · 마지막 갱신 05-14 |
| 7 | 소란소란 오염 | `git grep -il 'soransoran\|소란소란'` | 5파일, 전부 docs/operations/ |
| 8 | 브랜치·PR 위생 | `git branch -r \| wc -l`, `git branch -r --merged origin/main`, `gh pr list --state open` | 원격 283개 중 81개 병합 완료 잔존 · 열린 PR #394(소란소란 문서) 1개 |
| 9 | 병렬 감사 에이전트 8회 | Agent(general-purpose) read-only 프롬프트 | **실패 4회**(세션 rate limit 429, 14:10 KST 리셋) · 재시도 후 REGISTRY 검증 1건 회수 · 자동화·하드코딩 2건은 3회 모두 본문 없이 종료 → **직접 실측으로 대체** |
| 10 | GitHub 워크플로우 상태 | `gh workflow list --all`, `gh run list --workflow <yml> --limit 2` ×11 | active 5 / disabled_manually 21. 마지막 schedule 실행 2026-08-24 ~06:15 UTC |
| 11 | launchd 상태 | `launchctl list \| grep -iE 'unao\|unaeo'`, `ls ~/Library/LaunchAgents`, `PlistBuddy Print :WorkingDirectory` | 16개 로드. 크롤러 9개 exit 1. 전부 WorkingDirectory=`/Users/yanadoo/Documents/unao-prod` |
| 12 | launchd 로그 | `tail`/`grep -c 'Authentication failed'` on `unao-prod/logs/*.log` (secret 필터 적용) | Postgres 28P01 반복. 매거진 마지막 정상 발행 2026-08-22 |
| 13 | unao-prod 실체 | `git -C unao-prod branch/log/status`, `.env.local` **존재 여부만** | 별도 clone, main `02e918f2`, clean, `.env.local` 존재(내용 미열람) |
| 14 | 하드코딩 스캔 | `grep -r` 도메인·`process.env.X \|\|/??`·hex·localStorage 키·절대경로 | §5 |
| 15 | 스키마/입구 | `awk` schema.prisma Post/Comment/User · `sed -n 1,40p src/app/api/bot/posts/route.ts` | §5, §3 C-01~C-03 |
| 16 | 주석 vs 동작 | `sed -n` runner.ts, seed/scheduler.ts · `grep ENABLE_SEED_POSTS` · `'use client'` 훅 미사용 후보 | §5 |
| 17 | PR #392 | `gh pr view 392 --json ...`, `gh pr checks 392`, `grep 'export const revalidate'` | §6 |
| 18 | R1~R6 정의 출처 | `grep -rln 'R1-A'` worktree/unao-main/memory | unao-main 미커밋 `2026-09-05-unao-rescue-mode-master-plan.md`만 해당 |
| 19 | production 헬스 | `curl -s -H 'x-bot-type: claude-audit'` `/api/health`, `/api/health/auth`, `/api/auth/csrf`, `/api/auth/providers`, `/login`, `/admin/login`, `/community/stories` (+ 응답 헤더) | §4 |
| 20 | 어드민 영향 | `grep -rn automation_status src agents` | runner.ts:149,197 · slack-commander.ts:320 |

실행하지 않은 것: `npm install`/`npx`(worktree에 node_modules 없음) · Vercel CLI(존재하나 미실행) · Supabase 콘솔 · 로그인 POST · launchctl load/unload · gh workflow run/enable/disable · DB 쿼리 · env 값 열람.

---

## 3. 발견한 사항

위험도: P0 = 생명 기능(로그인/DB/노출면) 또는 즉시 사고 가능 · P1 = 다음 세션이 오판할 수 있는 불일치 · P2 = 정리 대상.

| ID | 영역 | 파일/경로 | 발견 내용 | 근거 | 위험도 | 마일스톤 |
|---|---|---|---|---|---|---|
| A-01 | production DB | Vercel production | `/api/health` **503** `status: degraded`, `checks.database: error`, 원문 `Raw query failed. Code: 28P01 ... password authentication failed for user "postgres"` | curl 2026-09-05 06:56 UTC, `x-vercel-cache: MISS`, version `2026.08.24-02e918f` | **P0** | R1-A |
| A-02 | 인증 관측 | `/api/health/auth` | **200이지만 캐시 응답**: `x-vercel-cache: HIT`, `age: 7532`, 본문 `ts: 2026-08-24T08:12:08Z`, `db: true` — 12일 전 값이 "DB 정상"으로 보임. 실제 DB 장애를 가린다 | curl 헤더+본문 | **P0** | R1-A, R1-D |
| A-03 | 어드민 진입 | `/admin/login` GET | 200, 페이지 본문에 `ECIRCUITBREAKER`·`28P01`·`prisma` 문자열 노출 없음(GET 기준). POST는 시도하지 않음 → 로그인 성공 여부 **미확인** | curl GET + grep | P0(미확인) | R1-A |
| A-04 | 로컬 자동화 | `~/Library/LaunchAgents/com.unao.*`, `com.unaeo.*` 16개 | 전부 로드된 채 DB 인증 실패. 크롤러 10개 exit 1(오류 로그 13~49회 = 약 2주), 매거진 2개는 exit 0이지만 `prisma.post.count` 단계에서 동일 28P01(7회/5회). 마지막 정상 발행 2026-08-22 | `launchctl list`, `unao-prod/logs/*` | **P0** | R1-A, R4 |
| A-05 | 로컬 자동화 | 동일 | production과 launchd가 **같은 원인(28P01, user postgres)**으로 동시에 죽어 있다 → DB 비밀번호/접속정보 변경이 공통 원인일 가능성. **DB 자격이 복구되면 launchd 12개가 자동으로 글쓰기를 재개한다** | A-01 + A-04 대조 | **P0** | R1-A, R4 |
| A-06 | GitHub 자동화 | `.github/workflows/` 26개 | **21개 `disabled_manually`**. 활성 5: ci · lighthouse · post-deploy-qa · quarantine-check · agents-moderation(09-05 04:25 UTC success). 정지 직전 24h는 전부 schedule success → 고장이 아니라 결정. 결정 기록 없음 | `gh workflow list --all`, `gh run list` | P1 | R4 |
| A-07 | 헌법 | `agents/core/constitution.yaml:278` | `automation_status: "ACTIVE"` — 실제(A-04·A-06)와 정반대. runner.ts:197이 `status !== 'ACTIVE'`면 모니터링 외 스킵하므로 이 값이 재가동의 스위치 | sed + grep | P1 | R4, R5 |
| A-08 | 문서 | `docs/features/REGISTRY.md` | 마지막 갱신 2026-05-14. ACTIVE 59 중 실제 OFF 6(A09·A10·A11·A20·A21·A22), ARCHIVED인데 코드 잔존 5(A07·A08·A23·A28·A99), 경로/스케줄 불일치 13, 미등록 워크플로우 12·plist 3·agents 디렉터리 5 | REGISTRY 검증 에이전트 보고(파일 존재·`on:` 블록·runner HANDLERS grep) | P1 | R4, R5 |
| D-01 | 헌법 | `constitution.yaml:270-275` | `survival_reference_only: [DAU, MAU, ...]` 선언 직후 `targets`에 `"DAU/MAU > 0.15"`, `"일자리 지원 클릭 > 50/일"` — 같은 파일 안 자기모순. `:10 updated: 2026-05-21` < NORTH_STAR v5.0(08-05) | sed | P1 | R5 |
| D-02 | 헌법 | `constitution.yaml:153, :580-581, :595` | "내 일 찾기 role: 유입 핵심" · moat "시드봇 콘텐츠 플라이휠" · "일자리 종합 플랫폼" — 에이전트 System Prompt에 주입되는 파일이 일자리 플랫폼·봇 공장 정의를 주입 중 | sed | P1 | R5 |
| D-03 | 헌법 | `docs/constitution/NORTH_STAR.md:348-353` | §13 운영 원칙 "봇은 판을 깔고… Volume(자동화) 커뮤니티 글·유머·일자리" — §12 :318 "봇 글은 North Star를 올리지 못한다"와 긴장 | cat | P1 | R5 |
| D-04 | 문서 | `docs/agents/POST_DEV_CHECKLIST.md:3,22,24,32,46-50` | "가상 유저 100명", "가스라이팅 전략", "'진짜 사람 사는 곳'처럼 보이게", "안티봇 우회", "하루 400글/600댓글 융단 폭격" — 본질 정반대 지시가 살아 있는 문서 | 문서 감사 에이전트 A 인용 | P1 | R5 |
| D-05 | 문서 | `README.md:4,13` · `docs/SERVICE_ARCHITECTURE.md:15,24` · `docs/prd/PRD_Final_A:328,333,338,462` | 서비스를 "커뮤니티 + 일자리 플랫폼", 히어로 첫 CTA "일자리 보기"로 정의 | 에이전트 A/B 인용 | P1 | R5 |
| D-06 | 문서 | `docs/operations/soransoran-*.md` 3 + `m3-new-brand-readiness.md` + `cron-job-dispatcher-ops.md:176-210` | 소란소란 문서가 우나어 origin/main에 존재. `soransoran-d7-dday-milestone.md:781` "우나어를 지금 고치는 작업 금지"가 우나어 세션 지시로 읽힐 수 있음. 열린 PR #394도 같은 계열 | `git grep`, 에이전트 A | P1 | R5 |
| D-07 | 문서 | `memory/MEMORY.md`, `memory/project_status.md` | 자가 DEPRECATED, 링크 대상 부재, "MAU 21→500" 목표 | 에이전트 A | P2 | R5 |
| D-08 | 문서 | 33파일 | 금지어(시니어·어르신·노인·실버) 실사용 — PRD_A:188,848,984 · PRD_D:435 · DESIGN.md:164 · constitution.yaml:246 `senior_ux` 키 · ui/HOME:16,1837,1849 등 | 에이전트 A/B grep | P2 | R5 |
| D-09 | 문서 | 5건 | 깨진 참조: F18:3→`docs/제안서-참여형-이벤트-리텐션-2026-07-10.html` 부재 · handoff-06-20.md:5→`verification-android-oauth-day2` 부재 · M05:14·OPERATING_MASTER_HARNESS→`OPERATING_BACKLOG.md` 경로 불일치 · OPERATING_BACKLOG.md:91→analysis 파일 부재 · memory/MEMORY.md:19-20 부재 | 에이전트 A/B `ls` | P2 | R5 |
| C-01 | 코드 | `agents/cron/runner.ts:116-117` | 주석 "launchd: com.unao.fmkorea-scraper.plist (11:30, 21:30)" — 해당 plist가 repo `launchd/`에도 `~/Library/LaunchAgents`에도 없음 | ls 양쪽 | P2 | R6-C |
| C-02 | 코드 | `runner.ts:120-123` vs `.github/workflows/agents-social.yml:144-158, 218-231` | 주석 "social-poster-visual·knowledge-responder 05-15 코드 삭제"인데 워크플로우가 그 키로 job 실행 → 핸들러 없음 | sed + grep | P2 | R6-B, R6-C |
| C-03 | 코드 | `runner.ts:104` vs `agents-daily.yml:84,218` | "cto:arch-review DISPATCH ONLY" 주석 vs 주간 cron 스케줄 | REGISTRY 에이전트 | P2 | R6-C |
| C-04 | 코드 | `agents/seed/scheduler.ts:588-592` | JSDoc "집중 좋아요 라운드"인데 본문은 `console.log('[KillerPost] retired')` no-op. `agents-killer-post.yml`이 이 no-op을 스케줄 | sed | P2 | R6-B |
| C-05 | 코드 | `.github/workflows/agents-seed.yml:25` | `ENABLE_SEED_POSTS: 'false'` — 코드 참조 0인 죽은 플래그 | grep -rn | P2 | R6-A |
| C-06 | 코드 | `agents/` 89파일 | 헤더에 DISPATCH ONLY / LOCAL ONLY / retired / no-op 자가 선언. `check-cron-links`는 면제 주석으로 통과 → 죽은 코드가 도구상 "정상" | grep -rl | P2 | R6-B |
| C-07 | 코드 | `runner.ts` HANDLERS | 78개(문서 SERVICE_ARCHITECTURE "93"과 불일치). 33개는 워크플로우 연결 없음(DISPATCH 26 · LOCAL 7) | grep -c, REGISTRY 에이전트 | P2 | R6-B |
| H-01 | 하드코딩 | src/agents/scripts/e2e/config | `age-doesnt-matter.com` 리터럴 **137곳/93파일**. `SITE_URL` 단일 상수 없음. `process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'` 패턴 38곳 복제 | grep -ro/-rl | P2 | R6-A |
| H-02 | 하드코딩 | 동일 | env fallback(`\|\|`/`??`) **221곳**: NEXT_PUBLIC_APP_URL 40 · CLAUDE_MODEL_LIGHT 23 · HEAVY 18 · **DATABASE_URL 12 · DIRECT_URL 9** · STRATEGIC 6 · SLACK_BOT_TOKEN 4 · AUTH_URL 4. 모델 ID fallback이 파일마다 다름(sonnet-4-5/4-6, haiku-4-5/4-5-20251001, opus-4-6/4-7) | grep -rhoE | P2 (DATABASE_URL fallback은 P1 후보 — A-01과 결합 시 조용한 오접속 가능) | R6-A |
| H-03 | 하드코딩 | `src/**/*.tsx,ts` | hex 색상 **208곳/56파일**. `#FF6F61` 88곳(globals.css:24,69,74,102에 토큰 있음에도 우회) · `#FEE500` 14 · `#191919` 13 · `#4A6CF7` 12 | grep -rhoE | P2 | R6-A |
| H-04 | 하드코딩 | src | localStorage/sessionStorage 키 15종, 접두어 4가지 혼재(`unao_*`, `unae_*`, `_uid`/`_twa_*`, 무접두어 `signup_*`/`push_*`). 중앙 레지스트리 없음 | grep | P2 | R6-A |
| H-05 | 하드코딩 | `launchd/*.plist` 16/16 · `src/__tests__/ops-runner-{freshness,selection}.test.ts` | `/Users/yanadoo/Documents/unao-prod` 등 절대경로. unao-ops PR #251 "UNAO_WORKDIR 파라미터화 1차"의 2차 미완 | grep, `unao-ops` git log | P2 | R6-D |
| S-01 | 스키마 | `prisma/schema.prisma:68, :364, :398-399, :406` | `Post.source` = USER·BOT·ADMIN·SHEET 4값. 크롤 출처는 `sourceUrl`(@unique)·`sourceSite` 문자열뿐. `isControversySeed` 시드봇 잔재. **Comment·User에 봇 식별 필드 없음** → North Star "실사용자" 집계를 스키마로 보장 못 함 | awk | P1 (R7 파이프라인 이식 전 설계 필요) | R3, R6, R7 |
| S-02 | 입구 | `src/app/api/bot/posts/route.ts`, `bot/jobs/route.ts` | 외부 HTTP로 글을 넣는 문. `authenticateBot(req)` 토큰 인증, `authorId`를 호출자가 지정. 라이브에 살아 있음. 호출자·토큰 회전 이력 **미확인** | sed | P1 | R4, R6-D |
| S-03 | 입구 | agents 16파일 + scripts 1 + api 2 | `prisma.post/comment/like.create` 보유 = 글을 쓰는 코드 경로 19파일. 파괴적 연산(deleteMany/$executeRaw/$queryRaw) 8파일 | grep -rl | P1 | R4 |
| G-01 | git 위생 | origin | 원격 브랜치 283개, 그중 81개 origin/main 병합 완료 잔존. 로컬 worktree 23개(detached 2, prunable 1) | git branch -r, worktree list | P2 | R6 |

---

## 4. R1-A 어드민 접근 복구와 직접 관련 있는 발견

### 4-1. production DB auth failure 근거 (확인됨)
| 확인 | 결과 | 근거 |
|---|---|---|
| `/api/health` | **503**, `{"status":"degraded","version":"2026.08.24-02e918f", "checks":{"database":"error","dbError":"... Code: 28P01 ... password authentication failed for user \"postgres\""}}` | curl 06:56 UTC, `x-vercel-cache: MISS`(캐시 아님, 실시간) |
| 배포 버전 | `2026.08.24-02e918f` = origin/main HEAD. 즉 **코드는 최신인데 DB 접속이 실패** | 위 본문 |
| launchd 동일 증상 | unao-prod 로컬 실행도 28P01 user postgres. 매거진 마지막 성공 08-22, 이후 실패 누적(로그 파일당 5~49회) | `unao-prod/logs/magazine-morning.log:1212-1214, :1274+`, `cafe-crawler-*-error.log` |
| 시점 정합 | GitHub 워크플로우 일괄 disable 08-24 ~06:15 UTC · health 캐시 ts 08-24 08:12 UTC · 매거진 마지막 성공 08-22 → **08-22~24 사이에 DB 접속정보가 바뀌었다**는 가설과 모든 관측이 일치. 확정은 Supabase/Vercel 대조 후 | A-01·A-04·A-06 |
| 원인 판정 | 어드민 비밀번호 문제가 아니라 **DB 접속정보(user postgres 인증) 문제** — 마스터 플랜 §21 "현재 판정"과 일치 | 28P01은 Postgres 인증 실패 코드 |

### 4-2. Vercel / Supabase / env 관련 확인 여부
| 항목 | 상태 |
|---|---|
| Vercel production env(`DATABASE_URL`, `DIRECT_URL`) | **미확인.** Vercel CLI는 로컬에 존재하나 실행하지 않음(어느 team/project에 링크됐는지 불명, `.vercel/project.json` unao-main·unao-prod 모두 부재) |
| Supabase DB password 현재값·변경 이력 | **미확인.** 콘솔 접근 없음 |
| unao-prod `.env.local` | 존재만 확인. 내용 미열람. 값 원문은 이 세션에서 절대 출력하지 않음 |
| Supabase pooler vs direct | 미확인 |
| `/api/health/auth` 캐시 | **확인됨 — 문제.** `x-vercel-cache: HIT`, `age: 7532`, 본문 `ts` 08-24, `db: true`. 마스터 플랜 R1-D 기준("dynamic/no-store")을 현재 충족하지 못함. 이 값만 보면 정상으로 오판 |
| `/api/auth/csrf` | 200 |
| `/api/auth/providers` | 200, `kakao` provider 존재, signin/callback URL이 운영 도메인 |
| `/login` | 200 렌더 |
| `/admin/login` GET | 200, 본문에 DB 에러 원문 없음(GET). **로그인 POST는 미시도** → "로그인 성공"은 미확인 |
| 홈 `/`, `/community/stories` | 200 — 단 `/community/stories`는 `x-vercel-cache: STALE`. **ISR 캐시가 DB 장애를 가리고 있다.** 캐시 만료·재생성 시점에 실패 노출 가능 |

### 4-2b. Codex 판정(16:05 KST) 이후 추가 실측 — R1-A 진행 한계
| 확인 | 결과 |
|---|---|
| 로컬 Vercel CLI 로그인 계정 | `vercel whoami` = `soransorancommunity-2970`, 기본 scope `soransoran`. **소란소란 계정이다.** age-doesnt-matter 프로젝트는 PR #392 체크 URL 기준 `mogoyongseok-8318s-projects` 소속 → 이 CLI로는 우나어 production env를 읽거나 고칠 수 없고, 소란소란 접근 금지 원칙에도 걸린다. `vercel projects ls` 1회(목록 조회, 해당 프로젝트 없음) 외 CLI 사용 중단 |
| Supabase CLI | 로컬에 없음. 현재 DB password는 이 세션에서 얻을 수 없다(Supabase는 password를 조회 API로 주지 않는다) |
| 결론 | **R1-A의 env 대조·정정·redeploy는 창업자 액션(HANDOFF).** Claude가 할 수 있는 것은 정정 후 검증(curl)뿐 |
| `/api/health/auth` 캐시 원인 | `src/app/api/health/auth/route.ts`에 `export const dynamic`/`revalidate` 선언 없음 + request 미사용 GET → Next.js 정적 캐시. R1-D는 `export const dynamic = 'force-dynamic'` 1줄 코드 PR(이번 문서 PR과 분리) |
| `PAUSED` 전환 부작용 | `agents/cron/runner.ts:21-29` MONITORING_TASKS = health-check · error-monitor · security-audit · anomaly-detector · qa-verify · cafe:session-refresh · cmo:seo-snapshot. **`coo:moderator` 미포함** → `automation_status: PAUSED` merge 시 활성 상태인 `agents-moderation.yml`(금지어 감지·숨김)도 스킵된다. 회피하려면 runner.ts MONITORING_TASKS에 `coo:moderator` 1줄 추가(코드 PR) 또는 PAUSED merge를 R1 이후로 미룸 — Codex 결정 |

### 4-3. 아직 확인 못 한 것
1. Vercel production의 `DATABASE_URL`/`DIRECT_URL`이 어느 host·user를 가리키는지(값이 아니라 host/user 형태만이라도)
2. Supabase 프로젝트가 pause 상태인지, 비밀번호가 회전됐는지, 회전됐다면 언제 누가
3. 08-22~24에 창업자/타 세션이 의도적으로 DB 자격을 바꿨는지(자동화 정지와 한 묶음이었는지)
4. `/admin/login` POST 실제 결과(ECIRCUITBREAKER 노출 여부)
5. 카카오 OAuth 후 session 생성(User row 조회가 DB를 타므로 A-01 상태에선 실패할 가능성이 높으나 **미실측**)
6. `/api/health/auth`가 코드상 `dynamic`/`no-store` 선언이 있는지(라우트 파일 미열람)

### 4-4. 다음에 확인해야 할 것 (제안 순서, 실행은 승인 후)
1. 창업자: Supabase 콘솔에서 DB password 상태·변경 이력 확인 → Vercel production env `DATABASE_URL`/`DIRECT_URL`과 대조(값은 보고서에 쓰지 않음)
2. env 정정 후 production redeploy → `curl /api/health` 200 확인
3. `src/app/api/health/auth/route.ts` 읽어 `export const dynamic = 'force-dynamic'`·`no-store` 여부 확인, 없으면 R1-D PR
4. `/admin/login` 실브라우저 로그인 → `/admin` 진입
5. **DB 자격 복구 전에** launchd 12개 재가동 방지 결정(A-05) — 복구와 동시에 자동 발행이 재개된다

---

## 5. R6 코드/인프라 정리 후보

### 5-1. 하드코딩 (R6-A)
- 도메인 리터럴 137곳/93파일 → `src/lib/site.ts` 류 단일 상수. **단 sitemap.ts·robots.ts·layout metadataBase·canonical은 seo-guard 대상이라 별도 PR + `seo-reviewed` 라벨**
- hex 208곳/56파일 → Tailwind 토큰(`#FF6F61` 88곳이 1순위)
- localStorage 키 15종 → `storage-keys.ts` + 접두어 통일(키 변경은 기존 사용자 상태 리셋을 뜻하므로 매핑 필요)
- launchd plist 절대경로 16/16 → `UNAO_WORKDIR` 2차
- 테스트 내 절대경로(`src/__tests__/ops-runner-*.test.ts`) → fixture 격리

### 5-2. env fallback (R6-A)
- 221곳. **`DATABASE_URL`/`DIRECT_URL` fallback 21곳은 우선 제거 후보** — 미설정 시 조용히 다른 곳에 붙는 대신 throw해야 A-01 같은 장애가 즉시 드러난다
- 모델 ID fallback 47곳 6종 → `agents/core/model.ts` 1곳(constitution.yaml `model_policy` 정본)
- `NEXT_PUBLIC_APP_URL` 40곳 → 5-1 단일 상수와 통합

### 5-3. 죽은 자동화 (R4 → R6-B)
| 후보 | 근거 | 제안 분류(Codex 확정) |
|---|---|---|
| launchd 카페 크롤러 10 + 매거진 2 | 2주간 매 슬롯 DB 인증 실패 | OFF(unload) 또는 REMOVE — **창업자 결정** |
| launchd session-refresh | 크롤러용 네이버 세션 유지. 크롤러가 죽었으니 목적 없음 | OBSERVE → OFF |
| launchd naver-cafe-sheet-scraper | 매 실행 "게시 0" + Slack ENOTFOUND | OBSERVE |
| launchd unao-prod-sync · opsboard | 동작 중, 무해 | KEEP |
| agents-killer-post.yml | no-op 스케줄(C-04) | REMOVE |
| agents-social.yml 내 social-poster-visual·knowledge-responder job | 핸들러 부재(C-02) | REMOVE |
| disabled 21 워크플로우 | 08-24 정지. 재가동 계획 없는 것 | 목록 확정 후 REMOVE, 나머지 OFF 유지 |
| runner.ts 면제 핸들러 33 · agents/{cpo,cfo,cdo,ceo,strategist,skills,marketing-loop,qa,design} | 6월 이후 커밋 0, 스케줄 0 | REMOVE 후보 |
| `ENABLE_SEED_POSTS` | 참조 0 | REMOVE |
| **agents-moderation** | 활성, 금지어 감지·숨김(헌법 auto_allowed) | **KEEP** |
| ci · post-deploy-qa · lighthouse · quarantine-check | 가드 | **KEEP** |

### 5-4. 주석과 실제 동작 불일치 (R6-C)
C-01~C-07 (§3). 양은 TODO/FIXME 26곳으로 적고, 문제는 "자가 선언 죽은 코드"가 도구 통계상 정상으로 집계되는 구조(C-06).

### 5-5. 삭제 후보 (문서, R5)
docs/agents/POST_DEV_CHECKLIST.md · memory/ 2파일 · docs/ideas/retention-ideas.md(항목 0) · md↔html 중복 4(SERVICE_ARCHITECTURE.html, kakao-auth-policy.html, marketing/utm-links.html 택1, backlog/unaeo-priority-roadmap.html) · docs/features/{jobs-bot,external-content}.md 구판 · reports/{login-preview, 비즈니스-프레임워크-복사본, video-ads/Campaign_Strategy_Roadmap(최상위와 동일)}.html · analysis/insights-2026-06-07.md · 소란소란 4문서(**이관 확인 후**)

### 5-6. 유지 후보 (문서, R5)
NORTH_STAR.md(§13만 손질) · CLAUDE.md · AGENTS.md(:72 typecheck 문구 정정) · docs/ops/OPERATING_MASTER_HARNESS.md · docs/seo/SEO_OPERATING_MASTER.md · docs/strategy/title-rewrite-guide.md · docs/kakao-auth-policy.md · docs/marketing/utm-links.md · docs/data-dashboard-design.md · docs/experiments/retention-experiment-design-2026-06.md · features F01 F02 F03 F07 F09 F10 F11 F12 F13 F14 F15 F16 F17 F18 F19 F20 A28 I02 I03 I04 M05 R01 TECH-DEBT · docs/specs/01~10 · docs/spec/{CONVENTION,SECRETS,SECURITY,GITHUB_SECRETS}

### 5-7. 나중에 판단해야 할 후보
- REWRITE 대상: constitution.yaml(D-01·D-02) · README · DESIGN.md · SERVICE_ARCHITECTURE · PRD A/B/C · RULE_MAINTENANCE · content-growth-roadmap(M번호 충돌) · cron-job-dispatcher-ops · features A01 A03 A04 A05 A06 A29 A30 F04 F05 I01 R02
- ARCHIVE 대상: PRD_D · MASTER_TODO · plan-v6 · handoff-*.md 12 · handover-* 5 · analysis 26 · reports 18 · TWA/앱 6 · 초기 spec 4 · OPERATING_BACKLOG(UX 항목 발췌 후) · m3-new-brand-readiness(우나어 AS-IS 성적표 :105-117, :248-260, :791-806 발췌 후 이관)
- 디렉터리 병합: spec↔specs · ops↔operations · design↔ui↔mockups · reports↔analysis
- 스키마(S-01): R7 파이프라인 설계 확정 뒤 `/prisma-guide` 절차로만
- `/api/bot/*`(S-02): 폐쇄 vs 유일 입구 승격
- 원격 병합 완료 브랜치 81개 정리(G-01)

---

## 6. PR #392 판정 자료

**전제 정정: PR #392는 2026-08-19에 이미 MERGED 상태다.** 아래는 "merge 여부 판정"이 아니라 "이미 반영된 변경의 사후 검토 자료"다. 만약 마스터가 의도한 PR이 다른 번호(현재 열린 PR은 #394 소란소란 문서 1건뿐)라면 재지정이 필요하다.

| 항목 | 값 | 근거 |
|---|---|---|
| 무엇을 바꾸는가 | 커뮤니티 글 상세 ISR TTL `revalidate` 300 → 3600 (Vercel ISR Writes 비용 절감 목적, PR 본문에 Usage 실측 표) | `gh pr view 392` body |
| 변경 파일 | 1개: `src/app/(main)/community/[boardSlug]/[postId]/page.tsx` (+7/-2, 실질 상수 1줄 + 주석) | `gh pr view 392 --json files` |
| 현재 코드 | `page.tsx:44 export const revalidate = 3600` — HEAD에 반영됨 | grep |
| merge commit | `019b47e5 perf(isr): community 글 상세 revalidate 300s → 3600s (#392)` | `git log origin/main --grep 3600` |
| CI 결과(PR 시점) | **pass**: Lint→Typecheck→Test→Build · SEO 노출면 보호(네이버) · E2E Smoke · Lighthouse · Vercel 배포 · 변경 파일 감지. **skipping**: agents·scripts 타입 회귀 가드, 크론 연결 검증, E2E Admin/Ads(변경 파일 무관으로 스킵) | `gh pr checks 392` |
| 로컬 typecheck/lint/test | **미실행** — worktree에 node_modules 없음, `npm install` 미실행(read-only 원칙). PASS 주장하지 않음 | — |
| 이미 merge된 상태에서 위험 | (1) 비로그인 방문자 부가정보 최대 1시간 지연(PR 본문 인정) (2) **현재 DB 장애(A-01)와 결합 시**: TTL이 길수록 STALE 캐시가 장애를 더 오래 가린다 — `/community/stories`가 지금 `x-vercel-cache: STALE`로 200. 이는 #392의 결함이 아니라 DB 장애의 증상이나, 복구 판정 시 캐시 HIT/STALE을 "정상"으로 오독하지 말 것 | curl 헤더 |
| SEO 영향 | sitemap·robots·canonical·noindex·generateMetadata 변경 없음(PR 본문 + CI seo-guard pass) | `gh pr checks` |
| rollback 방법 | `git revert 019b47e5` → PR → merge(창업자). 또는 해당 파일 `revalidate = 300` 복원 1줄 PR. 데이터 마이그레이션 없음 | 변경이 상수 1줄 |
| Claude 의견(결정 아님) | 되돌릴 이유 없음. 단 R1-A 복구 검증 시 `/api/health`(MISS)로 판정하고 페이지 캐시 상태로 판정하지 말 것 | — |

---

## 7. 절대 지금 하면 안 되는 일

| 금지 | 이유(근거) |
|---|---|
| 대규모 리팩토링(도메인 상수화 137곳·색상 토큰화 208곳 일괄) | R1 로그인 복구 전 UI/코드 대수술은 마스터 플랜 §21 금지. R6는 R1~R5 뒤 |
| 자동화 재가동(`automation_status` ACTIVE 유지 상태에서 DB 자격 복구, workflow enable, launchd load) | **DB 자격이 살아나는 순간 launchd 12개가 자동 발행 재개**(A-05). 복사글 출혈 재발 |
| 복사글 대량 삭제·noindex | R3 판정 기준 미확정. 마스터 플랜 §24 중단선("USER/ADMIN 글 대량 포함") |
| env 영구 변경 | 값 대조 없이 변경하면 A-01을 악화. 창업자가 Supabase↔Vercel 대조 후 |
| launchd unload/load | 이 세션 헌장 + §24 "rollback 준비 없이 하지 않는 작업" |
| workflow delete/disable | 동일. 21개는 이미 disabled — 추가 조작 불필요 |
| SEO 노출면(sitemap/robots/canonical/일반 robots meta) 변경 | 네이버 색인 0 사태 진행 중, WAIT 3건 기한 전 조작 금지, CI seo-guard |
| Prisma schema/migration, `prisma migrate/db push/db seed` | CLAUDE.md 금지. S-01 설계는 R7 이후 |
| 소란소란 4문서를 우나어 세션이 직접 이관·삭제 | 소란소란 repo 접근 금지. 이관은 소란소란 세션, 우나어 쪽은 이관 확인 후 삭제 PR |
| `/api/health/auth` 캐시값으로 복구 판정 | A-02: 12일 전 `db: true`가 HIT로 나옴 |
| 원격 브랜치 81개 일괄 삭제 | 타 세션 worktree가 물고 있을 수 있음. 목록 공유 후 개별 |

---

## 8. Claude의 추천 순서 (추천만, 결정은 Codex 마스터)

1. **R1-A**: 창업자가 Supabase DB 자격 ↔ Vercel production env 대조·정정·redeploy → `curl /api/health` 200 확인. **단 그 전에** launchd 12개 재가동 방지 조치를 먼저 결정(A-05).
2. **R1-D 소형 PR**: `/api/health/auth` dynamic/no-store(코드 확인 후 1파일). R1-A 판정 도구를 먼저 믿을 수 있게 만든다.
3. **R4/R5 P0 문서 PR(코드 무변경)** `[merge 금지] docs(foundation): 자동화 정지 상태 선언 + 헌법 KPI 정합`: constitution.yaml `automation_status` → `PAUSED`(runner.ts:197이 하드스톱, slack-commander.ts:320 문구 갱신) + :10/:153/:272/:275/:580-581/:595 정정 · NORTH_STAR §13 교체 · REGISTRY 상단 실측 배너 · CLAUDE.md "PAUSED 시 재가동 금지" 1줄. 어드민 영향: 없음(runner·slack 문구만).
4. **R5 삭제 PR**: §5-5 유해·중복 문서(소란소란 4건 제외).
5. **R4 KEEP/OFF/REMOVE 표 확정**(§5-3) → 창업자가 launchd unload·workflow 삭제 목록 결정 → `/careful` 게이트로 실행.
6. **R5 REWRITE/ARCHIVE**(§5-7) 디렉터리 병합 포함.
7. **R6-A/B/C** 파일 단위 소형 PR: DATABASE_URL fallback 제거 → 모델 ID 단일화 → SITE_URL 상수(비-SEO) → storage-keys → 색상 토큰 → 죽은 핸들러/디렉터리 삭제 → 주석 정정. 각 PR은 tsc + `check-cron-links` + (SEO 파일 포함 시) seo-guard.
8. **R3**은 별도 세션(콘텐츠 데이터룸 §19 기준) — 이번 감사 범위 밖.

각 단계 검증 명령(요지): `curl -s -o /dev/null -w '%{http_code}' -H 'x-bot-type: <세션명>' https://age-doesnt-matter.com/api/health` → 200 · `npx tsc --noEmit` · `npx tsc -p tsconfig.ops.json --noEmit` · `npx tsx scripts/check-cron-links.ts`(orphan 0, 면제 주석 의존도 감소 확인) · `npx tsx scripts/check-seo-guard.ts` · `gh pr checks <n>`.

---

현재 상태:
- R1-A: **FAIL** — production `/api/health` 503, DB 28P01(user postgres). `/api/health/auth`는 12일 전 캐시(HIT)라 판정 도구로 부적합. Vercel/Supabase env 대조 미수행. 어드민 로그인 POST 미시도.
- R2: **미착수** — sitemap.ts·robots.ts 내용 읽고 변경 없음만 확인. 신뢰 훼손 후보(복사글 노출·canonical·noindex 정책) 감사는 이번 범위 밖.
- R3: **미착수** — 복사글/저품질/중복 판정 기준 미작성. 스키마상 출처 필드가 빈약하다는 전제 조건만 확인(S-01).
- R4: **PARTIAL** — 실측 표 확보(GitHub 21 disabled / launchd 16 로드·DB 실패 / 죽은 job·핸들러 목록). KEEP/OFF/REMOVE 확정은 미완. 헌법 `automation_status: ACTIVE` 불일치 미정정.
- R5: **PARTIAL** — KEEP/REWRITE/ARCHIVE/DELETE 후보표 확보(문서 177 + 루트 4 + memory 2 + constitution.yaml). 확정·PR 0건.
- R6: **PARTIAL** — 하드코딩·fallback·죽은 코드·주석 불일치 후보 목록 확보(§3 C/H, §5). PR 0건, 로컬 typecheck 미실행.

Codex 판단 필요:
1. **R1-A 복구 순서**: DB 자격 복구를 launchd 재가동 방지(unload/plist 제거/`automation_status` PAUSED) **전에** 할지 **후에** 할지. Claude 추천은 "방지 먼저"이나 어드민 접근 긴급도에 따라 뒤바뀔 수 있음.
2. **R4/R5 P0 문서 PR 착수 승인**: `automation_status` → `PAUSED` 전환 + 헌법 KPI 정정 + REGISTRY 실측 배너(코드 무변경, 5파일). 승인 시 `[merge 금지]` PR로 올린다.
3. **PR #392 재지정 여부**: #392는 이미 merged. 마스터가 판정하려던 PR이 다른 번호인지, 또는 열린 PR #394(소란소란 문서)의 처리(닫기/이관)를 뜻하는지.
