# 홈 화면 UI 스펙 (HOME_UI_SPEC)

> **기준 문서**: PRD_Final_A v3.2 · NORTH_STAR.md v3.1
> **작성일**: 2026-03-16 | **수정일**: 2026-03-17
> **목적**: 개발자가 이 문서만 보고 홈 화면을 구현할 수 있도록 작성

---

## 0. 핵심 설계 원칙

```
"55세 여성 김영희님이 카카오톡 링크 타고 처음 왔을 때,
 3초 안에 '여기는 나 같은 사람들이 모여있는 따뜻한 곳이구나' + '유용한 정보가 있네' 를 느껴야 한다."
```

### 5060 시니어 UI 절대 원칙

| 원칙 | 수치 | 이유 |
|:---|:---|:---|
| 터치 타겟 최소 | **52 × 52px** | 중년 이상 손가락 굵기 대응 |
| 폰트 최소 | **17px** (캡션 14px) | 시력 저하 대응 |
| 줄간격 | **1.75** | 가독성 확보 |
| 버튼 높이 (모바일) | **52px** | 탭 실수 방지 |
| 터치 타겟 간격 | **8px 이상** | 오터치 방지 |
| word-break | **keep-all** | 한국어 줄바꿈 자연스럽게 |

---

## 1. 레이아웃 그리드 시스템

### 브레이크포인트

```css
/* Mobile First 기준 */
:root {
  --bp-tablet: 768px;
  --bp-desktop: 1024px;
  --bp-wide: 1280px;
  --content-max: 1200px;
  --sidebar-width: 300px;
  --gutter-mobile: 16px;
  --gutter-tablet: 24px;
  --gutter-desktop: 32px;
}
```

### 모바일 레이아웃 (≤767px)

```
|←── 100vw ──→|
|← 16px →|← content →|← 16px →|
           1열 풀폭
```

### 태블릿 레이아웃 (768~1023px)

```
|←── 100vw ──→|
|← 24px →|← content (2열) →|← 24px →|
```

### 데스크탑 레이아웃 (≥1024px)

```
|← auto →|←── max 1200px ──→|← auto →|
           |← 콘텐츠 영역 →| |← 300px →|
           (880px)           (사이드바)
           ← 20px gap →
```

```css
/* 데스크탑 메인 컨테이너 */
.home-layout {
  max-width: var(--content-max);  /* 1200px */
  margin: 0 auto;
  padding: 0 var(--gutter-desktop);
}

@media (min-width: 1024px) {
  .home-layout-inner {
    display: grid;
    grid-template-columns: 1fr var(--sidebar-width);  /* 880px + 300px */
    gap: 20px;
    align-items: start;
  }
}
```

---

## 2. 전체 페이지 구조

### 모바일 전체 구조

```
┌─────────────────────────────────┐ ← position: fixed, top: 0, z-index: 100
│ 상단 바 (TopBar)                  │   height: 56px (로고+🔍+👤)
├─────────────────────────────────┤ ← position: sticky, top: 56px, z-index: 99
│ 아이콘 메뉴 행 (IconMenu)           │   height: 64px (⭐💼💬⚡📖)
├─────────────────────────────────┤
│                                 │   ↑ 상단 고정 영역: 120px (56+64)
│  [히어로 배너 슬라이더]            │   height: 200px
│                                 │
├─────────────────────────────────┤
│  서비스 정체성 소개                │   padding: 20px 16px
├─────────────────────────────────┤
│  💼 오늘의 추천 일자리 (가로스크롤) │   padding: 0 16px
├─────────────────────────────────┤
│  🔥 지금 뜨는 이야기              │   padding: 0 16px
├─────────────────────────────────┤
│  ⭐ 에디터스 픽                   │   padding: 0 16px
├─────────────────────────────────┤
│  [AD] HOME-INLINE 광고            │   height: 100px
├─────────────────────────────────┤
│  📖 매거진 (2열)                  │   padding: 0 16px
├─────────────────────────────────┤
│  💬 소통 마당 최신                 │   padding: 0 16px
├─────────────────────────────────┤
│  Footer                         │
├─────────────────────────────────┤
│  [AD] MOBILE-STICKY (최하단)      │   height: 60px, 닫기 가능
└─────────────────────────────────┘
```

### 데스크탑 전체 구조

```
┌──────────────────────────────────────────────────┐ ← position: sticky, top:0
│  상단 GNB (GlobalNavBar)                          │   height: 72px
├──────────────────────────────────────────────────┤
│                                                  │
│  [히어로 배너 슬라이더 — 풀폭]                      │   height: 420px
│                                                  │
├──────────────────────────────────────────────────┤
│  ┌── 메인 콘텐츠 (880px) ──┐  ┌── 사이드바 (300px) ──┐  │
│  │  서비스 소개 (생략가능)   │  │  [SIDEBAR 광고]      │  │
│  ├─────────────────────────┤  │                    │  │
│  │  💼 추천 일자리 (7개 그리드)│  │  최신 소통글        │  │
│  ├─────────────────────────┤  │  (사이드 위젯)       │  │
│  │  🔥뜨는이야기 + ⭐에디터픽│  │                    │  │
│  │  (좌우 2열)              │  │  [SIDEBAR 광고]      │  │
│  ├─────────────────────────┤  │                    │  │
│  │  📖 매거진 (4열)          │  └────────────────────┘  │
│  ├─────────────────────────┤                           │
│  │  💬 소통 마당 최신        │                           │
│  └─────────────────────────┘                           │
├──────────────────────────────────────────────────┤
│  Footer                                          │
└──────────────────────────────────────────────────┘
```

---

## 3. 상단 바 / 아이콘 메뉴 / GNB

### 3-1. 모바일 TopBar (≤767px)

```
┌───────────────────────────────────────────┐  height: 56px
│  [🟠Logo]  우나어              🔍    👤   │
└───────────────────────────────────────────┘
┌───────────────────────────────────────────┐  height: 64px
│   ⭐      💼      💬      ⚡      📖    │ ← 아이콘 메뉴 (5개 균등배분)
│  베스트  내일찾기 사는이야기 활력충전소 매거진  │
└───────────────────────────────────────────┘
```

```css
/* ── TopBar ── */
.top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 56px;
  background: #FFFFFF;
  border-bottom: none;   /* 서브메뉴바와 자연스럽게 연결 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  padding-top: env(safe-area-inset-top);
}

.top-bar-logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  text-decoration: none;
}

.top-bar-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.top-bar-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--color-text);
  background: transparent;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.top-bar-btn:active {
  background: var(--color-primary-light);
}
```

**아이콘 규격**: 24×24px SVG, stroke 2px, color: var(--color-text) #1A1A1A

**로고 처리**:
- 텍스트 로고: "🌸 우나어" 또는 SVG 로고 이미지
- 높이: 32px (이미지 로고 사용 시)
- alt: "우리 나이가 어때서 홈으로"

---

### 3-2. 모바일 아이콘 메뉴 행 (≤767px)

> **설계 이유**: 하단 탭 바 없음. 상단 아이콘 메뉴 5개로 고정. 아이콘+라벨 조합으로 직관성 확보. PRD A3 기준.

```
┌───────────────────────────────────────────────┐ height: 64px
│   ⭐       💼        💬       ⚡       📖    │
│  베스트  내일찾기  사는이야기  활력충전소  매거진  │
│        ↑ active: 아이콘+라벨 Coral + 하단 2px   │
└───────────────────────────────────────────────┘
   ↑ 5개 균등 배분 (justify-content: space-around)
```

```css
/* ── IconMenu ── */
.icon-menu {
  position: sticky;
  top: calc(56px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  z-index: 99;
  height: 64px;
  background: #FFFFFF;
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  display: flex;
  align-items: stretch;
  justify-content: space-around;
}

/* 개별 메뉴 아이템 */
.icon-menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 52px;       /* 터치 타겟 확보 */
  min-height: 52px;
  padding: 6px 8px;
  color: var(--color-text-muted);  /* #999999 */
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  background: transparent;
  border: none;
}

.icon-menu-icon {
  font-size: 28px;       /* 아이콘 크기 */
  line-height: 1;
}

.icon-menu-label {
  font-size: 12px;       /* 아이콘 동반이므로 예외 허용 */
  font-weight: 500;
  white-space: nowrap;
}

/* active 상태 */
.icon-menu-item.active {
  color: var(--color-primary);
  font-weight: 700;
  border-bottom: 2px solid var(--color-primary);
}

.icon-menu-item:active {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
```

**콘텐츠 상단 여백** (상단바 + 아이콘 메뉴 가림 방지):
```css
.page-main {
  /* TopBar(56px) + IconMenu(64px) + safe-area */
  padding-top: calc(120px + env(safe-area-inset-top));
}
```

**메뉴 목록 (PRD A3 확정)**:
```typescript
const iconMenuItems = [
  { label: '베스트',      href: '/best',              icon: '⭐', write: false },
  { label: '내 일 찾기',  href: '/jobs',              icon: '💼', write: false },
  { label: '사는 이야기', href: '/community/stories',  icon: '💬', write: true },
  { label: '활력 충전소', href: '/community/humor',    icon: '⚡', write: true },
  { label: '매거진',      href: '/magazine',           icon: '📖', write: false },
]
```

**홈(/) 진입 시**: 모든 메뉴 비활성. 홈은 로고 탭으로 접근.

---

### 3-3. 데스크탑 GNB (≥1024px)

```
┌───────────────────────────────────────────────────────────────────┐
│ [🟠Logo] 우나어  │  베스트  내일찾기  사는이야기  활력충전소  매거진  │  🔍 통합검색  │  [로그인] │
└───────────────────────────────────────────────────────────────────┘
```

```css
.gnb {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 72px;
  background: #FFFFFF;
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.gnb-inner {
  max-width: var(--content-max);  /* 1200px */
  margin: 0 auto;
  padding: 0 32px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 40px;
}

.gnb-logo {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary);
  margin-right: 24px;
  flex-shrink: 0;
}

.gnb-nav {
  display: flex;
  align-items: center;
  gap: 32px;
  flex: 1;
}

.gnb-nav-link {
  font-size: 17px;
  font-weight: 500;
  color: var(--color-text);
  text-decoration: none;
  padding: 8px 0;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}

.gnb-nav-link:hover,
.gnb-nav-link.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.gnb-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

/* 로그인 버튼 */
.gnb-login-btn {
  height: 40px;
  padding: 0 20px;
  background: var(--color-primary);
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.gnb-login-btn:hover {
  background: var(--color-primary-hover);
}
```

**메뉴 순서 (PRD A3 확정)**:
1. 베스트 → `/best`
2. 내 일 찾기 → `/jobs`
3. 사는 이야기 → `/community/stories`
4. 활력 충전소 → `/community/humor`
5. 매거진 → `/magazine`

---

## 4. 히어로 배너 슬라이더

### 모바일 (≤767px)

```
┌─────────────────────────────────┐ ← 100vw × 200px
│                                 │
│  [배너 이미지 or 컬러 배경]        │
│                                 │
│  당신의                          │ ← 텍스트: 좌하단 정렬
│  두 번째 전성기                   │   white color + 그림자
│  [일자리 보기 →]                  │ ← CTA 버튼
│                                 │
│     ● ○ ○                      │ ← 도트 인디케이터
└─────────────────────────────────┘
```

```css
.hero-slider {
  width: 100%;
  height: 200px;
  position: relative;
  overflow: hidden;
  background: var(--color-primary-light);
}

.hero-slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.5s ease;
}

.hero-slide.active {
  opacity: 1;
}

.hero-slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 텍스트 오버레이 */
.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0,0,0,0.55) 0%,
    rgba(0,0,0,0.1) 50%,
    rgba(0,0,0,0) 100%
  );
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.hero-title {
  color: #FFFFFF;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
  margin-bottom: 12px;
  word-break: keep-all;
}

.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 20px;
  background: var(--color-primary);  /* #FF6F61 */
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  border: none;
  cursor: pointer;
  align-self: flex-start;
}

/* 슬라이드 도트 */
.hero-dots {
  position: absolute;
  bottom: 12px;
  right: 16px;
  display: flex;
  gap: 6px;
}

.hero-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255,255,255,0.5);
  transition: background 0.3s, width 0.3s;
}

.hero-dot.active {
  background: #FFFFFF;
  width: 20px;
  border-radius: 4px;
}
```

**슬라이더 동작**:
- 자동 전환: 4초 간격
- 터치 스와이프: 수평 드래그 50px 이상 시 전환
- 최대 3장 (광고 슬롯 HERO 포함 가능)
- 이미지 없을 때: `background: var(--color-primary)` 단색 배경

---

### 데스크탑 (≥1024px)

```css
@media (min-width: 1024px) {
  .hero-slider {
    height: 420px;     /* 1200 × 420 = 약 2.85:1 비율 */
    max-width: 100%;
  }

  .hero-overlay {
    max-width: var(--content-max);
    margin: 0 auto;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: 100%;
    padding: 40px 32px;
  }

  .hero-title {
    font-size: 40px;
    margin-bottom: 20px;
  }

  .hero-cta {
    height: 52px;
    padding: 0 28px;
    font-size: 18px;
  }
}
```

---

## 5. 서비스 정체성 소개 섹션

```
┌─────────────────────────────────────────────┐
│  50·60대 일자리와 따뜻한 수다,                │
│  우나어에서 만나요                            │
│                                             │
│  [처음이신가요? 우나어 알아보기 →]             │
└─────────────────────────────────────────────┘
```

```css
.identity-section {
  padding: 24px 16px;
  background: var(--color-primary-light);  /* #FFF0EE */
  border-bottom: 1px solid rgba(255, 111, 97, 0.15);
}

.identity-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.6;
  word-break: keep-all;
  margin-bottom: 16px;
}

.identity-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: none;
  padding: 8px 0;
  min-height: 44px;  /* 터치 타겟 */
}

@media (min-width: 1024px) {
  /* 데스크탑에서는 생략 (GNB 메뉴로 충분) */
  .identity-section {
    display: none;
  }
}
```

---

## 6. 오늘의 추천 일자리 섹션

### 6-1. 섹션 헤더 (공통 패턴)

모든 섹션에서 재사용되는 헤더 구조:

```css
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 16px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title-icon {
  font-size: 20px;  /* emoji or SVG */
}

.section-more-link {
  font-size: 15px;
  color: var(--color-text-sub);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;       /* 터치 영역 확보 */
  margin: -8px;
  min-height: 44px;
  min-width: 44px;
}

.section-more-link:hover {
  color: var(--color-primary);
}
```

---

### 6-2. 모바일: 일자리 카드 가로 스크롤

```
┌──────────────────────────────────────────┐
│ 💼 오늘의 추천 일자리          [전체보기 →] │
│                                          │
│ ←── [카드1] [카드2] [카드3] [카드4] ──→   │
│           (스와이프)                      │
└──────────────────────────────────────────┘
```

```css
.job-section {
  padding: 24px 0;
  border-bottom: 8px solid var(--color-bg);
}

/* 가로 스크롤 래퍼 */
.job-scroll-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 0 16px;
  display: flex;
  gap: 12px;
  /* 스크롤 힌트: 마지막 카드 살짝 보임 */
}

.job-scroll-wrapper::-webkit-scrollbar {
  display: none;
}

/* 일자리 카드 */
.job-card {
  flex-shrink: 0;
  width: 220px;
  background: var(--color-surface);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  scroll-snap-align: start;
  cursor: pointer;
  transition: box-shadow 0.15s;
  text-decoration: none;
  color: inherit;
}

.job-card:active {
  background: var(--color-bg);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

/* 태그 배지 */
.job-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.job-tag {
  height: 26px;
  padding: 0 10px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

/* 직종명 */
.job-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 6px;
  line-height: 1.4;
  /* 최대 2줄 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 지역 + 급여 */
.job-meta {
  font-size: 15px;
  color: var(--color-text-sub);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.job-salary {
  color: var(--color-primary);
  font-weight: 700;
}

/* 특이사항 (초보환영, 오전만 등) */
.job-highlight {
  font-size: 14px;
  color: var(--color-text-muted);
  line-height: 1.4;
  /* 1줄 생략 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**일자리 카드 데이터 구조**:
```typescript
interface JobCard {
  id: string
  title: string           // "도서관 사서 보조"
  location: string        // "강남구"
  salary: string          // "월 200만"
  tags: string[]          // ["나이무관", "오전만"]
  highlight?: string      // "초보 환영, 오전만 근무"
  isUrgent?: boolean      // 긴급 배지
}
```

---

### 6-3. 데스크탑: 일자리 카드 7개 그리드

```css
@media (min-width: 1024px) {
  .job-section {
    padding: 32px 0;
  }

  /* 가로 스크롤 → 그리드로 전환 */
  .job-scroll-wrapper {
    overflow-x: visible;
    scroll-snap-type: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  /* 데스크탑 카드 폭 auto */
  .job-card {
    width: auto;
    scroll-snap-align: none;
    padding: 20px;
  }

  .job-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    transform: translateY(-2px);
    transition: all 0.2s;
  }
}

/* 와이드에서 7개 배치 */
@media (min-width: 1200px) {
  /* 모든 7개를 1줄에 (섹션 헤더 포함) or 4+3 배치 */
  /* 구현 선택: 3+4 그리드 or 슬라이더 유지 */
}
```

**구현 결정**: 데스크탑에서 7개 중 4개는 1행, 나머지 3개는 2행 표시. "전체 일자리 보기" 버튼은 2행 끝에 배치.

---

## 7. 지금 뜨는 이야기 섹션

### 모바일: 리스트형

```
┌────────────────────────────────────────┐
│ 🔥 지금 뜨는 이야기              [더보기 →]│
│                                        │
│ 1  퇴직 후 처음 카페에서 알바한 썰...    │
│    💬 24   ❤️ 67   [활력충전소]         │
│ ──────────────────────────────────── │
│ 2  손주가 어제 처음 불렀어요 "할머니"... │
│    💬 12   ❤️ 34   [사는이야기]         │
│ ──────────────────────────────────── │
│ 3  기초연금 인상 소식, 이제 확정됐대요   │
│    💬 8    ❤️ 29   [매거진]             │
└────────────────────────────────────────┘
```

```css
.trending-section {
  padding: 24px 0;
  border-bottom: 8px solid var(--color-bg);
}

.trending-list {
  list-style: none;
  margin: 0;
  padding: 0 16px;
}

.trending-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
  text-decoration: none;
  color: inherit;
  min-height: 52px;  /* 터치 타겟 */
}

.trending-item:last-child {
  border-bottom: none;
}

.trending-rank {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
  min-width: 24px;
  flex-shrink: 0;
  line-height: 1.4;
}

.trending-content {
  flex: 1;
  min-width: 0;
}

.trending-title {
  font-size: 17px;
  color: var(--color-text);
  line-height: 1.5;
  /* 2줄 생략 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
  word-break: keep-all;
}

.trending-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--color-text-muted);
}

.trending-board-tag {
  background: var(--color-bg);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-text-sub);
}

/* 터치 피드백 */
.trending-item:active {
  background: var(--color-bg);
  margin: 0 -16px;
  padding: 14px 16px;
}
```

**표시 항목**: 최대 5개, 공감순 기준 (24시간 이내)

---

## 8. 에디터스 픽 섹션

### 모바일: 카드형 (1개 또는 2개)

```
┌────────────────────────────────────────────┐
│ ⭐ 에디터스 픽                               │
│                                            │
│ ┌──────────────────────────────────────┐  │
│ │ [썸네일 이미지 — 전폭 × 160px]         │  │
│ │                                      │  │
│ │ "남편이 퇴직하고 처음 해준 요리 이야기"  │  │
│ │ 가슴이 뭉클해서 눈물이 날 것 같았어요... │  │
│ │ ❤️ 45   💬 23   PO 추천              │  │
│ └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

```css
.editors-section {
  padding: 24px 0;
  border-bottom: 8px solid var(--color-bg);
}

.editors-card {
  margin: 0 16px;
  background: var(--color-surface);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  text-decoration: none;
  color: inherit;
  display: block;
  margin-bottom: 12px;
}

.editors-card:active {
  opacity: 0.95;
}

.editors-thumbnail {
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
  background: var(--color-bg);  /* 로딩 전 플레이스홀더 */
}

.editors-body {
  padding: 16px;
}

/* PO 추천 배지 */
.editors-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  background: var(--color-accent);  /* #FF8C00 */
  color: #FFFFFF;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 10px;
}

.editors-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.5;
  margin-bottom: 8px;
  word-break: keep-all;
  /* 2줄 생략 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.editors-excerpt {
  font-size: 15px;
  color: var(--color-text-sub);
  line-height: 1.6;
  margin-bottom: 12px;
  /* 2줄 생략 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.editors-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--color-text-muted);
}
```

---

## 9. 광고 섹션

### 9-1. HOME-INLINE (인라인 광고 배너, 에디터스픽 아래)

```css
.ad-inline {
  background: var(--color-ad-bg);  /* #F9F5F0 */
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  padding: 12px 16px;
  position: relative;
}

/* "광고" 라벨 (필수) */
.ad-label {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  background: rgba(255,255,255,0.8);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
}

.ad-inline-content {
  /* 구글 애드센스 또는 쿠팡 배너 컨테이너 */
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 광고가 없을 때 */
.ad-placeholder {
  height: 100px;
  background: var(--color-ad-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 14px;
}
```

---

### 9-2. SIDEBAR (데스크탑 우측 사이드바, ≥1024px)

```css
@media (min-width: 1024px) {
  .sidebar {
    position: sticky;
    top: calc(72px + 20px);  /* GNB 높이 + 여백 */
    width: var(--sidebar-width);  /* 300px */
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .sidebar-ad {
    background: var(--color-ad-bg);
    border-radius: 12px;
    padding: 16px;
    border: 1px solid var(--color-border);
    position: relative;
  }

  /* 사이드바 "최신 소통글" 위젯 */
  .sidebar-widget {
    background: var(--color-surface);
    border-radius: 12px;
    padding: 16px;
    border: 1px solid var(--color-border);
  }

  .sidebar-widget-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-post-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sidebar-post-item {
    padding: 10px 0;
    border-bottom: 1px solid var(--color-border);
    font-size: 15px;
    color: var(--color-text);
    line-height: 1.4;
    /* 1줄 생략 */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    text-decoration: none;
    display: block;
  }

  .sidebar-post-item:last-child {
    border-bottom: none;
  }

  .sidebar-post-item:hover {
    color: var(--color-primary);
  }
}
```

---

### 9-3. MOBILE-STICKY (모바일 최하단 고정 광고)

```css
@media (max-width: 767px) {
  .ad-mobile-sticky {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 99;
    background: var(--color-ad-bg);
    border-top: 1px solid var(--color-border);
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* 닫기 버튼 */
  .ad-close-btn {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.9);
    border-radius: 50%;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 18px;
  }

  .ad-mobile-sticky.hidden {
    display: none;
  }

  /* 스티키 광고 표시 중일 때 콘텐츠 하단 여백 */
  .page-content.has-sticky-ad {
    padding-bottom: calc(60px + env(safe-area-inset-bottom) + 8px);
  }
}
```

---

## 10. 매거진 섹션

### 모바일: 2열 카드 그리드

```
┌────────────────────────────────────────────┐
│ 📖 매거진                          [더보기 →]│
│                                            │
│ ┌──────────────┐  ┌──────────────┐        │
│ │  [썸네일]    │  │  [썸네일]    │        │
│ │              │  │              │        │
│ │ 기초연금 인상 │  │ 무릎 건강    │        │
│ │ 핵심 정리    │  │ 관리법        │        │
│ └──────────────┘  └──────────────┘        │
│                                            │
│ ┌──────────────┐  ┌──────────────┐        │
│ │  [썸네일]    │  │  [썸네일]    │        │
│ │ 퇴직 후 첫   │  │ 고향사랑기부  │        │
│ │ 창업 이야기  │  │ 세금 절약법   │        │
│ └──────────────┘  └──────────────┘        │
└────────────────────────────────────────────┘
```

```css
.magazine-section {
  padding: 24px 0;
  border-bottom: 8px solid var(--color-bg);
}

.magazine-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0 16px;
}

.magazine-card {
  background: var(--color-surface);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  text-decoration: none;
  color: inherit;
  display: block;
  transition: box-shadow 0.15s;
}

.magazine-card:active {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.magazine-thumbnail-wrapper {
  width: 100%;
  aspect-ratio: 4 / 3;  /* 4:3 비율 */
  overflow: hidden;
  background: var(--color-bg);  /* 로딩 플레이스홀더 */
  position: relative;
}

.magazine-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 이미지 로딩 중 shimmer 효과 */
}

/* Shimmer 로딩 애니메이션 */
.magazine-thumbnail.loading {
  background: linear-gradient(
    90deg,
    var(--color-bg) 25%,
    var(--color-border) 50%,
    var(--color-bg) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.magazine-body {
  padding: 12px;
}

.magazine-category {
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 600;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.magazine-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.5;
  word-break: keep-all;
  /* 3줄 생략 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 데스크탑 4열 */
@media (min-width: 1024px) {
  .magazine-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    padding: 0;
  }

  .magazine-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    transform: translateY(-2px);
    transition: all 0.2s;
  }

  .magazine-title {
    font-size: 16px;
  }
}

/* 태블릿 3열 */
@media (min-width: 768px) and (max-width: 1023px) {
  .magazine-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: 0 24px;
  }
}
```

---

## 11. 소통 마당 최신 섹션

```css
.community-section {
  padding: 24px 0;
  border-bottom: 8px solid var(--color-bg);
}

.community-list {
  list-style: none;
  margin: 0;
  padding: 0 16px;
}

.community-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
  text-decoration: none;
  color: inherit;
  min-height: 52px;
}

.community-item:last-child {
  border-bottom: none;
}

/* 게시판 유형 배지 */
.board-badge {
  flex-shrink: 0;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  margin-top: 2px;
}

.board-badge.stories {
  background: #EEF2FF;
  color: #4F46E5;
}

.board-badge.humor {
  background: #FEF3C7;
  color: #D97706;
}

.board-badge.magazine {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.community-title {
  flex: 1;
  font-size: 16px;
  color: var(--color-text);
  line-height: 1.5;
  word-break: keep-all;
  /* 2줄 생략 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.community-meta {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 4px;
}
```

**표시 항목**: 최대 5개, 최신순

---

## 12. Footer

```css
.footer {
  background: var(--color-text);  /* #1A1A1A */
  color: rgba(255,255,255,0.6);
  padding: 32px 16px;
  font-size: 14px;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.footer-link {
  color: rgba(255,255,255,0.7);
  text-decoration: none;
  font-size: 14px;
  min-height: 44px;  /* 터치 타겟 */
  display: flex;
  align-items: center;
}

.footer-link:hover {
  color: #FFFFFF;
}

.footer-copy {
  font-size: 13px;
  color: rgba(255,255,255,0.4);
  line-height: 1.8;
}

@media (min-width: 1024px) {
  .footer {
    padding: 48px 32px;
  }

  .footer-inner {
    max-width: var(--content-max);
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
}
```

**필수 링크**: 회사소개 · 이용약관 · **개인정보처리방침** (굵게) · 운영정책 · 고객문의

---

## 13. 뜨는이야기 + 에디터스픽 데스크탑 2열 레이아웃

```css
@media (min-width: 1024px) {
  .trending-editors-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  /* 각 섹션의 border-bottom 제거 */
  .trending-section,
  .editors-section {
    border-bottom: none;
    padding: 0;
  }

  /* 에디터스픽 데스크탑: 2개 카드 */
  .editors-card-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .editors-card {
    margin: 0;
    display: flex;
    flex-direction: row;
    height: 120px;
  }

  .editors-thumbnail {
    width: 160px;
    height: 120px;
    flex-shrink: 0;
  }

  .editors-body {
    flex: 1;
    padding: 12px 16px;
  }
}
```

---

## 14. 뜨는 이야기 + 에디터스픽 데스크탑 레이아웃 (좌우 2열)

```
┌────────────────────────────────────────────────────┐
│   🔥 지금 뜨는 이야기      │   ⭐ 에디터스 픽         │
│   ──────────────────────   │   ────────────────────  │
│ 1. 퇴직 후 처음 카페에서...  │  [썸] 남편이 퇴직하고...  │
│    💬24  ❤️67  [활력충전소] │       ❤️45  💬23         │
│ 2. 손주가 어제 처음...      │  [썸] 기초연금 바뀐 것... │
│    💬12  ❤️34              │       ❤️29  💬11         │
│ 3. 기초연금 인상 소식...    │                          │
└────────────────────────────────────────────────────┘
```

---

## 15. 플로팅 글쓰기 버튼 (FAB)

> **PRD A3-3 기준**: 사용자가 글쓸 수 있는 페이지(사는 이야기, 활력 충전소)에서만 표시.
> 홈에서는 표시하지 않음 (홈은 진입점이므로).

```
                                    ┌───────────────┐
                                    │  ✏️ 글쓰기    │  ← 우하단 고정
                                    └───────────────┘
```

```css
.fab-write {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + 24px);
  right: 16px;
  z-index: 97;
  height: 52px;
  padding: 0 24px;
  background: var(--color-primary);     /* #FF6F61 */
  color: #FFFFFF;
  border: none;
  border-radius: 26px;
  font-size: 17px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(255, 111, 97, 0.4);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.2s, box-shadow 0.2s;
}

.fab-write:active {
  transform: scale(0.95);
  box-shadow: 0 2px 8px rgba(255, 111, 97, 0.3);
}

.fab-write-icon {
  font-size: 20px;
}

/* 스크롤 시 축소 (아이콘만) — 선택사항 */
.fab-write.compact {
  width: 52px;
  padding: 0;
  justify-content: center;
  border-radius: 50%;
}

.fab-write.compact .fab-write-label {
  display: none;
}

/* 데스크탑에서는 GNB 내 버튼으로 대체 */
@media (min-width: 1024px) {
  .fab-write {
    display: none;
  }
}
```

**표시 조건**:
```typescript
// 글쓰기 FAB은 write 권한이 있는 페이지에서만 표시
const showFab = pathname.startsWith('/community/stories') || pathname.startsWith('/community/humor')
```

---

## 16. 페이지 최상단 스크롤 버튼

```css
.scroll-to-top {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + 16px); /* 하단 탭바 없음 */
  right: 16px;
  z-index: 98;
  width: 48px;
  height: 48px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
  font-size: 20px;
  color: var(--color-text-sub);
}

/* 300px 이상 스크롤 시 표시 */
.scroll-to-top.visible {
  opacity: 1;
  pointer-events: auto;
}

@media (min-width: 1024px) {
  .scroll-to-top {
    bottom: 32px;
    right: 32px;
    width: 52px;
    height: 52px;
  }
}
```

---

## 16. CSS 변수 전체 선언

```css
/* globals.css 또는 design-tokens.css */
:root {
  /* 컬러 */
  --color-primary: #FF6F61;
  --color-primary-hover: #E85D50;
  --color-primary-light: #FFF0EE;
  --color-accent: #FF8C00;
  --color-bg: #F5F3F0;
  --color-surface: #FFFFFF;
  --color-text: #1A1A1A;
  --color-text-sub: #666666;
  --color-text-muted: #999999;
  --color-border: #E0E0E0;
  --color-success: #4CAF50;
  --color-warning: #FF9800;
  --color-error: #F44336;
  --color-ad-bg: #F9F5F0;

  /* 타이포 */
  --font-h1: 28px;
  --font-h2: 24px;
  --font-h3: 20px;
  --font-body: 17px;
  --font-body-lg: 20px;
  --font-body-xl: 24px;
  --font-caption: 14px;
  --font-button: 18px;
  --font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;

  /* 레이아웃 */
  --content-max: 1200px;
  --sidebar-width: 300px;
  --bp-tablet: 768px;
  --bp-desktop: 1024px;
  --gutter-mobile: 16px;
  --gutter-tablet: 24px;
  --gutter-desktop: 32px;

  /* 컴포넌트 */
  --radius-card: 12px;
  --radius-btn: 8px;
  --btn-height-mobile: 52px;
  --btn-height-desktop: 48px;
  --touch-target: 52px;
  --shadow-card: 0 2px 8px rgba(0,0,0,0.08);
  --shadow-card-hover: 0 4px 16px rgba(0,0,0,0.12);

  /* 트랜지션 */
  --transition-fast: 0.1s ease;
  --transition-normal: 0.2s ease;
}

/* 기본 리셋 */
* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-body);
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.75;
  word-break: keep-all;
  -webkit-font-smoothing: antialiased;
}
```

---

## 17. Next.js 컴포넌트 구조

```
app/
├── (user)/
│   └── page.tsx                 ← 홈 페이지 (Server Component)
│
components/home/
├── HeroSlider.tsx               ← 'use client' (자동 슬라이드)
├── JobSection.tsx               ← 서버 (data fetch) + JobCard 포함
├── JobCard.tsx
├── TrendingSection.tsx          ← 서버
├── EditorsPickSection.tsx       ← 서버
├── MagazineSection.tsx          ← 서버
├── CommunitySection.tsx         ← 서버
└── AdSlot.tsx                   ← 'use client' (AdSense/쿠팡 스크립트)

components/layout/
├── TopBar.tsx                   ← 'use client' (스크롤 감지)
├── IconMenu.tsx                 ← 'use client' (active 상태, 아이콘 5개 균등 배분)
├── GNB.tsx                      ← 'use client' (현재 경로 active, 데스크탑)
├── FloatingWriteButton.tsx      ← 'use client' (FAB, 사는이야기/활력충전소에서만 표시)
├── Sidebar.tsx                  ← 서버 + 광고 슬롯
├── Footer.tsx                   ← 서버
└── ScrollToTop.tsx              ← 'use client'
```

---

## 18. 홈 페이지 데이터 패칭 전략

```typescript
// app/(user)/page.tsx — Server Component
import { getRecommendedJobs } from '@/lib/jobs'
import { getTrendingPosts } from '@/lib/posts'
import { getEditorsPicks } from '@/lib/posts'
import { getLatestMagazines } from '@/lib/magazine'
import { getLatestCommunityPosts } from '@/lib/community'

export default async function HomePage() {
  // 병렬 패칭 (Promise.all)
  const [jobs, trending, editors, magazines, community] = await Promise.all([
    getRecommendedJobs({ limit: 7 }),
    getTrendingPosts({ limit: 5, hours: 24 }),
    getEditorsPicks({ limit: 2 }),
    getLatestMagazines({ limit: 4 }),
    getLatestCommunityPosts({ limit: 5 }),
  ])

  return (
    <main>
      <HeroSlider />
      <IdentitySection />
      <JobSection jobs={jobs} />
      <TrendingSection posts={trending} />
      <EditorsPickSection posts={editors} />
      <AdSlot slotId="HOME-INLINE" />
      <MagazineSection articles={magazines} />
      <CommunitySection posts={community} />
      <Footer />
    </main>
  )
}
```

**캐싱 전략**:
- 일자리 데이터: `revalidate: 3600` (1시간)
- 뜨는 이야기: `revalidate: 300` (5분)
- 에디터스 픽: `revalidate: 86400` (24시간)
- 매거진: `revalidate: 3600` (1시간)
- 소통 마당 최신: `revalidate: 60` (1분)

---

## 19. 반응형 동작 요약표

| 섹션 | 모바일 (≤767px) | 태블릿 (768~1023px) | 데스크탑 (≥1024px) |
|:---|:---|:---|:---|
| 네비게이션 | **상단바 + 아이콘 메뉴 (5개 균등)** | 상단바 + 아이콘 메뉴 | 상단 GNB 1행 통합 |
| 히어로 배너 | 100vw × 200px | 100vw × 300px | 100vw × 420px |
| 서비스 소개 | 표시 | 표시 | **숨김** |
| 일자리 카드 | 가로 스크롤 (220px × n) | 3열 그리드 | 4열 그리드 (7개) |
| 뜨는이야기+에디터스픽 | 위아래 순서 | 위아래 순서 | **좌우 2열** |
| 매거진 | **2열** | **3열** | **4열** |
| 광고 (인라인) | 풀폭 배너 | 풀폭 배너 | **사이드바로 이동** |
| 모달 | 하단 풀스크린 시트 | 하단 시트 | 중앙 팝업 (max 480px) |
| 글쓰기 버튼 | 우하단 FAB (Coral) | 우하단 FAB | GNB 내 버튼 |

---

## 20. 시니어 UX 특이사항 (개발 시 반드시 확인)

| 항목 | 내용 | 구현 방법 |
|:---|:---|:---|
| **뒤로가기 지원** | 브라우저 뒤로가기 + 좌상단 ← 버튼 | `router.back()` + `<button>← 이전</button>` |
| **터치 피드백** | 버튼/카드 터치 시 0.1초 하이라이트 | `:active { opacity: 0.85 }` |
| **오프라인 안내** | 인터넷 끊기면 토스트 배너 | `navigator.onLine` 감지 |
| **입력창 키보드** | 댓글 입력 시 키보드 위로 올라옴 | `scrollIntoView({ behavior: 'smooth' })` |
| **스크롤 복원** | 목록→상세→뒤로가기 시 위치 복원 | Next.js 기본 제공 (`scrollRestoration`) |
| **이미지 lazy load** | 뷰포트 진입 시 로딩 | `next/image` 기본 동작 |
| **shimmer 효과** | 이미지 로딩 중 반짝이는 플레이스홀더 | `.loading` CSS animation |
| **큰 글씨** | 최소 17px, 중요 정보 20px+ | CSS 변수 준수 |
| **더보기 버튼** | 무한 스크롤 대신 "더보기" 버튼 | 시니어가 무한 스크롤 어색해함 |
| **로딩 스피너** | 작은 점 스피너 대신 크고 명확하게 | 32px 이상 스피너 |

---

> **이 문서 기준 구현 후 체크리스트**
> - [ ] 모바일 767px 이하에서 모든 터치 타겟 52px 이상
> - [ ] 데스크탑 1024px에서 사이드바 레이아웃 정상 동작
> - [ ] 히어로 배너 모바일 200px / 데스크탑 420px 높이
> - [ ] 일자리 카드 모바일 가로 스크롤 (snap) 동작
> - [ ] 매거진 모바일 2열 / 데스크탑 4열
> - [ ] 광고 "광고" 라벨 모든 슬롯에 표시
> - [ ] MOBILE-STICKY 광고 닫기(✕) 버튼 동작 (24시간 안보기)
> - [ ] 폰트 최소 17px (캡션 14px만 예외)
> - [ ] shimmer 로딩 애니메이션 이미지 로딩 중 동작
> - [ ] 아이콘 메뉴 5개 균등 배분 및 active 표시 확인
> - [ ] FAB 글쓰기 버튼 사는이야기/활력충전소에서만 표시 확인
