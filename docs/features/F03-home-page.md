# 홈 페이지 운영 기획서 (F03)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-05-11 (F03-hero-banner.md → F03-home-page.md 확장)

---

## 목표

홈 방문자에게 서비스 가치를 즉각 전달하고 핵심 섹션으로 유도한다.
LCP 최적화로 첫 인상 속도를 확보하고, 섹션별 Suspense 스트리밍으로 체류시간을 높인다.
GA4 `home_card_click` 이벤트로 어느 섹션·순위 카드가 클릭되는지 실시간 파악한다.

---

## 컴포넌트 구조 (19개)

| 컴포넌트 | 파일 | 역할 |
|---------|------|------|
| HeroSlider | `home/HeroSlider.tsx` (서버) | DB 활성 배너 조회 + 폴백 슬라이드 3개 |
| HeroSliderClient | `home/HeroSliderClient.tsx` (클라이언트) | 슬라이더 렌더링·자동재생·터치 인터랙션 |
| IdentitySection | `home/IdentitySection.tsx` | 서비스 정체성 한 줄 카피 |
| PersonalGreeting | `home/PersonalGreeting.tsx` (클라이언트) | 로그인 유저 닉네임 환영 카드 |
| TrendingSection | `home/TrendingSection.tsx` | 지금 뜨는 이야기 (trendingScore 상위) |
| CommunitySection | `home/CommunitySection.tsx` | 소통 마당 최신 게시글 |
| Life2Section | `home/Life2Section.tsx` | 2막 준비 게시글 |
| MagazineSection | `home/MagazineSection.tsx` | 매거진 카드 4개 |
| JobSection | `home/JobSection.tsx` | 추천 일자리 카드 |
| ActivityPulse | `home/ActivityPulse.tsx` | 실시간 활성 유저 수 |
| MyActivity | `home/MyActivity.tsx` | 내 오늘 글·댓글·받은 좋아요 수 |
| HomeFaqSection | `home/HomeFaqSection.tsx` | FAQ UI 5개 + FAQPage JSON-LD Schema |
| SignupCard | `home/SignupCard.tsx` | 비회원 가입 유도 카드 |
| HomeSidebar | `home/HomeSidebar.tsx` | 데스크탑 우측 사이드바 (최신 커뮤니티) |
| HomeCardLink | `home/HomeCardLink.tsx` (클라이언트) | GA4 `home_card_click` 추적 래퍼 |
| AdInline | `home/AdInline.tsx` | 인라인 광고 슬롯 |
| EditorsPickSection | `home/EditorsPickSection.tsx` | 에디터 픽 섹션 (미사용/예약) |
| RecentActivityFeed | `home/RecentActivityFeed.tsx` | 최근 활동 피드 (미사용/예약) |
| HomePage.module.css | `home/HomePage.module.css` | 홈 전용 CSS |

마운트: `src/app/(main)/page.tsx`

---

## 데이터 흐름

```
page.tsx (서버 컴포넌트)
├── unstable_cache 60초
│   ├── getLatestJobs(5)         → JobSection
│   ├── getTrendingPosts(5)      → TrendingSection
│   ├── getLatestMagazinePosts(4) → MagazineSection
│   ├── getLatestCommunityPosts(5) → CommunitySection / HomeSidebar
│   ├── getLatestLife2Posts(5)   → Life2Section
│   └── getActivityPulseData()   → ActivityPulse
├── unstable_cache 10초
│   └── getUserCounts(userId)    → MyActivity
└── 캐시 없음 (즉시 반영)
    ├── auth()                   → PersonalGreeting / SignupCard
    └── getActiveBanners()       → HeroSlider
```

모든 섹션은 Suspense로 감싸져 독립 스트리밍. HeroSlider가 가장 먼저 전송(LCP).

---

## 히어로 배너 세부 기획

### 폴백 슬라이드 3개 (DB 배너 없을 때)

| 순서 | 제목 | CTA | 이동 | 테마색 |
|------|------|-----|------|--------|
| 1 | 우리 또래끼리 나이 걱정 없이 | 시작하기 | `/about` | Coral |
| 2 | 사는 이야기 함께 나눠요 | 이야기 보러가기 | `/community/stories` | Orange |
| 3 | 인생 2막 같이 준비해요 | 내일 찾기 | `/jobs` | Green |

### DB 배너 (어드민 운영)
- Prisma 모델: `Banner` — id, title, subtitle, ctaText, ctaUrl, imageUrl, gradient, isActive
- `getActiveBanners()` 캐시 없음 (즉시 반영)

### 인터랙션
- 자동 전환: 5,000ms | 터치 스와이프: 50px 임계값
- 첫 슬라이드 `priority=true` → LCP 우선 로드

---

## HomeCardLink 클릭 추적

5개 섹션(trending/community/magazine/jobs/life2)의 카드 및 더보기 링크에 래핑.

| 이벤트 | 파라미터 |
|--------|---------|
| `home_card_click` | `section`, `position`(0-based), `content_id`, `action`('card'/'more') |

GA4 실시간 → 이벤트 → `home_card_click` 에서 확인 가능.

---

## SEO / GEO 구조

| 스키마 | 위치 | 목적 |
|--------|------|------|
| Organization | `page.tsx` | 브랜드 엔티티 |
| WebSite + SearchAction | `page.tsx` | 구글 사이트링크 검색박스 |
| FAQPage | `HomeFaqSection.tsx` | GEO(AI 검색) 인용 최적화 |

---

## 광고 배치

| 위치 | 광고 |
|------|------|
| CommunitySection 다음 | AdSense HOME_SECTION (horizontal) |
| CommunitySection 다음 (모바일) | 쿠팡 배너 mobile preset |
| Life2Section 다음 | FeedAd (IN_FEED) |
| MagazineSection 다음 (모바일) | CoupangCarousel |

---

## 관련 링크

- 마운트: `src/app/(main)/page.tsx`
- 컴포넌트: `src/components/features/home/`
- DB 모델: `prisma/schema.prisma` — Banner
- 쿼리: `src/lib/queries/posts.ts`, `src/lib/queries/home.ts`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-26 | 히어로 imageUrl 필드 추가, 좌측 어두운 오버레이 | 실사 이미지 배너 지원 |
| 2026-04-27 | Feature 문서 최초 생성 (F03-hero-banner.md) | Feature Lifecycle 도입 |
| 2026-04-27 | 모바일 aspect-ratio 3/2, CTA 높이 44→52px, 전체 클릭 링크 | 모바일 UX 최적화 |
| 2026-04-27 | Promise.all 제거 → 섹션별 Suspense 스트리밍 | LCP Load Delay 3,121ms → ~400ms |
| 2026-05-02 | HeroSlider Suspense 래핑 + auth() 페이지 상단 제거 | cold-start auth() 블로킹 → TTFB 개선 |
| 2026-05-10 | HomeFaqSection 추가 (FAQPage Schema + FAQ UI 5개) | GEO(AI 검색) 인용 최적화 |
| 2026-05-11 | HomeCardLink 래퍼로 5개 섹션 GA4 클릭 추적 추가 | 홈 이탈률 63.9% 원인 분석 — 어느 섹션 클릭하는지 데이터 없음 |
| 2026-05-11 | F03-hero-banner.md → F03-home-page.md 확장 (REGISTRY PATH MAP hero*→home*) | 홈 섹션 19개 컴포넌트 모두 F03으로 통합 관리 |
