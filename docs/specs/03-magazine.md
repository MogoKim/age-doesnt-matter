# 03. 매거진 (목록/상세/OG/CPS)

## 개요
50·60대 타깃 큐레이션 콘텐츠(MAGAZINE 타입 Post)를 목록/상세 형태로 제공하며, SEO 메타데이터·구조화 데이터·광고(AdSense/쿠팡)·CPS 상품 링크를 포함하는 읽기 전용 매거진 기능.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/magazine` | 매거진 목록 (피처 카드 1건 + 2열/4열 그리드) | 불필요 |
| `/magazine/[id]` | 매거진 상세 (본문·댓글·좋아요·CPS 상품·광고) | 불필요 (댓글·좋아요 상태 확인 시 옵션) |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/api/magazine` | 매거진 목록 조회 (카테고리 필터·커서 페이지네이션·limit) | 불필요 |

### 쿼리 파라미터 (`GET /api/magazine`)

| 파라미터 | 타입 | 기본값 | 제한 |
|---------|------|--------|------|
| `category` | string | - | - |
| `cursor` | string (cuid) | - | - |
| `limit` | number | 10 | 최대 50 |

### Rate Limit
- 키: `magazine` / IP 기준 최대 **60 req/window**

---

## 데이터 모델 (주요 필드)

### Post (boardType = `MAGAZINE`)

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `boardType` | `MAGAZINE` | 매거진 고정 |
| `category` | String? | 건강·재테크·여행 등 분류 |
| `title` | String | 제목 |
| `content` | String | HTML 본문 (sanitize 후 렌더링) |
| `summary` / `preview` | String? | 목록·OG용 요약 (`getPostDetail` 반환 필드명: `preview`) |
| `thumbnailUrl` | String? | 대표 이미지 |
| `viewCount` | Int | 조회수 (비정규화) |
| `likeCount` | Int | 좋아요 수 |
| `commentCount` | Int | 댓글 수 |
| `status` | `PUBLISHED` 등 | 발행 상태 |
| `source` | `PostSource` | 작성 출처 |
| `createdAt` / `updatedAt` | DateTime | 생성·수정 시각 |
| `publishedAt` | DateTime? | 발행 일시 |
| `seoTitle` / `seoDescription` | String? | SEO 메타 (모델에 존재, 현재 페이지에서는 미사용) |

### CpsLink

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `postId` | String | FK → Post |
| `productName` | String | 상품명 |
| `productUrl` | String | 쿠팡 등 상품 링크 |
| `productImageUrl` | String? | 상품 이미지 |
| `rating` | Float? | 상품 평점 |

---

## 핵심 비즈니스 로직

### 1. 게시글 유효성 검사
- `getPostDetail(id)` 결과가 `null` 이거나 `boardType !== 'MAGAZINE'`이면 **404 (`notFound()`)** 반환.

### 2. 본문 HTML 보안 처리
- `sanitizeMagazineHtml()` → DOMPurify 계열 서버사이드 sanitize로 XSS 제거.
- `proxyMagazineImages()` → 외부 이미지 URL을 내부 프록시 경로로 치환 (이미지 핫링크 방지 및 리사이징 추정).

### 3. 매거진 목록 캐싱
- `unstable_cache`로 `getMagazineList({ limit: 20 })` 결과를 캐시 키 `['magazine-list']`로 저장, **60초 revalidate**.
- `/api/magazine` API는 캐시 없이 직접 조회 (파라미터가 동적이므로).

### 4. 목록 레이아웃 분기
- `posts[0]` → **FeaturedCard** (대형, 우선순위 `priority` 이미지 로딩).
- `posts[1..8]` → 2열/4열 그리드 **MagazineCard** → 쿠팡 배너 광고 삽입 → `posts[9..]` 나머지 그리드.
- 게시글 0건 시 빈 상태 메시지 표시.

### 5. SEO / 구조화 데이터
- `generateMetadata()`로 페이지별 동적 OG 메타 생성:
  - `og:type = article`
  - `twitter:card = summary_large_image`
  - `canonical` URL: `https://age-doesnt-matter.com/magazine/[id]`
  - 썸네일 없을 시 `/logo.png` fallback.
- 상세 페이지에 **JSON-LD** (`schema.org/Article`) 인라인 삽입:
  - `author`는 항상 Organization `'우나어 매거진'` (개인 저자 미노출).
  - `publisher`: Organization `'우리 나이가 어때서'`.

### 6. 인증(세션) 처리
- 상세 페이지에서 `auth()`로 `userId` 추출 → `getPostDetail(id, userId)` 및 `getCommentsByPostId(id, userId)` 에 전달 (좋아요·스크랩 상태 등 사용자별 데이터 포함 목적).
- 비로그인 시 `userId = undefined`로 처리 (에러 없이 동작).

### 7. CPS 상품 노출 조건
- `cpsLinks.length > 0`일 때만 추천 상품 섹션 렌더링.
- 해당 Post의 CpsLink를 직접 Prisma 쿼리로 조회 (`prisma.cpsLink.findMany`).

### 8. GTM 이벤트
- 상세 페이지 마운트 시 `magazine_view` GA4 이벤트 발행:
  - 파라미터: `article_id`, `article_title`, `category`.

---

## UI 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `MagazinePage` | `magazine/page.tsx` | 목록 페이지 (서버 컴포넌트) |
| `FeaturedCard` | `magazine/page.tsx` (내부) | 첫 번째 글 대형 카드 |
| `MagazineCard` | `magazine/page.tsx` (내부) | 나머지 글 소형 그리드 카드 |
| `MagazineDetailPage` | `magazine/[id]/page.tsx` | 상세 페이지 (서버 컴포넌트) |
| `ActionBar` | community/ActionBar | 좋아요·스크랩·공유 등 액션 바 |
| `CommentSection` | community/CommentSection | 댓글 목록 + 입력 |
| `GTMEventOnMount` | common/GTMEventOnMount | 클라이언트 측 GTM 이벤트 트리거 |
| `AdSenseUnit` | ad/AdSenseUnit | 인아티클 Google AdSense 광고 (`IN_ARTICLE` 슬롯) |
| `CoupangSearchWidget` | ad/CoupangSearchWidget | 쿠팡 검색형 위젯 광고 |
| `FeedAd` | ad/FeedAd | 피처 카드 하단 피드 광고 |
| `CoupangBanner` | ad/CoupangBanner | 목록 8번째 카드 이후 쿠팡 배너 (`mobile` preset) |
| `MagazineLoading` | `magazine/loading.tsx` | 목록 Suspense 스켈레톤 (4개 카드 pulse) |
| `MagazineDetailLoading` | `magazine/[id]/loading.tsx` | 상세 Suspense 스켈레톤 (헤더·본문·액션바·댓글 pulse) |

---

## 미완성/TODO 항목

| 항목 | 근거 |
|------|------|
| **상세 페이지 CPS 섹션 렌더링 코드 누락** | `magazine/[id]/page.tsx` 코드가 CPS 블록 `<h3 className="text-body font-bold ...` 직후에서 파일이 잘려 있어 실제 상품 렌더링 JSX 미확인 |
| **`getMagazineList` 무한 스크롤 미구현** | API는 `cursor` 파라미터를 지원하나, 목록 페이지(`/magazine`)는 `limit: 20` 고정으로 단일 페이지 렌더링만 수행; 클라이언트 측 무한 스크롤·페이지네이션 UI 없음 |
| **`seoTitle` / `seoDescription` 필드 미활용** | DB 모델에 존재하지만 `generateMetadata`에서 사용하지 않고 `post.preview`(summary)를 직접 사용 |
| **조회수(`viewCount`) 증가 로직 미확인** | 상세 페이지 코드 내에 viewCount 증가 API 호출 없음 (`getPostDetail` 내부 처리 여부 불명) |
| **`CoupangSearchWidget` 상세 페이지 배치 미확인** | import는 존재하나 코드 잘림으로 실제 렌더링 위치 불명