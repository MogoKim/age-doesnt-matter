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

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04 | GHA cron 미실행 | agents-community.yml 조건 오류 | cron 조건 수정 완료 |
| 2026-04 | Playwright chromium 크래시 (GHA) | ubuntu-latest chromium 버전 불일치 | `--with-deps` 플래그 추가 + 버전 고정 |
