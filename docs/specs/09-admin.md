# 09. 어드민 (대시보드/회원/콘텐츠/신고/배너/팝업/설정/감사로그)

## 개요
우나어(age-doesnt-matter.com) 서비스의 관리자 전용 패널로, 회원·콘텐츠·신고·배너·팝업·설정·감사로그를 통합 관리하며 봇 상태 모니터링과 핵심 KPI 대시보드를 제공한다.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/admin/login` | 어드민 로그인 페이지 | ❌ |
| `/admin` (panel layout) | 어드민 패널 공통 레이아웃 (사이드바 + 헤더) | ✅ 어드민 세션 |
| `/admin` (index) | 대시보드 — KPI 카드, 긴급 알림, 봇 상태 | ✅ |
| `/admin/analytics` | 데이터 분석 — DAU/WAU/MAU 등 7개 KPI (상세 탭은 준비 중) | ✅ |
| `/admin/members` | 회원 목록 — 상태·검색·커서 페이지네이션 | ✅ |
| `/admin/content` | 콘텐츠(게시글) 목록 — 게시판·상태·출처·검색 필터 | ✅ |
| `/admin/reports` | 신고 목록 — 상태별 필터, 커서 페이지네이션 | ✅ |
| `/admin/banners` | 배너·광고 관리 — 히어로 배너 탭 / 광고 배너 탭 | ✅ |
| `/admin/popups` | 팝업 관리 — 팝업 목록 및 CRUD | ✅ |
| `/admin/settings` | 설정 — 게시판 설정 탭 / 금지어 관리 탭 | ✅ |
| `/admin/audit-log` | 감사 로그 — 액션·검색·커서 페이지네이션 | ✅ |

---

## API 엔드포인트

> 페이지 코드에서 직접 호출되는 서버 함수(Server Action / Query 함수) 기반으로 정리. 별도 REST 라우트 파일은 코드에 포함되지 않아 명시적 HTTP 경로는 확인 불가.

| 종류 | 함수/액션 | 설명 | 위치 |
|------|-----------|------|------|
| Query | `getDashboardStats()` | 오늘 방문자·가입자·게시글·댓글 수, 미처리 신고·봇 검수 대기 건수 | `lib/queries/admin` |
| Query | `getRecentBotLogs()` | 봇 최근 실행 로그(botType, status, 수집/발행/검수 카운트) | `lib/queries/admin` |
| Query | `getAnalyticsStats()` (cached) | DAU/WAU/MAU, 오늘 글·댓글, 활성 회원, 미처리 신고 (캐시 10분) | `lib/queries/admin` (unstable_cache) |
| Query | `getMemberList({ status, search, cursor })` | 회원 목록 조회 (상태·검색·커서 필터) | `lib/queries/admin` |
| Query | `getContentList({ boardType, status, source, search, cursor })` | 게시글 목록 조회 (게시판·상태·출처·검색·커서 필터) | `lib/queries/admin` |
| Query | `getReportList({ status, cursor })` | 신고 목록 조회 (상태·커서 필터) | `lib/queries/admin` |
| Query | `getBannerList()` | 히어로 배너 전체 목록 | `lib/queries/admin` |
| Query | `getAdBannerList({ slot, cursor })` | 광고 배너 목록 (슬롯·커서 필터) | `lib/queries/admin` |
| Action | `getPopupList()` | 팝업 전체 목록 (Server Action) | `lib/actions/popups` |
| Query | `getBoardConfigList()` | 게시판 설정 목록 | `lib/queries/admin` |
| Query | `getBannedWordList({ category, search, cursor })` | 금지어 목록 (카테고리·검색·커서 필터) | `lib/queries/admin` |
| Query | `getAuditLogs({ action, search, cursor })` | 감사 로그 목록 (액션·검색·커서 필터) | `lib/queries/admin` |

---

## 데이터 모델 (주요 필드)

### User (회원)
```
id, email, nickname, profileImage, providerId(카카오 UID)
role(USER/ADMIN), grade(SPROUT…), birthYear, gender, regions[], interests[]
status(ACTIVE/SUSPENDED/WITHDRAWN), suspendedUntil, withdrawnAt
postCount, commentCount, receivedLikes (비정규화)
lastLoginAt, createdAt
```

### Post (게시글/콘텐츠)
```
id, boardType, category, title, content, summary, thumbnailUrl
authorId, source(USER/BOT 등)
status(PUBLISHED/HIDDEN…), promotionLevel, isPinned, pinnedPosition
viewCount, likeCount, commentCount, scrapCount, reportCount (비정규화)
trendingScore, lastEngagedAt
sourceUrl, sourceSite (외부 스크랩 출처)
publishedAt, createdAt
```

### Report (신고)
```
id, userId(신고자), postId?, commentId?
reason(ReportReason enum), description
status(PENDING/PROCESSED…), action(ReportAction enum)?
processedBy(AdminAccount.id), processedAt
createdAt
→ reporter(User), post(Post)?, comment(Comment)?, processor(AdminAccount)?
```

### Banner (히어로 배너)
```
id, title, description, imageUrl, linkUrl
startDate, endDate, priority, isActive
createdAt, updatedAt
```

### Popup (팝업)
```
id, type(PopupType enum), target(ALL/…), targetPaths[]
title, content(Text), imageUrl, linkUrl, buttonText
startDate, endDate, priority, isActive
showOncePerDay, hideForDays
impressions, clicks (노출·클릭 카운트)
createdAt, updatedAt
```

### AdBanner (광고 배너) — AdSlot 열거형 참조
```
slot(AdSlot enum) 기반 광고 배너 (상세 필드는 코드에서 미노출)
```

### BannedWord (금지어) — BannedWordCategory 열거형 참조
```
category(BannedWordCategory enum), word, search/cursor 지원
```

### BotLog (봇 실행 로그)
```
id, botType(JOB/HUMOR/STORY/THREAD)
status(SUCCESS/PARTIAL/FAILED)
collectedCount, publishedCount, reviewPendingCount
```

### AuditLog (감사 로그)
```
action(action 필터), 검색·커서 페이지네이션 지원
(상세 필드는 AuditLogTable 컴포넌트에서 렌더링, 스키마 미포함)
```

### AdminAccount (어드민 계정)
```
id, nickname (getAdminSession() 반환값에서 확인)
Report.processedBy 외래키 대상
```

---

## 핵심 비즈니스 로직

### 인증·접근 제어
- 패널 레이아웃(`/admin/(panel)/layout.tsx`)에서 `getAdminSession()` 호출 → 세션 없으면 `/admin/login`으로 서버사이드 redirect
- 어드민 로그인은 별도 `/admin/login` 페이지(카카오 OAuth 아님, 자체 어드민 계정으로 추정)
- 어드민 메타데이터에 `robots: { index: false, follow: false }` 설정 → 검색엔진 노출 차단

### 대시보드 KPI
- **오늘 방문**: `User.lastLoginAt >= 오늘 00:00`
- **오늘 가입**: `User.createdAt >= 오늘 00:00`
- **오늘 글**: `Post.createdAt >= 오늘 00:00 AND status = PUBLISHED`
- **오늘 댓글**: `Comment.createdAt >= 오늘 00:00 AND status = ACTIVE`
- **미처리 신고**: `Report.status = PENDING` (긴급 알림 섹션에 표시)
- **봇 검수 대기**: `pendingBotReviews > 0` (긴급 알림 섹션에 표시)

### 분석 KPI (10분 캐시)
- DAU: `lastLoginAt >= 오늘 00:00`
- WAU: `lastLoginAt >= 7일 전`
- MAU: `lastLoginAt >= 30일 전`
- 총 회원: `status = ACTIVE`
- 미처리 신고: `Report.status = PENDING`

### 봇 상태 표시
- botType별 라벨: JOB(일자리), HUMOR(유머), STORY(이야기), THREAD(스레드)
- status별 뱃지: SUCCESS(✅ 정상/green), PARTIAL(⚠️ 부분/yellow), FAILED(❌ 실패/red)
- `reviewPendingCount > 0`이면 황색으로 강조 표시

### 배너 관리 탭 분기
- `tab=hero` (기본값): 히어로 배너 목록 → `BannerManager` 컴포넌트
- `tab≠hero`: 광고 배너 목록 → `AdBannerTable` 컴포넌트 (slot 필터 지원)

### 설정 탭 분기
- `tab=boards` (기본값): 게시판 설정 → `SettingsTabs` 내 보드 설정 UI
- `tab=banned-words` (추정): 금지어 관리 → 카테고리·검색 필터, 커서 페이지네이션

### 페이지네이션 전략
- 전 영역 **커서 기반(cursor) 페