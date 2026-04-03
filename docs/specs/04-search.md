# 04. 통합 검색 (키워드/탭별 결과)

## 개요
키워드를 입력하면 일자리·커뮤니티 게시글·매거진을 탭별로 통합 검색하고, 인기 검색어 노출 및 검색 이벤트를 로깅하는 기능.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/search` | 검색어 없는 초기 화면 — 검색 입력폼 + 인기 검색어 표시 | 불필요 |
| `/search?q={keyword}` | 기본 탭(`all`) 검색 결과 화면 | 불필요 (비로그인 허용, 세션 있으면 userId 로깅에 활용) |
| `/search?q={keyword}&tab={tab}` | 탭별 필터링 검색 결과 화면 (`all` / `jobs` / `posts` / `magazine`) | 불필요 |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/api/search?q={keyword}&tab={tab}` | 통합 검색 실행, 탭별 결과 JSON 반환 | 불필요 |

### 요청 파라미터 (`GET /api/search`)

| 파라미터 | 타입 | 필수 | 제약 |
|---------|------|------|------|
| `q` | string | ✅ | 2자 이상, 공백 trim |
| `tab` | string | ❌ | `all` \| `jobs` \| `posts` \| `magazine`, 기본값 `all` |

### 오류 응답

| 상태 코드 | 조건 |
|----------|------|
| `400` | `q` 누락 또는 2자 미만 |
| `400` | `tab` 값이 유효 목록 외 |
| `429` | IP 기반 Rate Limit 초과 (30회/분) |

---

## 데이터 모델 (주요 필드)

검색은 기존 `Post` 모델을 조회 기반으로 활용하며, 별도의 검색 전용 테이블은 코드에서 확인되지 않음.

### Post (검색 대상)

| 필드 | 타입 | 역할 |
|------|------|------|
| `id` | String | PK |
| `boardType` | BoardType (enum) | 탭 필터링 기준 (`jobs` / `posts` / `magazine` 등) |
| `title` | String | 키워드 매칭 대상 |
| `content` | String | 키워드 매칭 대상 |
| `summary` | String? | 검색 결과 미리보기 텍스트 용도 추정 |
| `thumbnailUrl` | String? | 결과 카드 이미지 |
| `status` | PostStatus | 공개 상태 필터 (PUBLISHED만 노출 추정) |
| `authorId` | String | 작성자 참조 |
| `createdAt` | DateTime | 정렬 기준 |

> `searchAll()` 및 `getPopularKeywords()`, `logSearchEvent()`의 내부 구현 파일이 제공되지 않아 DB 쿼리 세부 조건은 확인 불가.

---

## 핵심 비즈니스 로직

### 1. 검색어 유효성 검사
- 공백 `trim()` 처리 후 빈 문자열이면 초기 화면 렌더링 (오류 없음)
- API 레이어에서 2자 미만이면 `400` 반환

### 2. 탭 유효성 검사
- 허용 탭: `all`, `jobs`, `posts`, `magazine`
- 페이지 라우터: 허용 목록 외 값이면 `all`로 자동 fallback
- API 라우터: 허용 목록 외 값이면 `400` 반환 (페이지와 동작 다름)

### 3. Rate Limiting
- IP 기반 분당 30회 제한 (`x-forwarded-for` 헤더 첫 번째 IP 사용)
- IP 추출 실패 시 `'unknown'` 키로 단일 버킷 처리

### 4. 검색 이벤트 로깅
- 검색 실행 시 `logSearchEvent(query, session?.user?.id)` 호출
- 로그인 여부와 무관하게 로깅 (비로그인 시 `userId = undefined`)
- 페이지 렌더링(`searchAll`)과 병렬(`Promise.all`) 실행

### 5. 인기 검색어
- 검색어 유무와 관계없이 항상 `getPopularKeywords()` 호출하여 폼에 전달
- 검색 결과 화면에서도 검색폼에 인기 검색어 동시 표시

### 6. 초기 화면 vs 결과 화면 분기
```
query가 없음 → SearchForm(popularKeywords) 만 렌더링
query가 있음 → SearchForm + SearchTabs + SearchResults + FeedAd 렌더링
```

---

## UI 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `SearchForm` | `@/components/features/search/SearchForm` | 검색어 입력폼; `initialQuery`(현재 검색어), `popularKeywords`(인기 검색어 목록)를 props로 수신 |
| `SearchTabs` | `@/components/features/search/SearchTabs` | `all` / `jobs` / `posts` / `magazine` 탭 UI; 활성 탭(`activeTab`)과 현재 쿼리(`query`)를 props로 수신; `Suspense`로 감싸짐 |
| `SearchResults` | `@/components/features/search/SearchResults` | 탭별 검색 결과 목록 렌더링; `result`, `query`, `tab` props 수신 |
| `FeedAd` | `@/components/ad/FeedAd` | 검색 결과 하단 피드형 광고 삽입 (검색어 있을 때만 표시) |
| `SearchLoading` | `src/app/(main)/search/loading.tsx` | 페이지 로딩 중 스켈레톤 UI — 검색바 1개 + 항목 5개 pulse 애니메이션 |

### SearchLoading 스켈레톤 구조
```
검색바 영역 (h-12, w-full, rounded-xl)
라벨 영역  (h-6, w-48)
결과 카드  (h-20, rounded-xl) × 5
```

---

## 미완성/TODO 항목

| 항목 | 위치 | 내용 |
|------|------|------|
| `searchAll()` 내부 미확인 | `@/lib/queries/search` | 실제 DB 쿼리 로직, 탭별 필터 조건, 결과 정렬 기준 코드 미제공으로 확인 불가 |
| `getPopularKeywords()` 내부 미확인 | `@/lib/queries/search` | 인기 검색어 집계 기준(기간, 횟수 임계값 등) 코드 미제공 |
| `logSearchEvent()` 내부 미확인 | `@/lib/queries/search` | 로그 저장 대상 모델(별도 테이블 여부), 중복 처리 여부 코드 미제공 |
| `rateLimit()` 구현 미확인 | `@/lib/rate-limit` | 저장 백엔드(in-memory/Redis 등) 확인 불가; 서버리스 환경에서 in-memory인 경우 인스턴스 간 공유 안 됨 |
| IP `'unknown'` 처리 | `src/app/api/search/route.ts` | IP 추출 실패 시 `'unknown'` 단일 키로 Rate Limit 적용 → 모든 익명 요청이 동일 버킷 공유되는 잠재적 문제 |
| 최근 검색어 기능 | `src/app/(main)/search/page.tsx` | 주석에 "최근검색어 + 인기검색어" 언급되나 `SearchForm`에 `recentKeywords` 관련 props 없음 — 미구현이거나 클라이언트 로컬 스토리지에서 처리 추정 |
| 탭 fallback 불일치 | 페이지 vs API | 페이지는 잘못된 탭값을 `all`로 fallback하나 API는 `400`으로 거부 — 일관성 부재 |
| 검색 결과 페이지네이션 | `SearchResults` 내부 미확인 | 페이지/무한스크롤 여부 코드 미제공 |