# 반응형 분기 처리 정리

## 브레이크포인트 기준

| 이름 | 픽셀 | Tailwind 클래스 |
|------|------|----------------|
| 모바일 | < 1024px | 기본값 |
| 데스크탑 | ≥ 1024px | `lg:` prefix |

> ⚠️ `md:` (768px) 는 거의 사용하지 않음. 모바일/데스크탑 두 단계만 구분.  
> 실사용 디바이스 비율: **모바일 95% / 데스크탑 5%** → 모바일 레이아웃이 주설계 기준.

---

## 전체 페이지 레이아웃 구조

### 모바일 (< 1024px)
```
[Header (sticky, 64px)]
[IconMenu — 아이콘 행 메뉴]
│
[HeroSlider]
[TrendingSection]
[AdSenseUnit — 가로 배너]
[CommunitySection]
[CoupangBanner — 모바일 전용 320×100]
[Life2Section]
[CoupangCarousel — 모바일 전용]
[MagazineSection — 2열 그리드]
[FeedAd]
[JobSection — 수평 스크롤 캐러셀]
[RecentActivityFeed]
[Footer (FontSizeToggle 포함)]
```
→ **HomeSidebar 없음** — 소통글 최신 위젯이 모바일에서는 표시되지 않음.

### 데스크탑 (≥ 1024px)
```
[GNB (sticky, 64px) — 로고 + 메뉴 6개 + 검색 + 로그인]
│
[HeroSlider]
[2-컬럼 그리드: 1fr | 300px]
  ├─ 메인 컬럼
  │   [TrendingSection]
  │   [AdSenseUnit]
  │   [CommunitySection]
  │   [Life2Section]
  │   [MagazineSection — 4열 그리드]
  │   [FeedAd]
  │   [JobSection — 4열 그리드]
  │   [RecentActivityFeed]
  └─ 우측 사이드바 (sticky top: 72px + 20px)
      [최신 소통글 위젯]
      [AdSense PC_SIDEBAR]
      [CoupangBanner desktop 300×100]
[Footer]
```

---

## 컴포넌트별 반응형 분기 상세

### Header vs GNB
| 컴포넌트 | 클래스 | 노출 |
|----------|--------|------|
| `Header.tsx` | `lg:hidden` | 모바일 전용 |
| `GNB.tsx` | `hidden lg:flex` | 데스크탑 전용 |
| `IconMenu.tsx` | `lg:hidden` | 모바일 전용 |

### HeroSlider 크기
| 환경 | 높이/비율 |
|------|----------|
| 모바일 | `aspect-[8/3]` (비율 고정) |
| 데스크탑 | `420px` 고정 |

### 홈 본문 레이아웃
```css
/* page.tsx */
.container {
  /* 모바일 */ display: block;
  /* 데스크탑 */ lg:grid lg:grid-cols-[1fr_300px] lg:gap-5 lg:px-8
}
```

### HomeSidebar (최신 소통글 + 광고)
- 모바일: **표시 안 됨** — HomeSidebar 컴포넌트 자체가 `hidden lg:block` 처리
- 데스크탑: 우측 300px 사이드바, `sticky top-[calc(72px+20px)]`
- 소통글 데이터는 CommunitySection과 동일한 배열을 prop으로 공유

### MagazineSection 그리드
| 환경 | 컬럼 수 | 썸네일 높이 |
|------|---------|------------|
| 모바일 | 2열 | 100px |
| 데스크탑 | 4열 | 140px |

### JobSection
| 환경 | 레이아웃 |
|------|----------|
| 모바일 | 수평 스크롤 캐러셀 (`overflow-x: auto`, `scroll-snap-type: x mandatory`) |
| 데스크탑 | 4열 그리드 |
| 카드 폭 | 220px 고정 (모바일 캐러셀 기준) |

### 광고 모바일/데스크탑 분기
| 광고 | 모바일 | 데스크탑 |
|------|--------|----------|
| `CoupangBanner preset="mobile"` | ✅ (block) | ❌ (hidden) |
| `CoupangCarousel` | ✅ (block) | ❌ (hidden) |
| `AdSense PC_SIDEBAR` | ❌ | ✅ (사이드바) |
| `CoupangBanner preset="desktop"` | ❌ | ✅ (사이드바) |
| `AdSenseUnit HOME_SECTION` | ✅ | ✅ |
| `FeedAd (IN_FEED)` | ✅ | ✅ |

> 광고 모바일/데스크탑 분기는 `<ResponsiveAd>` 래퍼 또는 직접 `block lg:hidden` 클래스로 처리.  
> SSR 환경에서 hydration mismatch 방지를 위해 CSS visibility 방식 사용 (JS로 동적 분기 안 함).

---

## 글씨 크기 토글 (시니어 접근성)

### 동작 방식
1. 사용자가 Footer의 **가/가/가 버튼** 클릭
2. `FooterFontSizeToggle.tsx` → `localStorage.setItem('unao-font-size', size)` 저장
3. `document.documentElement.setAttribute('data-font-size', size)` 즉시 적용
4. CSS에서 `html[data-font-size="LARGE"]`, `html[data-font-size="XLARGE"]` 선택자로 CSS Variables 전환

### 3단계 스케일
| 레벨 | html 속성 | 기본 폰트 |
|------|----------|----------|
| NORMAL | 없음 (기본) | 18px |
| LARGE | `data-font-size="LARGE"` | 20px |
| XLARGE | `data-font-size="XLARGE"` | 24px |

### SSR 이슈
- 서버에서는 `localStorage` 접근 불가 → 세션에 저장된 값을 서버 prop으로 전달하는 방식 사용
- `FontSizeProvider.tsx`: 서버 prop이 있으면 우선 적용, 없으면 `useEffect`에서 localStorage 읽음
- 첫 렌더 시 깜빡임(flash) 가능성 있음 (SSR ↔ 클라이언트 불일치)

---

## useMediaQuery 사용 여부
- 현재 홈 페이지에서 `useMediaQuery` 훅 **미사용**
- 반응형 분기는 **전량 Tailwind CSS 클래스** (`lg:`)로 처리
- 광고 분기도 CSS (`block lg:hidden`) 방식 — JS 기반 분기 없음
