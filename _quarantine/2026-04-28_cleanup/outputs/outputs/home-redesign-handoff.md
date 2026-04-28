# 우나어 홈 리디자인 핸드오프 스펙

> **대상**: Antigravity Claude Code (또는 다른 구현 에이전트)
> **수신자가 알아야 할 컨텍스트**: 이 문서는 디자인 시안 + 결정사항 + 구현 가이드를 한 곳에 모은 단일 진실 문서. 위에서 아래로 순서대로 읽고 진행하면 됨.
> **버전**: v1.0 · 2026-04-25

---

## 1. 작업 개요

### 목적
1. 홈 페이지를 모바일 우선으로 리디자인 (모바일 95% / 데스크탑 5%)
2. 비회원 95% 환경에 맞춰 회원가입 유도 흐름 자연화
3. 디자인 토큰을 시스템화 (현재 흩어진 것 정리)
4. 광고 슬롯 매출 보존하면서 콘텐츠 영역 강화
5. Hero 캐러셀 운영 효율 개선 (이미지/텍스트 분리)

### 적용 범위
- 홈 라우트 (`src/app/(main)/page.tsx`) 및 그 안에서 렌더되는 모든 섹션
- 공통 레이아웃 (Header, GNB, Footer, IconMenu, FAB)
- 디자인 토큰 (`globals.css`, `tailwind.config.ts`)
- 회원/비회원 분기 구조
- Banner 모델 확장 (Prisma 마이그레이션)

### 작업 외 (다음 차수)
- 베스트, 사는이야기, 2막준비, 웃음방, 매거진, 내일찾기, 마이페이지, 회원가입 페이지
- 게시글 상세 페이지
- 댓글 시스템

### 스택 가정
- Next.js 14 App Router + TypeScript strict
- Tailwind CSS + CSS Variables (HSL 토큰)
- shadcn/ui 컴포넌트 베이스
- Pretendard Variable (`next/font/local`)
- NextAuth v5 (카카오 OAuth)
- Prisma + Supabase
- Google AdSense + Coupang Partners

---

## 2. 권장 작업 순서 (Phase별)

### Phase 1 — 토큰 + 인프라 (선행, ~0.5일)
1. `globals.css` 신규 토큰 추가 (3.1 참조)
2. `tailwind.config.ts` 변경 없음 (기존 18px 베이스 유지)
3. Banner 모델 Prisma 마이그레이션 (7.1 참조)
4. SSR 글씨 크기 깜빡임 해결 — 쿠키 기반 (8 참조)

### Phase 2 — 코어 컴포넌트 (병렬 가능, ~1.5일)
1. 신규 컴포넌트 8종 생성 (4.1 참조)
2. 기존 컴포넌트 6종 수정 (4.2 참조)
3. IconMenu — peek 패턴 + SVG 아이콘 6종 (10 참조)

### Phase 3 — 홈 페이지 통합 (~1일)
1. `src/app/(main)/page.tsx` 섹션 순서 재구성 (5 참조)
2. 광고 슬롯 4개 배치 변경 (6 참조)
3. 회원/비회원 분기 패턴 적용 (9 참조)

### Phase 4 — 데스크탑 검증 (~0.5일)
1. 1024px+ 레이아웃 (HomeSidebar sticky)
2. Trending 2열 그리드 / Magazine·Job 4열 그리드 (5.2 참조)

### Phase 5 — QA (~0.5일)
1. 12 체크리스트 통과
2. 모바일 360/375/390 + 데스크탑 1280/1440 5개 viewport 검증

**총 예상**: 4일 (1 dev 풀타임 기준).

---

## 3. 디자인 토큰

### 3.1 globals.css 신규 추가

기존 `:root` 블록 안에 추가:

```css
/* === 우나어 디자인 시스템 v0.2 === */

/* Hero 슬라이드 카테고리 컬러 (3장 캐러셀) */
--hero-slide-1-from: #C4453B; /* 브랜드 (코랄 진) */
--hero-slide-1-to:   #FFB4A2; /* 코랄 옅 */
--hero-slide-2-from: #C7651E; /* 사는이야기 (오렌지 진) */
--hero-slide-2-to:   #FAC775; /* 오렌지 옅 */
--hero-slide-3-from: #1B5E20; /* 2막준비 (그린 진) */
--hero-slide-3-to:   #97C459; /* 그린 옅 */

/* IconMenu 카테고리 토큰 */
--icon-best-bg:       #FFE9E5; --icon-best-stroke:       #C4453B;
--icon-life-bg:       #FFF1E5; --icon-life-stroke:       #C7651E;
--icon-life2-bg:      #E8F5E9; --icon-life2-stroke:      #2E7D32;
--icon-laugh-bg:      #FFF8E1; --icon-laugh-stroke:      #A06900;
--icon-magazine-bg:   #E3F2FD; --icon-magazine-stroke:   #185FA5;
--icon-job-bg:        #F3E5F5; --icon-job-stroke:        #6A1B9A;

/* 시안 추가 토큰 */
--surface-coral-soft: #FFE9E5; /* primary-soft */
--surface-coral-pale: #FFF8F6; /* primary-pale */
--border-coral-soft:  #FFD4CC;

/* Activity Pulse (살아있음 신호) */
--pulse-dot-color:    #FF6F61;
--pulse-dot-glow:     rgba(255,111,97,0.2);
```

### 3.2 보존되는 기존 토큰 (변경 없음)

`--primary` (#FF6F61), `--primary-text` (#C4453B HSL), `--background`, `--foreground`, `--card`, `--border`, `--muted`, `--destructive`, `--radius` (0.75rem) — 그대로 사용.

폰트 스케일 — 변경 없음:
- `text-base`: 18px (시니어 본문)
- `text-sm`: 16px / `text-xs`: 15px / `text-lg`: 20px / `text-xl`: 24px

글씨 크기 토글 3단계 (NORMAL/LARGE/XLARGE) — 변경 없음.

### 3.3 시스템 규칙 (코드 리뷰 시 강제)

| # | 규칙 |
|---|------|
| R1 | 본문 텍스트 18px 미만 금지. 메타·캡션도 15px 하한. |
| R2 | 모든 누를 수 있는 요소 `min-height: 44px`, 모바일 주요 버튼 52px. |
| R3 | 코랄 텍스트는 `--primary-text` (#C4453B). `--primary` (#FF6F61)는 fill·아이콘에만. |
| R4 | "시니어/액티브 시니어" UI 카피 절대 금지. "우리 또래 / 50대 60대 / 인생 2막"으로. |
| R5 | 광고 슬롯은 dashed border 0.5px + "광고" 라벨 통일. |
| R6 | 회원/비회원 분기는 같은 슬롯 위치에서 컴포넌트만 교체. 페이지 흐름·길이 변하지 않게. |
| R7 | Top Promo Banner는 dismissable, sessionStorage로 한 세션만 닫힘 유지. |

---

## 4. 컴포넌트 변경 정리

### 4.1 신규 컴포넌트 (8종)

#### `<TopPromoBanner />`
- **위치**: `src/components/layouts/TopPromoBanner.tsx`
- **노출**: 페이지 최상단(GNB 위), 캠페인/광고 슬롯
- **Props**: `{ tag: string; text: string; href?: string; }` + 운영팀이 어드민에서 관리
- **상호작용**: × 버튼으로 닫기 → `sessionStorage.setItem('top-promo-dismissed', '1')`
- **스타일**: 배경 `linear-gradient(90deg, #FFE9E5, #FFF5F2)`, 패딩 10px 14px (모바일) / 8px 40px (데스크탑)
- **태그 칩**: 12px, `border: 0.5px solid #C4453B`, `color: #C4453B`

#### `<SignupCard variant="middle" />`
- **위치**: `src/components/features/home/SignupCard.tsx`
- **노출**: 비회원만, 페이지 중반 (Activity Pulse 직후)
- **Hero 직후의 첫 번째 SignupCard는 제거됨** (강매 느낌 회피)
- **모바일**: 인용 + 제목 + 부제 + 카카오 풀폭 버튼 (높이 52px, #FEE500)
- **데스크탑**: 가로 분할 (좌측 카피 + 우측 240px CTA)
- **카피 (확정)**:
  - 인용: `"여기 사람들이 정말 따뜻해요"`
  - 제목: `댓글 한 줄, 공감 한 번 / 가입하면 같이 할 수 있어요`
  - 부제: `우리 또래만 모인 공간 · 카카오로 30초`
  - CTA: `카카오로 시작하기`

#### `<PersonalGreeting />` (회원 전용)
- **위치**: `src/components/features/home/PersonalGreeting.tsx`
- **노출**: 회원만, Hero 직후
- **Props**: `{ user: { displayName: string; avatarUrl?: string; }; counts: { newComments: number; receivedLikes: number; } }`
- **레이아웃**: 그라디언트 배경 `linear-gradient(135deg, #FFF8F6, #FFE9E5)`, padding 16px 18px, radius 16px
- **요소**:
  - 아바타 48px (이니셜 fallback)
  - "정순씨, 안녕하세요" 19px/500
  - "오늘도 좋은 하루 보내세요" 13px muted
  - 빠른 진입 버튼 2개: "새 댓글 N", "받은 공감 N" (높이 48px, 코랄 outline)
- **링크**:
  - 새 댓글 → `/notifications?tab=comments`
  - 받은 공감 → `/notifications?tab=likes`

#### `<MyActivity />` (회원 전용)
- **위치**: `src/components/features/home/MyActivity.tsx`
- **노출**: 회원만, Job Section 다음 (비회원 ActivityPulse 위치와 동일)
- **레이아웃**: 흰 배경 카드 + 3-stat 그리드
- **데이터**: `{ todayPosts: number; newComments: number; receivedLikes: number; }`
- **스타일**: 각 stat cell `linear-gradient(135deg, #FFF8F6, #FFE9E5)`, radius 10px
- **숫자**: 20px/500 코랄 (`--primary-text`)
- **레이블**: 12px muted

#### `<ActivityPulse />`
- **위치**: `src/components/features/home/ActivityPulse.tsx`
- **노출**: 비회원 (Job 다음) + 회원 (MyActivity 직후, "내 글에 새 댓글" 강조)
- **데이터**: `{ activeCount: number; recentActivities: Activity[] }` — 최근 3건만
- **레이아웃**: 그라디언트 카드 + pulsing dot
- **펄스 애니메이션**: `box-shadow: 0 0 0 4px rgba(255,111,97,0.2)` + keyframes
- **회원 변형**: 본인 활동(`activity.userId === currentUser.id`)이면 코랄 텍스트로 강조
- **기존 `<RecentActivityFeed />` 대체** (8개 리스트 → 1줄 + 3건)

#### `<NotificationBell />` (회원 전용)
- **위치**: `src/components/layouts/NotificationBell.tsx`
- **노출**: 회원만, Header(모바일) + GNB(데스크탑) 우측
- **Props**: `{ unreadCount: number; }`
- **상호작용**: 클릭 → 알림 패널 (드롭다운 또는 라우트 `/notifications`)
- **표시**: 벨 아이콘 + 빨간 점 (unreadCount > 0일 때)
- **터치 타겟**: 40×40px 박스, 빨간 점 9×9 (border 2px white)

#### `<SeenPosts />` (회원 전용)
- **위치**: `src/components/features/home/SeenPosts.tsx`
- **노출**: 회원만, ActivityPulse 직후 (비회원 SignupCard middle 위치와 동일)
- **데이터**: `{ posts: { id; categoryName; title; lastSeenAt; readPercent: number; }[] }`
- **모바일**: 가로 스크롤 카드 (200×auto, gap 10px)
- **데스크탑**: 4열 그리드
- **카드 내용**: 카테고리(12px muted) + 제목(15px/500) + "70% 읽음" 또는 "끝까지 읽음"
- **신규 백엔드**: `getSeenPosts(userId, limit=4)` — 최근 본 글 추적 필요. 클릭 이벤트로 `PostView` 테이블 적재

#### `<HeaderFontSizeToggle />` (헤더 미니)
- **위치**: `src/components/common/HeaderFontSizeToggle.tsx`
- **노출**: 모바일 Header + 데스크탑 GNB 우측 (40×40 박스, "가" 텍스트)
- **상호작용**: 클릭 → 모달 또는 풀스크린 시트로 3단계 선택 화면 노출
- **기존 `<FooterFontSizeToggle />`도 함께 유지** — 푸터에 동일 기능 (시니어 사용자 모두 발견 가능하게 양쪽 노출)
- **글씨 크기 변경 시**: 쿠키 + localStorage 동시 저장 (8 참조)

### 4.2 수정 컴포넌트 (6종)

#### `<HeroSlider />` + `<HeroSliderClient />` ★ 가장 큰 변경
- **변경 전**: DB의 단일 `imageUrl` 필드에 텍스트까지 합쳐진 이미지 통째 업로드
- **변경 후**: 이미지(사진)와 텍스트 완전 분리. 텍스트는 HTML로 오버레이.
- **데스크탑 레이아웃**: `grid-template-columns: 1fr 1fr`, 좌측 텍스트 영역(패딩 56px 40px) + 우측 이미지 영역
- **모바일 레이아웃**: 상하 분할 — 상단 200px 이미지 + 하단 180px 텍스트(흰 배경, 시니어 가독성)
- **그라디언트 오버레이**: 데스크탑은 좌측 진하게, 우측으로 페이드
  ```css
  background-image:
    linear-gradient(105deg, var(--hero-slide-N-from) 0%,
                    var(--hero-slide-N-from) 40%,
                    transparent 70%),
    url(banner.imageDesktop);
  background-size: cover;
  ```
- **3장 슬라이드** (DB에서 `displayOrder` 1, 2, 3):
  1. 브랜드 — `themeColor: #C4453B`
  2. 사는이야기 — `themeColor: #C7651E`
  3. 2막준비 — `themeColor: #1B5E20`
- **자동재생**: 5초 간격, 터치 스와이프 정상, 마우스 호버 시 일시정지
- **인디케이터**: 활성 22px(rounded), 비활성 8px dot
- **비율**: 모바일 `aspect-ratio: 8/5` (기존 8:3 → 변경) / 데스크탑 360px 고정 (기존 420px → 축소)
- **CTA 버튼**: 흰 배경 + 카테고리 컬러 텍스트, height 48px

#### `<IconMenu />` ★ 두 번째로 큰 변경
- **peek 패턴**: 셀 폭 70px × 6개 = 420px. 375px 모바일에서 마지막 항목 자연 잘림
- **이모지 → SVG 라인 아이콘 6종** (10 참조)
- **`scroll-snap-type: x proximity`** 적용 (자유 스크롤 + 가벼운 스냅)
- **데스크탑에서는 미노출** (현재처럼 `lg:hidden` 유지)

#### `<MagazineSection />` (모바일만 변경)
- **모바일**: 기존 2열 그리드 → 가로 스크롤 1열 (`overflow-x: auto`, 카드 200px 폭)
- **데스크탑**: 기존 4열 그리드 유지
- **카드 변경**: 썸네일 높이 모바일 120px, 데스크탑 130px. 카테고리 태그는 흰 배경 + 코랄 텍스트로 변경

#### `<TrendingSection />` (데스크탑만 변경)
- **모바일**: 1열 5개 (변경 없음)
- **데스크탑**: 1열 → 2열 그리드 (3개 + 2개 또는 좌3·우2). `grid-template-columns: 1fr 1fr; gap: 12px 28px`
- **순위 번호**: 22px/500 코랄, min-width 22px

#### `<Header />` (모바일)
- 추가: `<HeaderFontSizeToggle />` (검색 옆)
- 회원: 로그인 pill 자리에 `<NotificationBell />` + 아바타(40px)
- 비회원: 기존 로그인 pill 유지 (코랄 배경)

#### `<GNB />` (데스크탑)
- 추가: `<HeaderFontSizeToggle />` 우측 (로그인 좌측)
- 회원: 로그인 버튼 자리에 `<NotificationBell />` + 아바타
- 메뉴 항목 활성 표시: `background: #FFE9E5; color: #C4453B`

### 4.3 삭제/통합 검토

| 컴포넌트 | 처리 |
|----------|------|
| `<RecentActivityFeed />` | **`<ActivityPulse />`로 대체** — 8개 리스트 너무 노이즈. 라우트는 `/activity`로 별도 보존 가능 |
| `<EditorsPickSection />` | **검토 필요** — 홈에서 노출 안 함. "베스트" 라우트로 이관 또는 베스트 nav active 시 큐레이션 영역으로 활용 |
| `<IdentitySection />` | **삭제** — Hero 카피로 흡수됨 (브랜드 인식 1순위는 Hero가 담당) |
| `<AdInline />` | **유지** — 단, 사용처 정리 필요 |
| `<HomeSidebar />` | **유지** — 데스크탑 5%만 노출. 모바일에선 별도 처리 안 함 |

---

## 5. 페이지 섹션 순서

### 5.1 모바일 (95% 사용자)

```
1.  <TopPromoBanner />               ← 신규 (캠페인용)
2.  <Header />                       ← 글씨크기 토글 추가
3.  <IconMenu />                     ← peek + SVG 아이콘
4.  <HeroSlider />                   ← 3장, 이미지/텍스트 분리
                                     ※ 비회원 Hero 직후 SignupCard 제거됨
5.  {isMember && <PersonalGreeting />}
6.  <TrendingSection />              ← 1열 5개
7.  <AdSenseUnit slot="HOME_SECTION" />
8.  <CommunitySection />             ← 모바일 사이드바 위젯 통합 안 함 (데스크탑 전용)
9.  <CoupangBanner preset="mobile" /> ← 320×100
10. <Life2Section />
11. <AdSenseUnit slot="IN_FEED" />   ← ★ 변경 (기존 매거진 다음에서 이동)
12. <MagazineSection />              ← 가로 스크롤 4장
13. <CoupangCarousel />              ← ★ 변경 (기존 2막준비 다음에서 이동)
14. <JobSection />                   ← 가로 스크롤
15. {isMember
      ? <MyActivity /> + <ActivityPulse member />
      : <ActivityPulse guest />}
16. {isMember
      ? <SeenPosts />
      : <SignupCard variant="middle" />}
17. <Footer />                       ← FooterFontSizeToggle 유지
18. <StickyBottomAd /> (지연 노출)   ← AdSense 320×50 신규 슬롯
19. <FAB />                          ← 우측 하단 글쓰기 버튼 (회원 시 활성)
```

### 5.2 데스크탑 (5% 사용자)

```
1.  <TopPromoBanner />
2.  <GNB />                          ← 글씨크기 + 알림(회원) + 아바타(회원)
3.  <HeroSlider />                   ← 3장, 360px 높이
                                     ※ Hero 직후 SignupCard 없음 (모바일과 동일)
4.  <PersonalGreeting /> (회원만)

  [container 1200px max-width, padding 40px]
  [grid: 1fr 300px gap 32px]

  메인 컬럼:
  5.  <TrendingSection />            ← 2열 그리드
  6.  <AdSenseUnit slot="HOME_SECTION" />
  7.  <CommunitySection />           ← 2열 그리드
  8.  <Life2Section />               ← 2열 그리드
  9.  <MagazineSection />            ← 4열 그리드
  10. <AdSenseUnit slot="IN_FEED" />
  11. <JobSection />                 ← 4열 그리드
  12. <ActivityPulse + MyActivity (회원만)>
  13. {회원 ? <SeenPosts /> (4열 그리드) : <SignupCard horizontal />}

  사이드바 (sticky):
  14. <HomeSidebar />                ← 최신 소통글 위젯
  15. <AdSenseUnit slot="PC_SIDEBAR" /> ← 300×250
  16. <CoupangBanner preset="desktop" /> ← 300×100

17. <Footer />
18. <StickyBottomAd /> (선택, 데스크탑은 빼는 것도 검토)
```

---

## 6. 광고 슬롯 최종 배치 ★ 사용자 확정

### 6.1 변경 요약

| # | 위치 | 변경 전 | 변경 후 |
|---|------|---------|---------|
| 1 | Trending 다음 | AdSense HOME_SECTION | (변경 없음) |
| 2 | 소통마당 다음 | Coupang 320×100 | (변경 없음) |
| 3 | **2막준비 다음** | Coupang Carousel | **AdSense IN_FEED** ★ |
| 4 | **매거진 다음** | AdSense IN_FEED | **Coupang Carousel** ★ |
| 5 | **최하단 sticky** | (없거나 미정) | **AdSense 320×50** ★ 신규 |
| 6 | 데스크탑 사이드바 | AdSense PC_SIDEBAR | (변경 없음) |
| 7 | 데스크탑 사이드바 | Coupang Banner desktop | (변경 없음) |

### 6.2 구현 시 주의

- AdSense `IN_FEED` 슬롯 ID 그대로 사용: `5592036395`
- Coupang Carousel — 기존 `<CoupangCarousel />` 컴포넌트 그대로 매거진 다음으로 이동
- **Sticky Bottom Ad** — 신규 컴포넌트 `<StickyBottomAd />` 필요
  - 위치: `src/components/ad/StickyBottomAd.tsx`
  - AdSense 320×50 슬롯 ID는 신규 발급 필요 (Google AdSense 콘솔)
  - 노출 조건: 페이지 첫 스크롤 50% 이상 진행 후 (지연 노출, 시니어 거슬림 최소화)
  - `sessionStorage`로 한 세션 닫기 가능
  - 코드 스니펫:
    ```tsx
    'use client';
    import { useEffect, useState } from 'react';

    export function StickyBottomAd() {
      const [show, setShow] = useState(false);
      const [dismissed, setDismissed] = useState(false);

      useEffect(() => {
        if (sessionStorage.getItem('sticky-ad-dismissed')) {
          setDismissed(true);
          return;
        }
        const onScroll = () => {
          const scrolled = window.scrollY / (document.body.scrollHeight - window.innerHeight);
          if (scrolled > 0.5) setShow(true);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
      }, []);

      if (dismissed || !show) return null;

      return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border z-40">
          {/* AdSense 320×50 + 닫기 버튼 */}
        </div>
      );
    }
    ```

### 6.3 광고 컴포넌트 위치 (변경 없음)

`src/components/ad/`:
- `AdSenseUnit.tsx` — `slot` prop으로 ID 전달
- `CoupangBanner.tsx` — `preset="mobile" | "desktop"` 분기
- `CoupangCarousel.tsx` — 모바일 전용 (`block lg:hidden`)
- `FeedAd.tsx` — IN_FEED 래퍼
- `AdSlot.tsx` — 공통 래퍼 (광고 라벨 포함)
- `ResponsiveAd.tsx` — 모바일/데스크탑 분기 래퍼
- `ad-slots.ts` — 슬롯 ID 상수
- **신규**: `StickyBottomAd.tsx`

### 6.4 ad-slots.ts 업데이트

```ts
export const ADSENSE = {
  HOME_SECTION: '9127452149',
  IN_FEED:      '5592036395',
  IN_ARTICLE:   '2965873058',
  PC_SIDEBAR:   '4568825260',
  STICKY_BOTTOM: 'XXXXXXXXXX', // ★ 신규 발급 필요
} as const;
```

---

## 7. Banner 모델 마이그레이션

### 7.1 Prisma 스키마 변경

**현재** (추정 — `prisma/schema.prisma`):
```prisma
model Banner {
  id        String   @id @default(cuid())
  title     String?
  imageUrl  String   // ★ 텍스트까지 합쳐진 이미지
  linkUrl   String?
  isActive  Boolean  @default(true)
  // ...
}
```

**변경 후**:
```prisma
model Banner {
  id            String    @id @default(cuid())
  slot          String    @default("HERO")        // 향후 다른 슬롯 대비
  category      String    @default("CUSTOM")      // BRAND | LIFE_STORY | LIFE2 | CUSTOM
  title         String                            // "오늘 우리가 나누는 이야기"
  subtitle      String?                           // "텃밭부터 갱년기까지..."
  imageDesktop  String                            // 사진 only, 16:5 (1280×400 권장)
  imageMobile   String?                           // 사진 only, 4:3 또는 8:5 (option)
  ctaText       String?                           // "사는이야기 보기"
  ctaUrl        String?                           // "/category/life-story"
  themeColor    String                            // "#C4453B"
  displayOrder  Int       @default(0)
  isActive      Boolean   @default(true)
  startsAt      DateTime?
  endsAt        DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([slot, isActive, displayOrder])
}
```

### 7.2 SQL 마이그레이션 (Supabase)

```sql
ALTER TABLE "Banner" ADD COLUMN "slot" TEXT NOT NULL DEFAULT 'HERO';
ALTER TABLE "Banner" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "Banner" ADD COLUMN "subtitle" TEXT;
ALTER TABLE "Banner" ADD COLUMN "imageDesktop" TEXT;
ALTER TABLE "Banner" ADD COLUMN "imageMobile" TEXT;
ALTER TABLE "Banner" ADD COLUMN "ctaText" TEXT;
ALTER TABLE "Banner" ADD COLUMN "themeColor" TEXT NOT NULL DEFAULT '#FF6F61';
ALTER TABLE "Banner" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Banner" ADD COLUMN "startsAt" TIMESTAMP;
ALTER TABLE "Banner" ADD COLUMN "endsAt" TIMESTAMP;

-- 기존 imageUrl을 imageDesktop으로 마이그레이션 (텍스트 포함된 이미지 그대로)
UPDATE "Banner" SET "imageDesktop" = "imageUrl" WHERE "imageDesktop" IS NULL;

-- 새 인덱스
CREATE INDEX "Banner_slot_isActive_displayOrder_idx"
  ON "Banner"("slot", "isActive", "displayOrder");

-- 운영 후 imageUrl 컬럼 제거 (1주일 운영 안정 후)
-- ALTER TABLE "Banner" DROP COLUMN "imageUrl";
```

### 7.3 운영팀 액션 (필수)

배너 마이그레이션 후 **반드시** 운영팀이:
1. Hero 슬라이드 3장의 사진(텍스트 없는 순수 사진)을 새로 준비
2. 어드민에서 각 배너의 `imageDesktop` / `imageMobile`을 업로드
3. `title`, `subtitle`, `themeColor`, `ctaText`, `ctaUrl` 텍스트 필드 채움
4. `displayOrder` 1, 2, 3으로 순서 지정
5. 기존 `imageUrl` (텍스트 합쳐진 이미지) 노출 여부 확인 후 제거

**임시 대응** — 운영팀 작업 전까지는 `imageDesktop`이 비어있으면 fallback 그라디언트만 노출되도록 컴포넌트에서 처리:
```tsx
{banner.imageDesktop ? (
  <img src={banner.imageDesktop} alt="" />
) : (
  <div style={{
    background: `linear-gradient(105deg, ${banner.themeColor}, transparent)`
  }} />
)}
```

---

## 8. SSR 글씨 크기 깜빡임 해결

### 8.1 문제

기존: 첫 렌더 시 `localStorage`를 못 읽어 NORMAL로 그려진 후 클라이언트에서 LARGE/XLARGE로 전환 → CLS(Cumulative Layout Shift) 발생.

### 8.2 해결 방안 — 쿠키 기반 SSR 동기화

#### 8.2.1 `app/layout.tsx`에서 쿠키 읽기

```tsx
// src/app/layout.tsx
import { cookies } from 'next/headers';
import { FontSizeProvider } from '@/components/common/FontSizeProvider';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontSize = (cookies().get('unao-font-size')?.value ?? 'NORMAL') as
    | 'NORMAL' | 'LARGE' | 'XLARGE';

  return (
    <html lang="ko" data-font-size={fontSize === 'NORMAL' ? undefined : fontSize}>
      <body>
        <FontSizeProvider initialSize={fontSize}>
          {children}
        </FontSizeProvider>
      </body>
    </html>
  );
}
```

#### 8.2.2 `FontSizeProvider.tsx` 수정

```tsx
// src/components/common/FontSizeProvider.tsx
'use client';
import { createContext, useContext, useState, useCallback } from 'react';

type FontSize = 'NORMAL' | 'LARGE' | 'XLARGE';
const Ctx = createContext<{
  size: FontSize;
  setSize: (s: FontSize) => void;
}>({ size: 'NORMAL', setSize: () => {} });

export function FontSizeProvider({
  initialSize,
  children,
}: {
  initialSize: FontSize;
  children: React.ReactNode;
}) {
  const [size, setSizeState] = useState<FontSize>(initialSize);

  const setSize = useCallback((newSize: FontSize) => {
    setSizeState(newSize);

    // 쿠키 (SSR용, 1년)
    document.cookie = `unao-font-size=${newSize}; path=/; max-age=${60*60*24*365}; SameSite=Lax`;

    // localStorage (CSR 호환성용)
    localStorage.setItem('unao-font-size', newSize);

    // 즉시 적용
    if (newSize === 'NORMAL') {
      document.documentElement.removeAttribute('data-font-size');
    } else {
      document.documentElement.setAttribute('data-font-size', newSize);
    }
  }, []);

  return <Ctx.Provider value={{ size, setSize }}>{children}</Ctx.Provider>;
}

export const useFontSize = () => useContext(Ctx);
```

#### 8.2.3 결과
- 서버에서 이미 `data-font-size` 속성 적용한 HTML 전달
- 클라이언트 hydration 시 깜빡임 없음
- 처음 방문자(쿠키 없음) → NORMAL 기본
- 토글 변경 시 쿠키 + localStorage 동시 저장

### 8.3 캐싱 호환성 주의

- 페이지 단위 캐싱(`unstable_cache`) 사용 중인 경우 — 쿠키별로 캐시 키 분리해야 함
- 현재 코드가 `auth()` 호출로 ISR이 이미 무효화된 상태이므로 추가 작업 없음

---

## 9. 회원/비회원 분기 패턴

### 9.1 페이지 레벨 분기 (권장)

```tsx
// src/app/(main)/page.tsx
import { auth } from '@/auth';
import { TopPromoBanner } from '@/components/layouts/TopPromoBanner';
import { HeroSlider } from '@/components/features/home/HeroSlider';
import { PersonalGreeting } from '@/components/features/home/PersonalGreeting';
import { TrendingSection } from '@/components/features/home/TrendingSection';
import { ActivityPulse } from '@/components/features/home/ActivityPulse';
import { MyActivity } from '@/components/features/home/MyActivity';
import { SignupCard } from '@/components/features/home/SignupCard';
import { SeenPosts } from '@/components/features/home/SeenPosts';
// ...

export default async function HomePage() {
  const session = await auth();
  const isMember = !!session?.user;

  // 데이터 병렬 패치
  const [trending, community, life2, magazine, jobs, activity, banners,
         myCounts, mySeenPosts] = await Promise.all([
    getTrendingPosts(5),
    getLatestCommunityPosts(5),
    getLatestLife2Posts(5),
    getLatestMagazinePosts(4),
    getLatestJobs(5),
    getRecentActivities(3),
    getActiveBanners(),
    isMember ? getUserCounts(session.user.id) : null,
    isMember ? getSeenPosts(session.user.id, 4) : null,
  ]);

  return (
    <>
      <TopPromoBanner />
      <HeroSlider banners={banners} />

      {isMember && (
        <PersonalGreeting user={session.user} counts={myCounts} />
      )}

      <TrendingSection posts={trending} />
      <AdSenseUnit slot="HOME_SECTION" />

      <CommunitySection posts={community} />
      <CoupangBanner preset="mobile" />

      <Life2Section posts={life2} />
      <AdSenseUnit slot="IN_FEED" />

      <MagazineSection posts={magazine} />
      <CoupangCarousel />

      <JobSection jobs={jobs} />

      {isMember
        ? <>
            <MyActivity counts={myCounts} />
            <ActivityPulse activities={activity} highlightUserId={session.user.id} />
          </>
        : <ActivityPulse activities={activity} />
      }

      {isMember
        ? <SeenPosts posts={mySeenPosts} />
        : <SignupCard variant="middle" />
      }
    </>
  );
}
```

### 9.2 Header / GNB 분기

```tsx
// src/components/layouts/Header.tsx (모바일)
export async function Header() {
  const session = await auth();
  const isMember = !!session?.user;

  return (
    <header className="...">
      <Logo />
      <SearchPill />
      <HeaderFontSizeToggle />
      {isMember
        ? <>
            <NotificationBell unreadCount={...} />
            <Avatar user={session.user} />
          </>
        : <LoginPill />
      }
    </header>
  );
}
```

### 9.3 동일한 슬롯 위치 보존 규칙

- 페이지 길이가 회원/비회원에 따라 ±5% 이내여야 함
- 분기는 슬롯 단위로만, 섹션 통째 추가/삭제 금지
- 비회원이 가입 직후 보이는 화면이 자연스럽게 변화하도록

---

## 10. IconMenu 디자인 스펙 (모바일)

### 10.1 컨테이너

```tsx
<div
  className="flex gap-1.5 px-4 py-3 bg-white border-b border-border overflow-x-auto"
  style={{ scrollSnapType: 'x proximity' }}
>
  {items.map(item => <IconCell key={item.id} {...item} />)}
</div>
```

### 10.2 IconCell

```tsx
function IconCell({ id, label, href, bgVar, strokeVar, IconSvg }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 p-1 min-w-[70px]"
      style={{ scrollSnapAlign: 'start' }}
    >
      <div
        className="w-13 h-13 rounded-2xl flex items-center justify-center"
        style={{ background: `var(${bgVar})`, width: 52, height: 52 }}
      >
        <IconSvg width={26} height={26} stroke={`var(${strokeVar})`}
                 strokeWidth={1.6} fill="none"
                 strokeLinecap="round" strokeLinejoin="round" />
      </div>
      <span className="text-[13px] whitespace-nowrap">{label}</span>
    </Link>
  );
}
```

### 10.3 6종 아이콘 (SVG path)

`src/components/icons/category/` 안에 6개 파일로 분리.

```tsx
// IconBest.tsx (트로피)
export const IconBest = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M6 9V4h12v5a6 6 0 0 1-12 0z" />
    <path d="M6 9H3a3 3 0 0 0 3 3" />
    <path d="M18 9h3a3 3 0 0 1-3 3" />
    <path d="M9 20h6" />
    <path d="M12 15v5" />
  </svg>
);

// IconLifeStory.tsx (말풍선)
export const IconLifeStory = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
  </svg>
);

// IconLife2.tsx (새싹)
export const IconLife2 = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M12 21V11" />
    <path d="M12 11C8 11 5 8 5 4c4 0 7 3 7 7z" />
    <path d="M12 11c4 0 7-3 7-7-4 0-7 3-7 7z" />
  </svg>
);

// IconLaugh.tsx (미소)
export const IconLaugh = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14c0.8 1.6 2.2 2.5 4 2.5s3.2-0.9 4-2.5" />
    <circle cx="9" cy="10" r="0.5" fill="currentColor" />
    <circle cx="15" cy="10" r="0.5" fill="currentColor" />
  </svg>
);

// IconMagazine.tsx (책)
export const IconMagazine = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </svg>
);

// IconJob.tsx (가방)
export const IconJob = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);
```

### 10.4 Items 배열

```tsx
const ICON_MENU_ITEMS = [
  { id: 'best',     label: '베스트',     href: '/best',
    bgVar: '--icon-best-bg',     strokeVar: '--icon-best-stroke',
    IconSvg: IconBest },
  { id: 'life',     label: '사는이야기',  href: '/category/life-story',
    bgVar: '--icon-life-bg',     strokeVar: '--icon-life-stroke',
    IconSvg: IconLifeStory },
  { id: 'life2',    label: '2막준비',    href: '/category/life2',
    bgVar: '--icon-life2-bg',    strokeVar: '--icon-life2-stroke',
    IconSvg: IconLife2 },
  { id: 'laugh',    label: '웃음방',     href: '/category/laugh',
    bgVar: '--icon-laugh-bg',    strokeVar: '--icon-laugh-stroke',
    IconSvg: IconLaugh },
  { id: 'magazine', label: '매거진',     href: '/magazine',
    bgVar: '--icon-magazine-bg', strokeVar: '--icon-magazine-stroke',
    IconSvg: IconMagazine },
  { id: 'job',      label: '내일찾기',   href: '/jobs',
    bgVar: '--icon-job-bg',      strokeVar: '--icon-job-stroke',
    IconSvg: IconJob },
];
```

---

## 11. 반응형 스펙 요약

### 11.1 브레이크포인트

| 이름 | 픽셀 | 비고 |
|------|------|------|
| 모바일 | < 1024px | 기본값. 95% 사용자. |
| 데스크탑 | ≥ 1024px | `lg:` prefix. 5% 사용자. |

`md:` 사용 안 함 (단순화 유지).

### 11.2 주요 컴포넌트 비율

| 컴포넌트 | 모바일 | 데스크탑 |
|----------|--------|----------|
| TopPromoBanner | 풀폭, 패딩 10×14 | 풀폭, 패딩 8×40 |
| Header/GNB | sticky, 64px | sticky, 72px |
| Hero | aspect 8:5, 상하 분할 | 360px, 좌우 분할 50:50 |
| Trending | 1열 5개 | 2열 그리드 |
| Community/Life2 | 1열 카드 (3건) | 2열 그리드 (4건) |
| Magazine | 가로 스크롤 200px×4 | 4열 그리드 |
| Job | 가로 스크롤 200px×3+ | 4열 그리드 |
| ActivityPulse | 단일 카드 | 단일 카드 (가로 정보 4건) |
| SeenPosts | 가로 스크롤 200px | 4열 그리드 |
| HomeSidebar | 미노출 | 우측 300px sticky |
| Footer | 세로 stacking | 가로 정렬 한 줄 |
| StickyBottomAd | 노출 | 검토 (빼는 옵션 가능) |

### 11.3 컨테이너

- **모바일**: 풀폭, 좌우 패딩 16px
- **데스크탑**: `max-width: 1200px`, 좌우 패딩 40px, 가운데 정렬, `gap: 32px` (메인-사이드바)

---

## 12. QA 체크리스트

### 12.1 Phase 1 (토큰 + 인프라)
- [ ] `globals.css`에 신규 토큰 11개 추가 (3.1)
- [ ] Banner 모델 마이그레이션 SQL 실행 후 Prisma generate
- [ ] 쿠키 기반 글씨 크기 SSR — 첫 페인트 깜빡임 0회 (Chrome DevTools Performance 캡처)

### 12.2 Phase 2 (컴포넌트)
- [ ] 8종 신규 컴포넌트 작성 + Storybook(있다면)
- [ ] IconMenu peek 패턴 동작 (모바일 375에서 마지막 항목 절반 잘림)
- [ ] HeroSlider 3장 자동재생 5초, 터치 스와이프, 마우스 호버 일시정지
- [ ] HeroSlider 이미지 fallback (imageDesktop 비어있을 때 그라디언트만)

### 12.3 Phase 3 (홈 통합)
- [ ] 광고 슬롯 4개 위치 — IN_FEED는 2막 다음, Coupang Carousel은 매거진 다음
- [ ] AdSense Sticky 320×50 신규 슬롯 발급 + 적용
- [ ] 페이지 첫 스크롤 50% 진행 시 Sticky 노출
- [ ] 회원/비회원 페이지 길이 차이 ±5% 이내

### 12.4 Phase 4 (데스크탑)
- [ ] 1024px+ HomeSidebar sticky 동작 (top: 92px)
- [ ] Trending 2열 그리드 (좌3 우2)
- [ ] Magazine 4열 / Job 4열 그리드
- [ ] PC_SIDEBAR 광고 300×250 + Coupang Desktop 300×100

### 12.5 일반
- [ ] WCAG AA 4.5:1 통과 (코랄 텍스트 #C4453B 사용 — 5.62:1)
- [ ] Pretendard Variable 로딩 시 fallback (시스템 sans-serif)
- [ ] `word-break: keep-all` 모든 본문 텍스트 적용
- [ ] 모바일 viewport 360/375/390 + 데스크탑 1280/1440 5개 검증
- [ ] Top Promo Banner 닫기 → sessionStorage 동작
- [ ] Sticky Bottom Ad 닫기 → sessionStorage 동작
- [ ] FAB 글쓰기 — 비회원 클릭 시 로그인 모달, 회원 클릭 시 글쓰기 페이지
- [ ] "시니어/액티브 시니어" 단어 grep으로 0건 확인

---

## 13. 시안 참조

이 핸드오프와 함께 검토할 시안 (Cowork 위젯):
- **디자인 시스템 v0.1** — 토큰 + 코어 컴포넌트
- **디자인 시스템 v0.2** — 광고 슬롯 5종 + 회원 컴포넌트 + 분기 매트릭스
- **모바일 비회원 v2** — 풀페이지 시안 (Hero 직후 SignupCard 제거 / 매거진 가로 스크롤)
- **모바일 회원 v1** — 4개 슬롯 분기 적용 (Header 알림+아바타 / Personal Greeting / My Activity / Seen Posts)
- **데스크탑 비회원 v1** — 1280px, 사이드바 sticky, 분기 매트릭스
- **Hero 캐러셀 3장** — 데스크탑 + 모바일, 이미지/텍스트 분리 구조
- **IconMenu 개선안** — peek 패턴 + SVG 라인 아이콘 6종

---

## 14. 미해결 / 추후 결정 필요 항목

| # | 항목 | 책임 | 비고 |
|---|------|------|------|
| 1 | AdSense Sticky 320×50 슬롯 ID 발급 | 운영팀 | Google AdSense 콘솔에서 신규 unit 생성 |
| 2 | Hero 슬라이드 사진 3장 준비 | 운영팀 | 텍스트 없는 순수 사진. 데스크탑 16:5, 모바일 8:5 |
| 3 | "최신 소통글" 모바일 통합 여부 | PM | 현재는 데스크탑 전용. 모바일에 추가하려면 별도 UX 결정 |
| 4 | EditorsPickSection 처리 | PM | 홈에서 빠지면 베스트 라우트로 이관 vs 완전 삭제 |
| 5 | Sticky Bottom Ad 데스크탑 노출 여부 | PM | 매출 vs UX. 일단 데스크탑은 빼는 안 권장 |
| 6 | 회원의 "내가 본 글" 추적 인프라 | Dev | PostView 테이블 + 클라이언트 이벤트 발송 신규 작업 |
| 7 | 글씨 크기 토글 모바일 노출 위치 확정 | PM | 헤더 미니 + 푸터 둘 다 vs 헤더만 |

---

## 15. 변경 로그

- **v1.0 (2026-04-25)** — 최초 작성
  - 모바일 비회원 v2 + 회원 v1 + 데스크탑 v1 시안 반영
  - Hero 캐러셀 3장 이미지/텍스트 분리 구조 도입
  - 광고 슬롯 4개 배치 변경 (사용자 확정: 2막 ↔ 매거진 swap, sticky 320×50 신규)
  - IconMenu peek + SVG 아이콘 6종 변경
  - 회원/비회원 슬롯 단위 분기 매트릭스 확정

---

**문서 끝.** 이 핸드오프를 받은 구현 에이전트는 Phase 1 → 5 순서대로 진행하면 되며, 각 단계마다 12절 체크리스트로 검증할 것.

문의: 디자인 의사결정 변경이 필요하면 시안 위젯과 함께 다시 논의 요청 바람.
