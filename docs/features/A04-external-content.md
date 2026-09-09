# 외부 콘텐츠 스크래퍼 운영 기획서 (A04)

> ⚠️ **ARCHIVED (2026-09-09)** — 이 기능은 현재 운영 계약이 아니다.
> R4 B-3 에서 외부 카페·Google Sheet 공급망 자동화를 제거하면서 코드·workflow·launchd 가 모두 사라졌다.
> 아래 내용은 **당시 운영 기록**이며, 지금 동작을 설명하지 않는다. 재도입하려면 새 판정을 받아야 한다.

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27 (Feature Lifecycle 마이그레이션)

---

## 목표

50·60대 공감 콘텐츠를 네이버 카페 외 **외부 커뮤니티(오유·네이트판·펨코)**에서도 자동 수집하여  
우나어 커뮤니티 게시판에 다양한 화제성 콘텐츠를 공급한다.

---

## 배경

- 네이버 카페(A01)만으로는 콘텐츠 다양성 한계
- 오늘의유머·네이트판·펨코는 50·60대가 공감하는 생활·유머·사회 이슈 다수
- Google Sheets 큐레이션 시스템: 운영팀이 선별한 외부 링크를 자동 게시로 연결
- 펨코(fmkorea)는 Playwright 필요 → 로컬 전용 실행

---

## 세부 기획

### 2-트랙 구조

A04는 **두 개의 독립적인 에이전트**로 구성된다:

| 트랙 | 에이전트 | 소스 | 실행환경 |
|------|---------|------|--------|
| **트랙 1** | `sheet-scraper.ts` | 오늘의유머 + 네이트판 | GHA |
| **트랙 2** | `run-local-fmkorea.ts` + `fmkorea-scraper.ts` | 펨코(fmkorea) | LOCAL_ONLY (launchd) |

---

### 트랙 1: Google Sheets 기반 큐레이션 (GHA)

```
Google Sheets (시트 2탭: 사는이야기/활력충전소)
  └─ A~J 10열 구조
  └─ 상태값 6가지: 대기/처리중/완료/실패/건너뜀/수동완료
  ↓
sheet-scraper.ts (GHA)
  └─ '대기' 상태 행만 처리
  └─ 원본 URL 접속 → 본문+이미지 스크래핑
  └─ R2 이미지 재업로드 (scraped/{postKey}/{index}.ext)
  └─ DB INSERT (Post + 외부 출처 태그)
  └─ 시트 상태 → '완료' 업데이트
  ↓
BotLog 기록 + Slack #로그 알림
```

**스케줄 (GHA)**:

| KST | UTC cron | 워크플로우 |
|-----|---------|---------|
| 11:00 | `0 2 * * *` | `agents-community.yml` |
| 21:00 | `0 12 * * *` | `agents-community.yml` |

**Google Sheets 탭 구조**:

| 열 | 내용 |
|----|------|
| A | 상태 (대기/처리중/완료/실패/건너뜀/수동완료) |
| B | 원본 URL |
| C | 제목 |
| D | 카테고리 |
| E | 소스 (오유/네이트판) |
| F~J | 기타 메타데이터 |

---

### 트랙 2: 펨코 직접 크롤링 (LOCAL_ONLY)

```
fmkorea-scraper.ts (Playwright headless)
  └─ fmkorea 인기 게시글 목록 크롤링
  └─ 50·60대 공감 키워드 필터링
  └─ 본문 + 이미지 추출
  └─ R2 이미지 재업로드
  └─ DB INSERT
  ↓
BotLog + Slack #로그
```

**스케줄 (launchd)**:

| KST | plist |
|-----|-------|
| 11:30 | `com.unaeo.cafe-crawler-lunch.plist` (공유) |
| 21:30 | `com.unaeo.cafe-crawler-evening.plist` (공유) |

> **LOCAL ONLY 사유**: Playwright + fmkorea 크롤링은 GHA ubuntu-latest에서 차단 가능성 높음

---

### 5 페르소나

외부 콘텐츠 게시자로 사용되는 5개 봇 계정:

| 코드 | 페르소나명 | 특성 |
|------|---------|------|
| C | ㅋㅋ요정 | 유머·웃음 특화 |
| E | 봄바람 | 따뜻한 생활 이야기 |
| H | 매일걷기 | 건강·운동 관심 |
| I | 한페이지 | 책·문화·감성 |
| P | 오후세시 | 여유·일상 이야기 |

---

### DB 모델

| 테이블 | 역할 |
|--------|------|
| `Post` | 게시글 (boardType, source='BOT', authorId=페르소나) |
| `BotLog` | 처리 이력 기록 |

---

### BotLog

- `botType: 'CAFE_CRAWLER'`
- `action: 'SHEET_SCRAPE'` (트랙 1) / `action: 'FMKOREA_SCRAPE'` (트랙 2 추정)
- `status: 'SUCCESS' | 'PARTIAL' | 'FAILED'`
- `details: { collectedCount, publishedCount, source }`

---

### Slack 알림

| 조건 | 레벨 | 채널 |
|------|------|------|
| 처리 완료 | info | #로그 (COO 라우팅) |
| 스크래핑 실패 | warning | #로그 |
| 전체 배치 실패 | error | #시스템 |

---

### R2 이미지 경로

```
scraped/{postKey}/{index}.{ext}
```

외부 도메인 이미지 → WebP 변환 후 R2 재업로드 (CSP 차단 우회)

---

### 환경변수

| 변수 | 필수 | 사용 트랙 |
|------|------|---------|
| `SHEETS_SCRAPER_ID` | 필수 | 트랙 1 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 필수 | 트랙 1 |
| `DATABASE_URL` | 필수 | 공통 |
| `DIRECT_URL` | 필수 | 공통 |
| `CLOUDFLARE_ACCOUNT_ID` | 필수 | 공통 |
| `CLOUDFLARE_R2_ACCESS_KEY` | 필수 | 공통 |
| `CLOUDFLARE_R2_SECRET_KEY` | 필수 | 공통 |
| `CLOUDFLARE_R2_BUCKET` | 필수 | 공통 |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | 필수 | 공통 |
| `SLACK_BOT_TOKEN` | 필수 | 공통 |
| Slack 채널 변수 | 필수 | 공통 |

---

### 비용 영향

| 항목 | 비용 |
|------|------|
| Google Sheets API | 무료 (쿼터 범위 내) |
| Playwright 크롤링 | $0 |
| Claude AI | **없음** (AI 가공 없이 원문 그대로 게시) |
| R2 이미지 저장 | ~$0.01~0.05/월 |
| **합계** | **~$0.05/월** |

---

## 운영 절차 (구 `external-content.md`에서 흡수 · 2026-09-06)

> 2026-04-21 운영 기획서의 Sheets 운영·점검 절차를 정본(A04)으로 옮긴 것이다. 원문의 raw SQL·수동 트리거는 현재 운영 원칙(DB 직접 조회 금지, R4 자동화 PAUSED)에 맞게 표현을 바꿨다.

### Google Sheets 운영 방법
- 스프레드시트 ID: 환경변수 `SHEETS_SCRAPER_ID` (값은 `.env.local`/GitHub Secrets에만)
- 탭: `사는이야기`(STORY), `활력충전소`(HUMOR)

#### 열 구성
| 열 | 내용 | 입력 주체 |
|---|---|---|
| A | 원본 URL | 창업자 |
| B | 상태 (비우면 PENDING 자동) | 봇이 관리 |
| C | 제목 (비우면 자동 추출) | 창업자 선택 |
| D | 카테고리 (비우면 자동 분류) | 창업자 선택 |
| E | 페르소나 (비우면 자동 선택) | 창업자 선택 |
| F | 게시된 URL | 봇이 기록 |
| G | 에러 메시지 | 봇이 기록 |
| H | 게시 시각 | 봇이 기록 |
| J | raw_content (본문 직접 붙여넣기) | 창업자 (CF 차단 시 수동) |

#### 상태값 (B열)
| 상태 | 의미 |
|---|---|
| (비어있음) | PENDING — 봇이 가져감 |
| `PENDING` | 명시적 대기 |
| `PROCESSING` | 봇이 처리 중 |
| `PUBLISHED` | 게시 완료 |
| `FAILED` | 실패 (G열에 오류 내용) |
| `SKIPPED` | 중복 등으로 스킵 |

#### FAILED / PROCESSING 재처리
- 굳은 행을 다시 올리려면 **B열 내용을 지우거나 `PENDING`으로 변경**한다. 같은 원본 URL은 `Post.sourceUrl` unique로 중복 게시가 막힌다.
- ⚠️ 현재(2026-09-06)는 R4로 GHA `agents-scraper.yml`이 `disabled_manually` 상태라 B열을 바꿔도 **자동 처리되지 않는다**. launchd `com.unao.naver-cafe-sheet-scraper`만 OBSERVE 상태로 남아 있다(`unao-ops` 체크아웃에서 실행). 재처리는 R4 KEEP/OFF/REMOVE 확정 후에만.

### 점검 절차 (read-only)
1. **GA 실행 이력 확인** — `gh run list --workflow=agents-scraper.yml --limit 20` (2026-04 당시 워크플로우명은 `agents-cafe.yml`이었다). `sheet-scrape` 잡이 `skipped`면 워크플로우 `if` 조건, 워크플로우 자체가 `disabled_manually`면 R4 정지 상태다.
2. **BotLog 확인** — 어드민 패널의 봇 로그 화면, 또는 Prisma 기반 read-only 조회(`BotLog`에서 `action = 'SHEET_SCRAPE'` 최근 10건)로 본다. 운영 DB에 raw SQL을 직접 실행하지 않는다. `siteOnly:"fmkorea"` 기록만 있고 `siteExclude:"fmkorea"`가 없으면 GA 레인이 돌지 않은 것이다.
3. **Sheets 상태 확인** — 두 탭의 B열이 `FAILED`/`PROCESSING`으로 굳어 있는지 본다(재처리는 위 절차, 단 현재는 자동 처리 안 됨).

### 과거 트러블슈팅 기록 — 🚫 현재 실행 금지
> R4(2026-09-05~)로 콘텐츠 자동 발행이 PAUSED다. 아래는 2026-04 당시 절차의 기록이며, 재가동 승인 전에는 실행하지 않는다.
- 수동 GA 트리거(당시): `gh workflow run agents-cafe.yml -f step=sheet-scrape` → 15분 후 BotLog에 `siteExclude:"fmkorea"` 확인. 현재는 `workflow dispatch` 자체가 창업자 승인 대상이다.
- 펨코 로컬 launchd 확인(당시): `launchctl list | grep fmkorea`. 현재 `com.unao.fmkorea-scraper` plist는 repo·설치본 어디에도 없고(`agents/cron/runner.ts` 주석만 잔존) `launchctl print-disabled`에 disabled 플래그만 남아 있다.
- 2026-04-21 이슈 2건(오유/네이트판 게시 0건 — GA 잡 미실행 · Playwright chromium 버전 불일치)의 상세는 삭제된 `external-content.md`의 git 이력(2026-09-06 이전)에서 볼 수 있다.

## 운영 상태 기록

> 이 절을 읽기 전에 **`REGISTRY.md` 상단 실측 배너**와 `agents/core/constitution.yaml`의 **`automation_status`(현재 `PAUSED`)**를 먼저 본다. 아래 "현행"이 정본이며, 그 아래 과거 기록은 현재 상태가 아니다.

### 현행 (2026-09-06 기준)
- 콘텐츠 자동 발행은 **Rescue R4로 PAUSED**다. `automation_status: "PAUSED"`(constitution.yaml)이며 runner는 MONITORING_TASKS 외 실행을 스킵한다.
- 트랙 1 GHA(`agents-scraper.yml`·`agents-scraper-dawn.yml`)는 **`disabled_manually`**(2026-08-24 이후 미실행). Sheets B열을 바꿔도 자동 처리되지 않는다.
- 트랙 2 fmkorea 전용 launchd(`com.unao.fmkorea-scraper`)는 **현행 설치본 없음** — repo `launchd/`·`~/Library/LaunchAgents` 모두 부재, `agents/cron/runner.ts` 주석과 `launchctl print-disabled` 플래그만 잔존(과거 기록).
- `com.unao.naver-cafe-sheet-scraper` launchd만 **OBSERVE**로 별도 관리(unao-ops 체크아웃에서 실행, 최근 매 실행 "PENDING 없음"). R4 KEEP/OFF/REMOVE 확정 전 조작 금지.
- R2 이미지 파이프라인과 페르소나 계정은 **코드·자산이 존재**한다는 뜻이지 "자동 운영 중"이 아니다. 페르소나 계정 수·활성 여부는 DB 실측 전 단정하지 않는다(코드 정의와 REGISTRY 기재가 불일치, 감사 보고서 §3 참조).

### 과거 상태 기록 (2026-04~06, 현재 상태 아님)
- 트랙 1 (sheet-scraper, GHA): 11:00·21:00 KST 운영
- 트랙 2 (fmkorea, launchd): 11:30·21:30 KST 운영
- R2 이미지 파이프라인 운영
- 5 페르소나 계정 사용

---

## 관련 링크

- 트랙 1: `agents/cmo/sheet-scraper.ts`
- 트랙 2: `agents/community/fmkorea-scraper.ts` + `agents/community/run-local-fmkorea.ts`
- 이미지 파이프라인: `agents/community/image-pipeline.ts`
- GHA 워크플로우: `.github/workflows/agents-community.yml`
- Runner 핸들러: `agents/cron/runner.ts` — `community:sheet-scraper`
- R2 스토리지: [I03](I03-r2-storage.md)

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반, external-content.md 마이그레이션) | Feature Lifecycle 도입 |
| 2026-05-11 | 4탭 구조 + 화제성 파이프라인 구축: PostSource.SHEET 추가, 스크래퍼봇 BI~BW 15명 신설, 좋아요·댓글 파동(WAVE_L/1/2/3) 자동화, 시드봇 SHEET 글 접근 차단 | 창업자 직접 발굴 화제글 → 우나어 즉각 HOT 달성 자동화 |
| 2026-05-11 | FAILED 행 스마트 재시도 로직: 게시글은 있으나 파동 BotLog 0개인 경우 B~J 공백 처리 시 파동 재예약 → PUBLISHED 자동 처리 | 창업자가 FAILED 행을 PENDING으로 초기화했을 때 HOT 달성까지 완전 자동화 |
| 2026-05-13 | 원본 댓글 수집 추가 + 파동 타이밍 단축: site-configs `commentSelectors`(오유·네이트판·펨코), scrapePage()에서 댓글 최대 10개 수집 → BotLog `sourceComments`. 파동: 화제성 +1/+3/+6/+10분, 일반 +2/+6분 | 글 발행 1분 이내 첫 댓글, 10분 이내 전부 완료 + 원본 분위기 반영 댓글 생성 |
| 2026-05-15 | 워크플로우 분리(agents-cafe.yml → agents-scraper.yml) + 스케줄 3→5회/일(07:30·09:00·12:00·15:00·21:00 KST) + Claude Haiku AI 품질 필터 추가(관련성 점수·카테고리 분류·제목 최적화) + `SHEET_SCRAPER_AI_FILTER` 환경변수 도입 | 카페 크롤링과 스크래퍼 종속성 분리 + 50~60대 관련성 낮은 글 자동 필터링 + AI 카테고리 분류 정확도 향상 |
| 2026-05-21 | AI 필터 완전 제거(Haiku 비용 0원) + 게시자 페르소나 5명→15명 확장 + pickPersona 랜덤화 + 일반 댓글 BI~BR 10명 풀 shuffle(targetCount: 4) + 화제성 파동 댓글 공감3/비판2/역전2 targetCount + 자기 글 자기 댓글 방지 | 페르소나 다양성 향상, AI 비용 절감, 댓글 자연도 개선 |
| 2026-05-21 | Phase 1 — LIFE2(2막준비) 게시판 지원: sheets-client TAB_TO_BOARD에 '2막준비'/'2막준비_화제성' 추가 + 없는 탭 try/catch 방어, sheet-scraper getBoardSlug() helper(3-way) + LIFE2 페르소나 4명(정순씨/솔직히말해서/따져보자/말티즈엄마), content-transformer boardType 타입 확장(LIFE2는 STORY처럼 출처 생략) | 인생 2막 특화 콘텐츠 전용 게시판 자동 발행 지원 |
| 2026-05-21 | Phase 2 — 82cook 사이트 추가: site-configs SiteConfig에 commentSelectors.author + postAuthorSelectors optional 필드 추가, SITE_CONFIGS에 cook82 설정(bn=15/16/17 curl 검증 완료), sheet-scraper scrapePage에 원글 작성자 자기 댓글 제외 로직 | 40~60대 여성 생활 정보 커뮤니티 수집 + 자기 댓글 오염 방지 |
| 2026-05-21 | Phase 3 — 네이버 카페 URL 지원(LOCAL ONLY): SiteConfig에 requiresSession?/contentFrame? 추가, navercafe 설정(cafe_main iframe 통합 처리), sheet-scraper SESSION_REQUIRED skip(GHA는 storage-state.json 없으면 PENDING 유지), extractText/extractHtml Page\|Frame 지원, launchBrowserWithSession() 추가, run-local-naver-cafe.ts + plist 신규. 동영상 지원 제외(removeElements에 iframe 포함) | 창업자 발굴 카페 글 Sheet URL만으로 자동 발행 — 로그인 세션 Mac 로컬 전용 |
| 2026-05-26 | sheet-scraper.ts scrapePage() 직후 videoCount > 0 또는 PZP signal(STRONG any 1개 / WEAK 2개 이상) 감지 시 updateRow(FAILED, '네이버 카페 동영상 포함 글은 발행 제외') 처리 추가. totalFailed 카운트 + continue로 Post 생성 완전 차단 | 동영상 포함 글 Sheet 경유 발행 3차 방어선 — image-router/curator 통과하더라도 최종 게시 직전 차단 |
| 2026-05-26 | sheet-scraper.ts rawContent/scrapePage 공통 content 변수 기준 ACCESS_BLOCKED_SIGNALS(6개) + BOARD_NOTICE_SIGNALS(2개) 필터 추가 — 동영상 차단 블록 앞 삽입, 감지 시 updateRow(FAILED) + continue | ea1ae6a 접근 차단 fix의 sheet-scraper 경로 구조적 누락 보완 — navercafe "검색 비허용/가입 필요" 안내문 발행 차단 |
| 2026-05-29 | P0: todayhumor/natepann commentSelectors 셀렉터 수정(d44746c) + GHA 시스템 Chrome 전환(18c0051). P1: filterSourceComments() 추가(HARD_REMOVE_RE, @태그/URL 제거, 앞4자 dedup, 10자↑) + sc SKIP/PARTIAL/FULL 정책 — usable≤2→SHEET_WAVE_SKIP, usable=3→PARTIAL, usable≥4(일반)/7(화제성)→FULL. 좋아요 파동 sc 무관 항상 예약. PENDING details에 sourceComments(filtered)+sourceCommentsRaw(감사용) 분리 | 빈 sourceComments(sc=0) 100% 문제 해결 + 품질 낮은 댓글로 파동 소비 방지 |
| 2026-05-29 | Shadow Mode 검수 도구 추가: `agents/scripts/_shadow-comment-pack.ts` — DB write 없이 raw댓글→P1필터→v2댓글팩 예상(MOCK/LLM)→Validator 7항목 콘솔 출력. `--dry-run`(기본, API키 불필요) / `--llm`(dynamic import, current-generator-preview) / `--postId` / `--limit` CLI 지원 | P1 운영 검증 후 창업자가 댓글 품질을 직접 검수할 수 있는 Shadow Mode 구현 |
| 2026-06-07 | 미디어 파이프라인 개선(image-pipeline.ts): ① GIF/animated webp → mp4 변환(ffmpeg, sharp webp→gif 디코딩 경유) + content-type 우선 판정(네이버 `?type=w710_wp` webp 대응) ② 일반 이미지 5MB 초과 시 placeholder 대신 sharp 다운스케일 복구 ③ UI 아이콘은 placeholder→태그 제거 ④ sanitize.ts video `autoplay/loop/muted/playsinline` 허용 ⑤ `backfillPlaceholderMedia()` 추가 — 기존 placeholder 6개 전부 복구 + agents-scraper.yml ffmpeg 설치 | 14MB GIF 등 5MB 초과 미디어가 placeholder로 깨지던 문제 해결. GIF는 88% 압축 mp4(자동재생)로 시니어 모바일 데이터·OOM 절감 |
| 2026-09-06 | 구 `external-content.md`의 Sheets 운영 방법·열 구성·상태값·재처리·점검 절차를 §운영 절차로 흡수(raw SQL·수동 트리거는 read-only/실행 금지 표현으로), 구판 삭제(R5 PR-D2) | Rescue R5 문서 정본화 |
| 2026-09-06 | §현재 운영 상태 → §운영 상태 기록: 현행(R4 PAUSED·GHA disabled·fmkorea launchd 부재·sheet-scraper OBSERVE)을 먼저 적고 2026-04~06 "정상 운영" 문구를 과거 기록으로 격리 | Codex 검토(현행 충돌 제거) |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04 | GHA cron 미실행 | agents-community.yml 조건 오류 | cron 조건 수정 완료 |
| 2026-04 | Playwright chromium 크래시 (GHA) | ubuntu-latest chromium 버전 불일치 | `--with-deps` 플래그 추가 + 버전 고정 |
| 2026-05-11 | 파동 BotLog 생성 실패 (13건 FAILED) | ① BotStatus enum에 PENDING 없음 ② sheet-scraper details 구조 불일치 (string vs JSON) ③ scheduledAt 필드 BotLog 스키마에 없음 | schema.prisma BotStatus.PENDING 추가 + sheet-scraper details → JSON.stringify + personaIds 포함 |
