# 홈 디자인 스냅샷 — 우리 나이가 어때서 (우나어)

> **목적**: 외부 디자이너 AI에게 홈 페이지 개선을 의뢰하기 위한 코드/자산 스냅샷.  
> 이 폴더의 파일은 원본 복사본이며 수정하지 않습니다.  
> 수집일: 2026-04-25

---

## 섹션 ↔ 컴포넌트 매핑

| # | 섹션 | 컴포넌트 | 파일 경로 |
|---|------|----------|-----------|
| - | 루트 레이아웃 | `<RootLayout>` | `pages/root_layout.tsx` |
| - | (main) 레이아웃 | `<MainLayout>` | `pages/(main)_layout.tsx` |
| - | 홈 라우트 | `<HomePage>` | `pages/(main)_page.tsx` |
| - | 모바일 헤더 | `<Header>` | `components/layouts/Header.tsx` |
| - | 모바일 아이콘 메뉴 | `<IconMenu>` | `components/layouts/IconMenu.tsx` |
| - | 데스크탑 네비 | `<GNB>` | `components/layouts/GNB.tsx` |
| 1 | Hero 캐러셀 | `<HeroSlider>` | `components/features/home/HeroSlider.tsx` |
| 1a | Hero 슬라이드 로직 | `<HeroSliderClient>` | `components/features/home/HeroSliderClient.tsx` |
| 2 | 🔥 지금 뜨는 이야기 | `<TrendingSection>` | `components/features/home/TrendingSection.tsx` |
| 2a | 광고 (AdSense 홈섹션) | `<AdSenseUnit>` | `components/ad/AdSenseUnit.tsx` |
| 3 | 💬 소통 마당 최신 | `<CommunitySection>` | `components/features/home/CommunitySection.tsx` |
| 3a | 광고 (쿠팡 모바일) | `<CoupangBanner preset="mobile">` | `components/ad/CoupangBanner.tsx` |
| 4 | 🌿 2막 준비 | `<Life2Section>` | `components/features/home/Life2Section.tsx` |
| 4a | 광고 (쿠팡 캐러셀) | `<CoupangCarousel>` | `components/ad/CoupangCarousel.tsx` |
| 5 | 📖 매거진 | `<MagazineSection>` | `components/features/home/MagazineSection.tsx` |
| 5a | 광고 (FeedAd) | `<FeedAd>` | `components/ad/FeedAd.tsx` |
| 6 | 💼 오늘의 추천 일자리 | `<JobSection>` | `components/features/home/JobSection.tsx` |
| 7 | 🔔 지금 이 순간 | `<RecentActivityFeed>` | `components/features/home/RecentActivityFeed.tsx` |
| - | 우측 사이드바 (데스크탑) | `<HomeSidebar>` | `components/features/home/HomeSidebar.tsx` |
| - | 에디터스 픽 | `<EditorsPickSection>` | `components/features/home/EditorsPickSection.tsx` |
| - | 서비스 정체성 소개 | `<IdentitySection>` | `components/features/home/IdentitySection.tsx` |
| - | 인라인 광고 | `<AdInline>` | `components/features/home/AdInline.tsx` |
| - | 푸터 | `<Footer>` | `components/layouts/Footer.tsx` |
| - | FAB (글쓰기 버튼) | `<FAB>` | `components/layouts/FAB.tsx` |
| - | 폰트 크기 토글 | `<FooterFontSizeToggle>` | `components/common/FooterFontSizeToggle.tsx` |
| - | 폰트 크기 Provider | `<FontSizeProvider>` | `components/common/FontSizeProvider.tsx` |

---

## 광고 슬롯 구성

| 슬롯 | ID | 위치 | 플랫폼 |
|------|-----|------|--------|
| HOME_SECTION | `9127452149` | TrendingSection 아래 | Google AdSense |
| IN_FEED | `5592036395` | Magazine↔Job 사이 | Google AdSense |
| IN_ARTICLE | `2965873058` | 글 본문 아래 (홈 외) | Google AdSense |
| PC_SIDEBAR | `4568825260` | 데스크탑 우측 사이드바 | Google AdSense |
| 쿠팡 모바일 | AF3181348 / 320×100 | Community 아래 (모바일) | Coupang Partners |
| 쿠팡 캐러셀 | AF3181348 | Life2 아래 (모바일) | Coupang Partners |
| 쿠팡 데스크탑 | AF3181348 / 300×100 | 사이드바 하단 | Coupang Partners |

---

## 사용 중인 주요 라이브러리

| 카테고리 | 라이브러리 / 기술 |
|----------|-----------------|
| **프레임워크** | Next.js 14 (App Router) + TypeScript strict |
| **스타일** | Tailwind CSS + CSS Variables (HSL 토큰) + CSS Modules (HomePage.module.css) |
| **UI 컴포넌트** | shadcn/ui (Button, Card, Badge 등) |
| **폰트** | Pretendard Variable (`next/font/local`) |
| **인증** | NextAuth v5 (카카오 OAuth 전용) |
| **DB** | Supabase + Prisma ORM |
| **캐러셀** | 자체 구현 (HeroSliderClient — CSS transition + 터치 이벤트) |
| **광고** | Google AdSense + Coupang Partners (자체 컴포넌트) |
| **상태관리** | React Context (`FontSizeProvider`) — 최소한으로 사용 |
| **아이콘** | `src/components/icons/index.tsx` (자체 SVG 컴포넌트) |
| **애니메이션** | CSS keyframes (`tailwindcss-animate`) |
| **SEO** | JSON-LD (Organization + WebSite 스키마) |

---

## 디자인 토큰 (핵심)

### 컬러
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--primary` | `#FF6F61` (HSL 5 100% 69%) | 브랜드 코랄 — 버튼, 강조 |
| `--primary-text` | `HSL 5 55% 50%` | 고대비 코랄 텍스트 (WCAG AA 4.93:1) |
| `--background` | `HSL 210 17% 98%` | 옅은 웜그레이 배경 |
| `--foreground` | `HSL 222 47% 11%` | 차콜 블랙 텍스트 |
| `--card` | 흰색 기반 | 카드 배경 |
| `--border` | 연한 회색 | 구분선 |

### 폰트 스케일
| Tailwind 클래스 | 실제 크기 | 용도 |
|-----------------|----------|------|
| `text-xs` | 15px | 캡션, 배지 (최소) |
| `text-sm` | 16px | 보조 텍스트 |
| `text-base` | **18px** | 본문 (기본) |
| `text-lg` | 20px | 소제목 |
| `text-xl` | 24px | 제목 |
| `text-2xl` | 28px | 대제목 |

### 글씨 크기 토글 (시니어 접근성)
- 기본(NORMAL): 18px → 대(LARGE): 20px → 특대(XLARGE): 24px
- `html[data-font-size]` 속성으로 전체 CSS 변수 일괄 전환

### 터치 타겟
- 최소: **52×52px** (모바일 모든 버튼/아이콘)
- 버튼 높이: 52px (모바일) / 48px (데스크탑)

---

## 반응형 전략 요약
- **브레이크포인트**: `lg` (1024px) 단 하나만 사용 — 모바일/데스크탑 두 단계
- **주 설계 기준**: 모바일 (실사용 95%)
- 상세 내용: `responsive-notes.md` 참고

## 데이터 흐름 요약
- 모든 섹션 데이터: RSC에서 Prisma 직접 조회 → `unstable_cache` 60초 캐싱
- 광고: CSR (AdSense) 또는 RSC (Coupang 정적 배너)
- 상세 내용: `data-flow.md` 참고

---

## 디자이너에게 미리 알리고 싶은 이슈/제약

1. **광고 슬롯 위치 변경 불가** — HOME_SECTION, IN_FEED 광고는 CTR과 직결. 위치/크기 변경 시 매출 영향 큼. 완전 제거 불가.

2. **쿠팡 모바일 배너(320×100)** — 쿠팡 Partners 계약 규정상 특정 크기만 허용. 디자인으로 숨길 수는 있으나 제거 불가.

3. **글씨 크기 토글 SSR 이슈** — 첫 렌더 시 localStorage를 못 읽어 NORMAL로 그려진 후 클라이언트에서 LARGE/XLARGE로 전환. 미세한 레이아웃 이동(CLS) 발생 가능성 있음.

4. **HomeSidebar 모바일 없음** — "최신 소통글" 위젯은 데스크탑 전용. 모바일에서는 해당 섹션 없음. 모바일에서 노출 원한다면 구조 변경 필요.

5. **HeroSlider DB 기반** — 배너 이미지는 DB에서 관리. 디자인 개선 시 배너 비율(`aspect-[8/3]`)을 바꾸면 기존 배너 이미지 재업로드 필요.

6. **폰트 Pretendard Variable만 사용** — 웹폰트 추가 시 로딩 성능 영향 검토 필요 (50대+ 타겟, 모바일 95%).

7. **"시니어" 용어 절대 금지** — UI 텍스트, 마케팅 카피에서 "시니어", "액티브 시니어" 사용 금지. "우리 또래", "50대 60대", "인생 2막" 등으로 대체.

8. **FAB 글쓰기 버튼** — 모바일에서 코랄 컬러 플로팅 버튼(✏️ 글쓰기)이 우측 하단 고정. 디자인 변경 시 터치 타겟(52px) 유지 필수.

9. **NavBar 구조** — 하단 탭바 없음. 상단 아이콘 메뉴 행(모바일) + GNB(데스크탑) 구조. 하단 탭바로의 전환은 레이아웃 전면 변경 필요.

10. **CoupangCarousel** — 쿠팡 스크립트 로딩 지연으로 모바일 중간 영역에 빈 공간이 잠깐 생길 수 있음. 스켈레톤 처리 미적용 상태.
