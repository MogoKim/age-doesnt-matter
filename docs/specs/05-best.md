# 05. 인기글/베스트 (오늘/주간/명예의전당)

## 개요
커뮤니티 내 인기 게시글을 오늘/이번 주/명예의전당 탭으로 분류하여 보여주는 베스트 게시글 모음 페이지.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/best` | 인기글 메인 페이지 (기본: 오늘의 인기글 탭) | ❌ |
| `/best?tab=daily` | 오늘의 인기글 탭 | ❌ |
| `/best?tab=weekly` | 이번 주 인기글 탭 | ❌ |
| `/best?tab=fame` | 명예의 전당 탭 | ❌ |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/api/best` | HOT 게시글 또는 명예의전당 게시글 조회 | ❌ |

### `/api/best` 쿼리 파라미터

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `type` | `'hot' \| 'fame'` | `'hot'` | 조회 유형 |
| `sort` | `'recent' \| 'likes'` | `'recent'` | 정렬 기준 |
| `cursor` | `string` | — | 커서 기반 페이지네이션 |
| `limit` | `number` | `10` | 조회 개수 (최대 50) |

---

## 데이터 모델 (주요 필드)

```
Post {
  id              String          // 게시글 식별자
  boardType       BoardType       // STORY | 기타 (게시판 구분)
  title           String          // 제목
  content         String          // 본문
  summary         String?         // 요약 (preview로 활용)
  authorId        String          // 작성자 ID
  status          PostStatus      // PUBLISHED 등
  promotionLevel  PromotionLevel  // NORMAL | HOT | HALL_OF_FAME
  viewCount       Int             // 조회수
  likeCount       Int             // 공감수
  commentCount    Int             // 댓글수
  trendingScore   Float           // 트렌딩 점수 (일간/주간 인기글 산정에 활용 추정)
  lastEngagedAt   DateTime?       // 마지막 인터랙션 시간
  createdAt       DateTime

  author {
    nickname      String
    gradeEmoji    String          // 회원 등급 이모지
  }
}
```

---

## 핵심 비즈니스 로직

### 탭별 게시글 조회 전략

| 탭 | 호출 함수 | 캐시 키 | 캐시 TTL |
|----|-----------|---------|---------|
| `daily` | `getDailyTrendingPosts(10)` | `best-daily` | 60초 |
| `weekly` | `getWeeklyTrendingPosts(10)` | `best-weekly` | 60초 |
| `fame` | `getHallOfFamePosts({ limit: 10 })` | `best-fame` | 60초 |

- 세 탭의 데이터를 **`Promise.all`로 병렬 조회**한 뒤, 현재 탭에 해당하는 데이터만 렌더링
- `unstable_cache`(Next.js)를 사용해 60초 단위로 서버 사이드 캐싱

### 명예의 전당 진입 조건
- **공감(좋아요) 50개 이상** 달성 시 명예의전당 등록 (빈 상태 메시지 기준)
- `promotionLevel = HALL_OF_FAME` 배지 표시

### HOT 배지 조건
- `promotionLevel = HOT`인 게시글에 🔥 HOT 배지 표시

### 게시판 구분 표시
- `boardType === 'STORY'` → "사는이야기"
- 그 외 → "활력충전소"
- `BOARD_TYPE_TO_SLUG` 매핑으로 상세 링크(`/community/{slug}/{id}`) 생성

### Rate Limiting (API)
- `/api/best` 엔드포인트: 동일 클라이언트 기준 최대 **60회/단위시간** 제한
- 초과 시 rate limit 응답 반환

### 커서 기반 페이지네이션 (API)
- `/api/best`에서 `cursor` 파라미터로 페이지네이션 지원
- `limit` 최대값 50으로 서버에서 강제 제한

---

## UI 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `BestPage` | `src/app/(main)/best/page.tsx` | 인기글 메인 페이지 (서버 컴포넌트), 탭 파라미터 파싱 및 데이터 패칭 |
| `BestLoading` | `src/app/(main)/best/loading.tsx` | 스켈레톤 로딩 UI (헤더 1개 + 탭 버튼 2개 + 카드 6개 펄스 애니메이션) |
| `BestPostCard` | `best/page.tsx` (인라인) | 개별 인기글 카드 — 게시판 배지, HOT/FAME 배지, 제목, 미리보기, 작성자·통계 표시 |
| `EmptyState` | `best/page.tsx` (인라인) | 게시글 없을 때 탭별 안내 메시지 표시 |
| `FeedAd` | `src/components/ad/FeedAd` | 피드 중간 광고 (3번째, 9번째 카드 이후 삽입) |
| `CoupangBanner` | `src/components/ad/CoupangBanner` | 쿠팡 배너 광고 (6번째 카드 이후, 모바일 전용) |
| `ResponsiveAd` | `src/components/ad/ResponsiveAd` | 반응형 광고 래퍼 (모바일/데스크톱 분기) |

### 광고 삽입 위치

| 게시글 인덱스 (0-based) | 광고 유형 |
|------------------------|----------|
| idx === 2 (3번째 글 이후) | `FeedAd` |
| idx === 5 (6번째 글 이후) | `CoupangBanner` (모바일) / 없음 (데스크톱) |
| idx === 8 (9번째 글 이후) | `FeedAd` |

### 탭 네비게이션 반응형 처리
- 모바일(`sm` 미만): 탭 레이블 축약 표시 ("인기글", "주간", "명예의전당")
- 데스크톱(`sm` 이상): 전체 레이블 표시 ("오늘의 인기글", "이번 주 인기글", "명예의전당")

---

## 미완성/TODO 항목

| 항목 | 위치 | 내용 |
|------|------|------|
| `EmptyState` 컴포넌트 구현 미완 | `best/page.tsx` 하단 | `function EmptyState` 함수 본문이 `ret`에서 잘린 채로 코드가 종료됨 — 실제 렌더 내용 불명 |
| `/api/best`와 페이지 데이터 조회 불일치 | `best/page.tsx` vs `api/best/route.ts` | 페이지는 `getDailyTrendingPosts` / `getWeeklyTrendingPosts`를 직접 호출하지만, API 라우트는 `getHotPosts` / `getHallOfFamePosts`만 제공 — daily/weekly 탭을 API를 통해 클라이언트에서 조회하는 경로 없음 |
| 명예의전당 커서 페이지네이션 UI 미구현 | `best/page.tsx` | API는 cursor 기반 페이지네이션을 지원하나, 페이지 UI에는 "더 보기" 또는 페이지 이동 UI가 없음 (서버 컴포넌트에서 limit=10 고정) |
| `boardLabel` 매핑 불완전 | `BestPostCard` | `STORY` → "사는이야기", 그 외 → "활력충전소" 일괄 처리 — `BoardType`이 추가될 경우 대응 안 됨 |