# 02. 일자리 (목록/상세/필터/스크랩)

## 개요
50·60대 시니어를 위한 나이 무관 채용공고 조회 서비스로, 지역·태그 기반 필터링, 상세 정보 열람, 지원 연결을 제공한다.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/jobs` | 일자리 목록 (퀵태그·필터 지원) | ❌ |
| `/jobs/[id]` | 일자리 상세 (공고 정보, 지원 버튼, 댓글) | ❌ (스크랩·댓글 작성은 ✅) |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/api/jobs` | 일자리 목록 조회 (region, tags, cursor, limit 파라미터) | ❌ |

> **내부 서버 쿼리 (API 라우트 아님)**
> - `getJobDetail(id, userId?)` — 일자리 상세 조회 (조회수 포함 추정)
> - `getJobList({ region, tags, cursor, limit })` — 목록 조회, 커서 기반 페이지네이션 지원
> - `getCommentsByPostId(id, userId?)` — 해당 공고의 댓글 목록 조회

---

## 데이터 모델 (주요 필드)

### Job (JobCardItem / JobDetail)

```
Job {
  id          String       // 공고 고유 ID
  title       String       // 공고 제목
  company     String       // 회사명
  location    String       // 근무지 (상세 주소)
  region      String       // 지역 (시·도 단위, 필터용)
  salary      Json/String  // 급여 정보 (formatSalary로 정규화)
  workHours   String?      // 근무 시간 (optional)
  workDays    String?      // 근무 요일 (optional)
  content     String       // 공고 본문 (HTML)
  applyUrl    String?      // 외부 지원 URL (optional)
  highlight   String?      // 목록 요약 문구 (optional)
  tags        String[]     // 태그 배열 (나이무관, 초보환영, 오전, 오후, 주3일, 주5일 등)
  isUrgent    Boolean      // 급구 여부
  pickPoints  { icon?: String, point: String }[]  // "이런 분을 찾아요" 항목
  viewCount   Int          // 조회수
  commentCount Int         // 댓글수
  createdAt   DateTime     // 등록일
}
```

> 스크랩(Scrap) 관련 필드·모델은 `ActionBar` 컴포넌트가 임포트되어 있으나 실제 렌더링 코드가 코드 파일 말미에서 잘려 있어 구체적인 모델 구조 확인 불가 → **미완성 항목 참조**

---

## 핵심 비즈니스 로직

### 1. 목록 조회 및 필터링
- `region` (단일 선택), `tags` (복수 선택, 콤마 구분) 두 가지 차원으로 필터링
- URL 쿼리스트링(`?region=서울&tags=나이무관,주3일`) 기반으로 서버 컴포넌트에서 직접 쿼리 실행
- `getJobList` 반환값은 `{ jobs, nextCursor? }` 구조로 커서 기반 무한 스크롤을 지원하도록 설계되어 있으나, 목록 페이지 UI에서는 limit=20 고정 단일 페이지 렌더링만 구현됨

### 2. API Rate Limiting
- `/api/jobs` 엔드포인트에 `checkApiRateLimit` 적용 (max: 60 req/window)
- limit 파라미터 최대값 50으로 서버에서 강제 클램핑

### 3. 상세 페이지 — 인증 연동
- 비로그인 상태에서도 상세 조회 가능
- `userId`가 있을 경우 `getJobDetail`, `getCommentsByPostId`에 전달 → 스크랩 여부·댓글 좋아요 여부 등 사용자별 상태 조회 용도로 추정

### 4. 급여 정규화
- `formatSalary(job.salary)` 유틸로 표시 형식 통일
- 상세 페이지 JSON-LD 생성 시 `"월 280만원"` 형태를 정규식으로 파싱 → `MonetaryAmount` 스키마 객체로 변환
  - 범위 급여 (`월 200~280만원`) 지원: minValue / maxValue 분리

### 5. SEO / 구조화 데이터
- 페이지별 동적 `<Metadata>` 생성: `{title} — {company}` / `{location} · {salary}`
- `JobPosting` JSON-LD 자동 삽입 (title, description, datePosted, hiringOrganization, jobLocation, baseSalary, directApply, employmentType)
- `revalidate = 120` (목록 페이지 ISR, 2분 주기 재생성)

### 6. GA4 이벤트
- 상세 페이지 마운트 시 `job_view` 이벤트 발송 (`job_id`, `job_title` 포함)

### 7. 광고 삽입 규칙 (목록 페이지)
- 목록 8개 단위 반복 기준:
  - 4번째 카드 이후 → `FeedAd` (AdSense 피드 광고)
  - 8번째 카드 이후 → `CoupangBanner` (쿠팡 배너)
- 상세 페이지 본문 하단 → `AdSenseUnit` (in-article 포맷)

### 8. 태그·필터 선택 UX
- **QuickTags**: 목록 상단 수평 스크롤 바. 토글 클릭 → 즉시 URL 업데이트 및 페이지 이동 (cursor 파라미터 초기화)
- **FilterPanel**: 모달 바텀시트(모바일) / 센터 모달(데스크톱). ESC 키 닫기, 배경 스크롤 잠금, 초기화·적용 버튼 분리
  - 지역: 단일 선택 (전국 17개 시·도 + 전체)
  - 근무시간: 복수 선택 (오전, 오후, 풀타임)
  - 조건: 복수 선택 (나이무관, 초보환영, 주3일, 주5일)

---

## UI 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `JobsPage` (Server) | `app/(main)/jobs/page.tsx` | 목록 페이지 레이아웃, 필터 파라미터 수신, 공고 카드 렌더링 |
| `JobCard` (Server, inline) | `app/(main)/jobs/page.tsx` | 개별 공고 카드 (제목, 급여, 태그, 조회수, 댓글수, 등록시간, 급구 배지) |
| `JobDetailPage` (Server) | `app/(main)/jobs/[id]/page.tsx` | 상세 페이지 레이아웃 (정보카드, 본문, 지원버튼, 댓글) |
| `JobFilterButton` (Client) | `components/features/jobs/JobFilterButton.tsx` | 필터 패널 열기 트리거 버튼 (활성 필터 시 색상 변경) |
| `JobFilterPanel` (Client) | `components/features/jobs/JobFilterPanel.tsx` | 지역·근무시간·조건 복합 필터 모달 |
| `JobQuickTags` (Client) | `components/features/jobs/JobQuickTags.tsx` | 자주 쓰는 태그 빠른 선택 가로 스크롤 바 |
| `JobPostingJsonLd` (Server, inline) | `app/(main)/jobs/[id]/page.tsx` | Google JobPosting 구조화 데이터 script 태그 생성 |
| `JobsLoading` | `app/(main)/jobs/loading.tsx` | 목록 페이지 Skeleton UI |
| `JobDetailLoading` | `app/(main)/jobs/[id]/loading.tsx` | 상세 페이지 Skeleton UI |
| `ActionBar` (Client) | `components/features/community/ActionBar` | 좋아요·스크랩·공유 액션 바 (커뮤니티 공용) |
| `CommentSection` (Client) | `components/features/community/CommentSection` | 댓글 목록 및 작성 (커뮤니티 공용) |
| `GTMEventOnMount` | `components/common/GTMEventOnMount` | 마운트 시 GTM/GA4 이벤트 발송 |
| `AdSenseUnit` | `components/ad/AdSenseUnit` | Google AdSense 광고 단위 |
| `FeedAd` | `components/ad/FeedAd` | 목록 피드 삽입 광고 |
| `CoupangBanner` | `components/ad/CoupangBanner` | 쿠팡 파트너스 배너 |
| `InfoRow` (Server, inline) | `app/(main)/jobs/[id]/page.tsx` | 아이콘+라벨+값 형태의 정보 행 (정보카드 내부용) |

---

## 미완성/TODO 항목

| 구분 | 위치 | 내용 |
|------|------|------|
| **코드 잘림** | `app/(main)/jobs/[id]/page.tsx` 말미 | `ActionBar` 컴포넌트 렌더링 코드가 중간에