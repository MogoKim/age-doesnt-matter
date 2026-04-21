# 외부 콘텐츠 스크래퍼 운영 기획서

> 최초 작성: 2026-04-21 | 최근 수정: 2026-04-21

---

## 목표

오늘의유머(오유), 네이트판, 펨코 등 외부 커뮤니티의 **우수 게시글을 선별·가공하여**
우나어 사는이야기(STORY) / 웃음방(HUMOR) 게시판에 공급한다.

초기 콘텐츠 부족 문제를 해결하고, 50·60대가 공감할 수 있는 글을 지속적으로 제공한다.

---

## 배경

- 우나어 초기 단계: 유저 직접 생성 콘텐츠(UGC)만으로는 게시판이 비어 보임
- 외부 커뮤니티의 "우리 또래 이야기"를 큐레이션하여 게시판 활성화
- 창업자가 Google Sheets에 URL을 넣으면 봇이 자동으로 수집·가공·게시
- Sheets 기반 운영으로 **코딩 없이 창업자가 직접 콘텐츠 제어** 가능

---

## 게시판 구성

| Sheets 탭명 | 게시판 | boardType | 콘텐츠 성격 |
|---|---|---|---|
| 사는이야기 | 사는이야기 | `STORY` | 일상, 고민, 건강, 힐링, 추천 |
| 활력충전소 | 웃음방 | `HUMOR` | 유머, 재미있는 이야기 |

---

## 지원 사이트

| 사이트 | ID | Cloudflare | 실행 주체 | 스케줄 |
|---|---|---|---|---|
| 오늘의유머(오유) | `todayhumor` | ❌ | GitHub Actions | 11:00, 21:00 KST |
| 네이트판 | `natepann` | ❌ | GitHub Actions | 11:00, 21:00 KST |
| 펨코 | `fmkorea` | ✅ (해외 IP 차단) | 로컬 Mac launchd | 11:30, 21:30 KST |

> **펨코 로컬 전용 이유**: Cloudflare가 GitHub Actions의 해외 IP를 차단. 한국 IP(로컬 Mac)에서만 접근 가능.

---

## URL 형식

| 사이트 | URL 형식 |
|---|---|
| 오늘의유머 | `https://www.todayhumor.co.kr/board/view.php?table=humorbest&no=XXXXX` |
| 네이트판 | `https://pann.nate.com/talk/XXXXXXXXX` |
| 펨코 | `https://www.fmkorea.com/XXXXXXXXXX` |

---

## 수집 파이프라인

```
[창업자] Google Sheets에 URL 입력 (B열 비워두면 자동 PENDING)
  ↓
[11:00/21:00 KST — GA] community:sheet-scrape 실행 (오유/네이트판)
[11:30/21:30 KST — 로컬] community:fmkorea-scrape 실행 (펨코)
  ↓
Sheets에서 PENDING 행 읽기
  ↓
사이트별 Playwright 스크래핑
  - 제목 추출 (댓글 수 패턴 [숫자] 제거)
  - 본문 HTML 추출
  - 이미지 파이프라인 (R2 업로드)
  ↓
중복 체크 (sourceUrl 기준)
  ↓
카테고리 자동 분류 + 페르소나 선택
  ↓
Post DB INSERT
  ↓
Sheets B열 → PUBLISHED (또는 FAILED)
  ↓
BotLog 기록 + Slack #로그 알림
```

---

## Google Sheets 운영 방법

### Sheets 접근
- 스프레드시트 ID: `SHEETS_SCRAPER_ID` 환경변수에 저장
- 탭: `사는이야기` (STORY), `활력충전소` (HUMOR)

### 열 구성

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

### 상태값 (B열)

| 상태 | 의미 |
|---|---|
| (비어있음) | PENDING — 봇이 가져감 |
| `PENDING` | 명시적 대기 |
| `PROCESSING` | 봇이 처리 중 |
| `PUBLISHED` | 게시 완료 |
| `FAILED` | 실패 (G열에 오류 내용) |
| `SKIPPED` | 중복 등으로 스킵 |

> ⚠️ **FAILED/PROCESSING으로 굳은 행**: 다시 올리려면 B열 내용을 지우거나 PENDING으로 변경. 중복 게시 걱정 없음 (DB 중복 체크 로직 있음).

---

## 페르소나 매핑

| ID | 닉네임 | 담당 카테고리 | 게시판 |
|---|---|---|---|
| C | ㅋㅋ요정 | 유머 | HUMOR |
| E | 봄바람 | 일상, 고민 | STORY |
| H | 매일걷기 | 건강 | STORY |
| I | 한페이지 | 힐링 | HUMOR |
| P | 오후세시 | 추천, 자랑, 자녀, 기타 | STORY, HUMOR |

---

## 스케줄 상세

### GitHub Actions (오유/네이트판)

| 시간 (KST) | UTC cron | 워크플로우 | 잡 |
|---|---|---|---|
| 11:00 | `0 2 * * *` | `agents-cafe.yml` | `sheet-scrape` |
| 21:00 | `0 12 * * *` | `agents-cafe.yml` | `sheet-scrape` |

환경변수: `SHEET_SCRAPER_EXCLUDE_SITE=fmkorea` (펨코 제외)

### 로컬 Mac launchd (펨코)

| 시간 (KST) | plist | 실행 명령 |
|---|---|---|
| 11:30 | `com.unao.fmkorea-scraper.plist` | `run-local-fmkorea.ts --site fmkorea` |
| 21:30 | `com.unao.fmkorea-scraper.plist` | `run-local-fmkorea.ts --site fmkorea` |

---

## 관련 링크

| 항목 | 경로/URL |
|------|---------|
| 메인 스크래퍼 | `agents/community/sheet-scraper.ts` |
| Sheets 클라이언트 | `agents/community/sheets-client.ts` |
| 사이트 설정 | `agents/community/site-configs.ts` |
| 펨코 로컬 런처 | `agents/community/run-local-fmkorea.ts` |
| 이미지 파이프라인 | `agents/community/image-pipeline.ts` |
| 콘텐츠 변환 | `agents/community/content-transformer.ts` |
| GA 워크플로우 | `.github/workflows/agents-cafe.yml` |
| runner.ts 핸들러 | `community:sheet-scrape`, `community:fmkorea-scrape` |
| Google Sheets | SHEETS_SCRAPER_ID 환경변수로 접근 |
| 사는이야기 게시판 | https://age-doesnt-matter.com/community/stories |
| 웃음방 게시판 | https://age-doesnt-matter.com/community/humor |

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 | 커밋 |
|------|---------|------|------|
| 2026-04-21 | `agents-cafe.yml` sheet-scrape 잡 `if` 조건 수정 (`github.event.schedule` → `github.event_name == 'schedule'`) | `github.event.schedule` 매칭이 GA 런타임에서 동작 안 해 잡이 계속 skipped 됨 | `f706f1a` |
| 2026-04-21 | `agents-cafe.yml` Install Playwright Chromium 스텝 `cd agents &&` 추가 | 루트 playwright vs agents playwright 버전 불일치로 chromium 경로 오류 발생 | — |
| 2026-04-21 | 이 기획서 최초 작성 | 운영 문서 관리 체계 도입 | — |

---

## 이슈 히스토리

### [2026-04-21] 오유/네이트판 게시 0건 — GA sheet-scrape 잡 미실행

- **증상**: 2026-04-01 이후 오유/네이트판 게시글이 전혀 올라오지 않음
- **진단 과정**:
  1. BotLog 조회 → 모든 기록이 `siteOnly:"fmkorea"` → 로컬 launchd 기록만 있음
  2. GA run list 확인 → `sheet-scrape` 잡이 매번 `skipped` 상태
  3. 워크플로우 if 조건 분석 → `github.event.schedule == '0 2 * * *'` 조건이 GA 런타임에서 매칭 실패
- **원인**: `github.event.schedule` 값 비교 조건이 실제 GA에서 동작하지 않아 잡 자체가 실행 안 됨
- **해결**: if 조건을 `github.event_name == 'schedule'`로 단순화 (`f706f1a`)
- **재발 방지**: 워크플로우 잡 if 조건은 `github.event_name`으로 판단, cron 분기는 determine 스텝으로 처리

### [2026-04-21] 오유/네이트판 게시 0건 — GA Playwright chromium 버전 불일치

- **증상**: GA sheet-scrape 잡이 실행됐으나 `browserType.launch: Executable doesn't exist at chromium_headless_shell-1217/...` 오류로 0건 게시
- **진단 과정**:
  1. if 조건 수정 후 수동 GA 트리거 (`gh workflow run agents-cafe.yml -f step=sheet-scrape`)
  2. 로그 확인 → `11건 PENDING 발견` 후 바로 chromium 실행 오류
  3. Install Playwright Chromium 스텝이 루트 `npx playwright install` 실행 → 루트 playwright 버전 기준 chromium 설치
  4. 실제 실행은 `agents/` playwright 사용 → 다른 버전 번호의 chromium 경로 참조
- **원인**: `npx playwright install chromium --with-deps` 가 루트 디렉토리에서 실행되어 `agents/` playwright 버전과 불일치
- **해결**: `cd agents && npx playwright install chromium --with-deps` 로 변경
- **재발 방지**: playwright install 스텝은 항상 실행 컨텍스트(agents/)와 동일한 디렉토리에서 실행

---

## 트러블슈팅 체크리스트

이슈 발생 시 순서대로 확인:

### 1. GA 실행 이력 확인
```bash
gh run list --workflow=agents-cafe.yml --limit=20
gh run view <run-id> --json jobs | python3 -c "import json,sys; d=json.load(sys.stdin); [print(j['name'], j['conclusion']) for j in d['jobs']]"
```
→ `sheet-scrape` 잡이 `skipped`이면 워크플로우 if 조건 문제

### 2. BotLog 조회
```sql
SELECT "logData", status, "createdAt" FROM "BotLog"
WHERE action = 'SHEET_SCRAPE'
ORDER BY "createdAt" DESC
LIMIT 10;
```
→ `siteOnly:"fmkorea"`만 있고 `siteExclude:"fmkorea"` 없으면 GA 미실행

### 3. Sheets B열 상태 확인
- 사는이야기/활력충전소 탭 열기
- B열이 `FAILED` / `PROCESSING`으로 굳어있으면 B열 내용 지우기 (→ PENDING 자동 처리)

### 4. 수동 GA 트리거
```bash
gh workflow run agents-cafe.yml -f step=sheet-scrape
```
→ 15분 후 BotLog에 `siteExclude:"fmkorea"` 기록 확인

### 5. 펨코 로컬 launchd 상태 확인 (펨코 이슈 시)
```bash
launchctl list | grep fmkorea
# 실행 로그
tail -50 /tmp/fmkorea-scraper.log
```
