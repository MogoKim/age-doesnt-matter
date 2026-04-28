# 홈 섹션별 데이터 흐름

> 모든 데이터는 `src/app/(main)/page.tsx`의 `Promise.all()`로 병렬 패치됩니다.  
> 캐싱은 Next.js `unstable_cache`로 Prisma 쿼리 결과를 서버 메모리에 유지합니다.

---

## 렌더링 방식 범례
| 방식 | 설명 |
|------|------|
| **RSC** | React Server Component — 서버에서 HTML 생성, JS 번들 없음 |
| **CSR** | Client Component (`'use client'`) — 브라우저에서 hydration |
| **ISR** | Incremental Static Regeneration (unstable_cache로 구현) |

---

## 섹션별 데이터 출처 & 렌더링 방식

### 1. Header (모바일 헤더)
- **데이터**: 세션 정보 (NextAuth) — `auth()` via `(main)/layout.tsx`
- **렌더링**: RSC (layout에서 처리)
- **API**: 없음 (세션 쿠키에서 직접 읽음)

### 2. GNB (Global Navigation Bar — 데스크탑)
- **데이터**: 세션 정보 (로그인 사용자 닉네임)
- **렌더링**: RSC
- **API**: 없음

### 3. Hero 캐러셀 (`<HeroSlider />`)
- **데이터**: 배너 DB 테이블 (`Banner` 모델) — Prisma 직접 쿼리
- **렌더링**: RSC (서버에서 배너 목록 조회) + `HeroSliderClient` CSR (슬라이드 자동재생/터치)
- **쿼리**: `prisma.banner.findMany({ where: { isActive: true } })`
- **캐시**: 없음 (매 요청마다 최신 배너 조회)

### 4. 🔥 지금 뜨는 이야기 (`<TrendingSection />`)
- **데이터**: `getTrendingPosts(5)` ← `src/lib/queries/posts.ts`
- **렌더링**: RSC
- **쿼리**: Prisma — 조회수·좋아요 기반 정렬, 5건 limit
- **캐시**: `unstable_cache` 60초 (`['home-trending']`)

### 5. 광고: AdSense 홈 섹션 (`<AdSenseUnit />`)
- **데이터**: 없음 (Google AdSense 스크립트가 동적 로드)
- **렌더링**: CSR (`'use client'`)
- **슬롯 ID**: `ADSENSE.HOME_SECTION` = `9127452149`
- **폴백**: AdSense 미채움(unfilled) 시 `CoupangBanner` 자동 표시

### 6. 💬 소통 마당 최신 (`<CommunitySection />`)
- **데이터**: `getLatestCommunityPosts(5)` ← `src/lib/queries/posts.ts`
- **렌더링**: RSC
- **쿼리**: Prisma — category=COMMUNITY, 최신순, 5건
- **캐시**: `unstable_cache` 60초 (`['home-community']`)

### 7. 광고: 쿠팡 모바일 배너 (`<CoupangBanner preset="mobile" />`)
- **데이터**: 없음 (정적 iframe/script)
- **렌더링**: RSC (서버 컴포넌트, hydration mismatch 방지)
- **노출**: 모바일 전용 (`ResponsiveAd` → `block lg:hidden`)
- **트래킹**: AF3181348, 320×100

### 8. 🌿 2막 준비 (`<Life2Section />`)
- **데이터**: `getLatestLife2Posts(5)` ← `src/lib/queries/posts.ts`
- **렌더링**: RSC
- **쿼리**: Prisma — category=LIFE2, 최신순, 5건
- **캐시**: `unstable_cache` 60초 (`['home-life2']`)

### 9. 광고: 쿠팡 캐러셀 (`<CoupangCarousel />`)
- **데이터**: 없음 (정적 script)
- **렌더링**: CSR
- **노출**: 모바일 전용 (`block lg:hidden`)

### 10. 📖 매거진 (`<MagazineSection />`)
- **데이터**: `getLatestMagazinePosts(4)` ← `src/lib/queries/posts.ts`
- **렌더링**: RSC
- **쿼리**: Prisma — category=MAGAZINE, 최신순, 4건
- **캐시**: `unstable_cache` 60초 (`['home-magazine']`)

### 11. 광고: FeedAd (`<FeedAd />`)
- **데이터**: 없음 (Google AdSense in-feed)
- **렌더링**: CSR
- **슬롯 ID**: `ADSENSE.IN_FEED` = `5592036395`
- **위치**: MagazineSection 과 JobSection 사이

### 12. 💼 오늘의 추천 일자리 (`<JobSection />`)
- **데이터**: `getLatestJobs(5)` ← `src/lib/queries/posts.ts`
- **렌더링**: RSC
- **쿼리**: Prisma — category=JOB, 최신순, 5건
- **캐시**: `unstable_cache` 60초 (`['home-jobs']`)

### 13. 🔔 지금 이 순간 (`<RecentActivityFeed />`)
- **데이터**: `getRecentActivities(8)` ← `src/lib/queries/posts.ts`
- **렌더링**: RSC
- **쿼리**: Prisma — 최근 좋아요/댓글 활동, 8건
- **캐시**: `unstable_cache` **30초** (`['home-activity']`) — 실시간성 중시

### 14. 최신 소통글 사이드바 (`<HomeSidebar />`) — 데스크탑 전용
- **데이터**: `community` 데이터 재사용 (CommunitySection과 동일 배열 prop)
- **렌더링**: RSC
- **추가**: `AdSenseUnit` (PC_SIDEBAR 슬롯) + `CoupangBanner` (desktop)

### 15. Footer
- **데이터**: 없음 (정적)
- **렌더링**: RSC
- **포함**: `FooterFontSizeToggle` (CSR — localStorage 접근)

---

## 캐시 요약

| 캐시 키 | TTL | 섹션 |
|---------|-----|------|
| `home-trending` | 60초 | 지금 뜨는 이야기 |
| `home-community` | 60초 | 소통 마당 + 사이드바 |
| `home-life2` | 60초 | 2막 준비 |
| `home-magazine` | 60초 | 매거진 |
| `home-jobs` | 60초 | 오늘의 추천 일자리 |
| `home-activity` | **30초** | 지금 이 순간 |

> ⚠️ `layout.tsx`에서 `auth()` 호출로 인해 ISR(`revalidate`)이 무효화됨.  
> 이 때문에 페이지 자체는 매 요청 렌더(Dynamic), DB 쿼리만 `unstable_cache`로 캐싱.
