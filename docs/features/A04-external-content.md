# 외부 콘텐츠 스크래퍼 운영 기획서 (A04)

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

## 현재 운영 상태

✅ 트랙 1 (sheet-scraper, GHA): 11:00·21:00 KST 정상 운영  
✅ 트랙 2 (fmkorea, launchd): 11:30·21:30 KST 정상 운영  
✅ R2 이미지 파이프라인 정상  
✅ 5 페르소나 계정 활성화

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

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04 | GHA cron 미실행 | agents-community.yml 조건 오류 | cron 조건 수정 완료 |
| 2026-04 | Playwright chromium 크래시 (GHA) | ubuntu-latest chromium 버전 불일치 | `--with-deps` 플래그 추가 + 버전 고정 |
| 2026-05-11 | 파동 BotLog 생성 실패 (13건 FAILED) | ① BotStatus enum에 PENDING 없음 ② sheet-scraper details 구조 불일치 (string vs JSON) ③ scheduledAt 필드 BotLog 스키마에 없음 | schema.prisma BotStatus.PENDING 추가 + sheet-scraper details → JSON.stringify + personaIds 포함 |
