# 게시글/게시판 UI — AS-IS 지도 & 리팩토링 계획

- 작성일: 2026-07-28
- 성격: **read-only 분석 문서** (코드 0줄 변경 / schema·DB 무변경 / PR·merge·push 없음)
- 분석 기준: `origin/main` = `a1609498` (PR #206 머지 직후)
- 목적: 게시글/게시판 UI 전면 디자인 개편을 **안전한 순서로** 진행하기 위한 정확한 현재 지도

## 조사 방법 (신뢰도 근거)

메인 워킹트리는 타 세션 브랜치(`feat/admin-kpi-monthly-view`) + 미커밋 31건 상태였습니다. 그대로 읽으면 **다른 세션의 미완성 코드를 AS-IS로 오인**하므로, `origin/main` 기준 **읽기 전용 worktree**를 별도 생성해 그 안에서만 분석했습니다. 아래 모든 수치는 실제 배포된 `main` 코드 기준입니다.

> 갱년기톡 배지/베스트/검색 노출 건(#204·#205·#206)은 이미 main에 반영 완료돼 **종결**로 간주하고, 이 문서에서는 다루지 않습니다.

---

## 1. 현재 판정

**결론: 목록 카드 계층은 생각보다 건강하다. 진짜 취약점은 ① 댓글 영역 ② 배지 5종 난립 ③ 홈 섹션 5개 복붙 ④ 미사용 컴포넌트 9개다.**

| 판정 | 근거 |
|---|---|
| 🟢 **양호** | `PostCard` / `MagazineCard` / `JobCard` 전부 **arbitrary 폰트 0곳** → 글씨 크기(가+) 완전 대응 |
| 🟢 **양호** | 본문(`.post-content`)은 `!important`로 가+ 강제 적용 → 상세 본문 안전 |
| 🟢 **양호** | Tailwind `text-xs~2xl`이 전부 CSS 변수 매핑 → 대부분 클래스가 이미 토큰 기반 |
| 🔴 **취약** | **댓글 영역** — `CommentItem` 15곳 + `CommentSection` 6곳 arbitrary → **가+ 미반응** |
| 🔴 **취약** | 카테고리 배지가 **5가지 변형**(radius·weight·padding 제각각) |
| 🟠 **중복** | 홈 섹션 5개가 헤더·더보기·리스트를 **각자 복붙** |
| 🟠 **정리** | **미사용 컴포넌트 9개** + dev 쇼케이스 전용 UI 프리미티브 5개 |

---

## 2. AS-IS 핵심 요약

### 2-1. 세 개의 세계

```
① 커뮤니티 4보드   /community/[boardSlug]  단일 동적 라우트 + 공용 PostCard
   stories / menopause / life2 / humor

② 독립 보드        /magazine, /jobs        별도 라우트 + 전용 카드 + 전용 상세

③ 홈 + 베스트      /, /best                홈=섹션별 인라인 마크업(공용 카드 미사용)
                                            베스트=공용 PostCard 재사용
```

"게시글 카드"가 코드상 **5종**으로 존재합니다: `PostCard` / 홈 섹션 인라인 `<li>` / `MagazineCard`(파일 내부 함수) / `JobCard` / `SearchResultCard`(파일 내부 함수).

### 2-2. 글씨 크기(가+) 토글 — 동작 원리와 실제 반응 범위 ⭐

`FontSizeProvider`가 `<html data-font-size="LARGE|XLARGE">`를 세팅하면 CSS 변수가 통째로 교체됩니다.

```
NORMAL → LARGE → XLARGE
--text-caption  15px → 17px → 20px
--text-body     18px → 20px → 24px
--text-title    20px → 24px → 28px
--text-heading  24px → 28px → 32px
--icon-box-size 48px → 56px → 64px   (IconMenu도 함께 커짐)
```

**중요**: `tailwind.config.ts`에서 Tailwind 기본 폰트 스케일이 **전부 CSS 변수로 재매핑**돼 있습니다.

| 클래스 | 매핑 | 가+ 반응 |
|---|---|---|
| `text-xs` | `var(--text-caption)` | ✅ |
| `text-sm` | `var(--text-sm)` | ✅ |
| `text-base` | `var(--text-body)` | ✅ |
| `text-lg` | `var(--text-title)` | ✅ |
| `text-xl` | `var(--text-heading)` | ✅ |
| `text-2xl` | `var(--text-display)` | ✅ |
| `text-body`/`caption`/`title`/`heading` | 커스텀 유틸 | ✅ |
| **`text-[17px]` 등 arbitrary** | 고정 px | ❌ **미반응** |
| **`text-3xl` / `text-4xl`** | 고정 36/44px | ❌ **미반응** |

→ **문제는 arbitrary 값뿐입니다.** 서비스 화면 전체 **267곳**, `text-3xl/4xl` 8곳.

또한 `.post-content p/li/span/div/strong/em/a`에 `font-size: var(--text-body) !important`가 걸려 있어, **상세 본문은 어떤 인라인 스타일이 와도 가+에 반응**합니다. (댓글은 이 셀렉터 바깥 → 미반응)

### 2-3. 게시판 UI 파일별 가+ 대응 실측

| 파일 | arbitrary 폰트 | 가+ 대응 |
|---|---|---|
| `PostCard.tsx` | **0** | ✅ 완전 |
| `MagazineContent.tsx` (MagazineCard 포함) | **0** | ✅ 완전 |
| `JobCard.tsx` | **0** | ✅ 완전 |
| `NextPostsInline.tsx` | **0** | ✅ 완전 |
| `TrendingSection.tsx` | 2 | ⚠️ 더보기 링크 `17px` + **랭킹 숫자 `22px`** |
| `StoriesSection` / `HumorSection` / `MagazineSection` / `JobSection` | 각 1 | ⚠️ "더보기 →" `17px` |
| `PostListBottom` / `SearchResults` / `BestContent` / `BoardPostListClient` | 각 1 | ⚠️ 경미 |
| 커뮤니티 상세 `page.tsx` | 2 | ⚠️ 뒤로가기 링크 등 |
| 일자리 상세 `page.tsx` | 1 | ⚠️ 경미 |
| **매거진 상세 `page.tsx`** | **6** | 🔴 |
| **`CommentSection.tsx`** | **6** (14·15·17·48px) | 🔴 |
| **`CommentItem.tsx`** | **15** (11·12·17px ×13) | 🔴 **최대 취약** |

→ **댓글 영역 21곳이 가+에 전혀 반응하지 않습니다.** 시니어 대상 서비스에서 댓글은 핵심 읽기 영역인데, 닉네임·시간·수정/삭제/답글/공감 버튼이 전부 17px 고정입니다.

---

## 3. 게시판별 구조표

### 3-1. 라우트 → 파일 → 쿼리 매핑

| 화면 | URL | page.tsx | 데이터 쿼리 | 목록/카드 컴포넌트 | 렌더 전략 |
|---|---|---|---|---|---|
| 홈 | `/` | `(main)/page.tsx` | `getCachedHomeSections` · `getLatestMagazinePosts` · `getLatestJobs` | 홈 섹션 5종(인라인) | ISR 300s + Suspense 스트리밍 |
| 베스트 | `/best` | `(main)/best/page.tsx` | `composeBestHot` (`unstable_cache` 60s) | `BestContent` → **`PostCard`** | 서버 + 클라 재조회 `/api/best` |
| 사는이야기 | `/community/stories` | `(main)/community/[boardSlug]/page.tsx` | `getCachedBoardPage(STORY)` | `BoardPostListClient` → **`PostCard`** | ISR 300s + `generateStaticParams` |
| 갱년기톡 | `/community/menopause` | 〃 동일 파일 | 〃 (MENOPAUSE) | 〃 | 〃 |
| 2막준비 | `/community/life2` | 〃 | 〃 (LIFE2) | 〃 | 〃 |
| 웃음방 | `/community/humor` | 〃 | 〃 (HUMOR) | 〃 | 〃 |
| 매거진 | `/magazine` | `(main)/magazine/page.tsx` | `getCachedMagazinePage` | `MagazineContent` → `MagazineCard`(내부 함수) | ISR 60s |
| 일자리 | `/jobs` | `(main)/jobs/page.tsx` | `getCachedJobsPage` | `JobsContent` → **`JobCard`**(별도 파일) | ISR 120s |
| 커뮤니티 상세 | `/community/[slug]/[postId]` | `.../[postId]/page.tsx` | `getPostDetail` + `getRelatedCommunityPosts` + `getCrossBoardCandidates` | — | **`force-static`** + ISR 300s |
| 매거진 상세 | `/magazine/[id]` | `(main)/magazine/[id]/page.tsx` | `getMagazineDetail` + `getRelatedMagazinePosts` | — | ISR |
| 일자리 상세 | `/jobs/[id]` | `(main)/jobs/[id]/page.tsx` | — | — | ISR |
| 검색 | `/search` | `(main)/search/page.tsx` | `searchAll` | `SearchResults` → `SearchResultCard`(내부) | 동적 |
| 시리즈 허브 | `/magazine/series/[seriesId]` | 별도 | — | — | 동적 |
| 지역 일자리 | `/jobs/region/[sido]` | 별도 | — | `JobCard` 재사용 | — |

### 3-2. 화면별 UI 구성 요소

| 화면 | 목록 카드 | 카테고리 배지 | 랭킹 숫자 | 메타(공감/댓글/조회) | 광고 | 가+ | 모바일/데스크탑 |
|---|---|---|---|---|---|---|---|
| 홈 · 지금뜨는이야기 | 인라인 `<li>` | `rounded-full px-2 py-0.5 font-normal` + 보드명 | **`text-[22px] italic` 코랄** | 💬👁 (SVG) | 섹션 아래 인피드 | ⚠️ 랭킹·더보기 | 모바일 1열 / 데스크탑 2열 grid |
| 홈 · 사는이야기 | 인라인 `<li>` | 동일 + `inline-block mb-1.5` | 없음 | 💬👁 | 아래 쿠팡 | ⚠️ 더보기 | 모바일 세로 / 데스크탑 2-col |
| 홈 · 웃음방 | 인라인 `<li>` | 동일 | 없음 | 💬👁 | 아래 인피드 | ⚠️ 더보기 | 〃 |
| 홈 · 매거진 | 썸네일 카드 | **`rounded-md font-bold`** ← 유일하게 다름 | 없음 | 없음 | — | ⚠️ 더보기 | 모바일 가로스크롤 / 데스크탑 4열 |
| 홈 · 일자리 | 카드 | 긴급/태그(자체) | 없음 | 지역·급여 | — | ⚠️ 더보기 | 모바일 가로스크롤 / 데스크탑 4열 |
| 베스트 | **`PostCard`** (`showBoardBadge=true`) | 보드명 `px-3 py-1 font-bold` | **없음** | ❤️💬👁 | `PostListWithAds` 3·7 | ✅ | 동일 |
| 커뮤니티 4보드 | **`PostCard`** (`showBoardBadge=false`) | `post.category` 동일 스타일 | 없음 | ❤️💬👁 | 〃 | ✅ | 동일 |
| 매거진 | `MagazineCard` | **텍스트만**(`text-[#B23B2E]`) | 없음 | 👁·시간 | 〃 | ✅ | 동일(가로 리스트) |
| 일자리 | `JobCard` | 급구/지역/태그 | 없음 | 👁💬·시간 | 〃 | ✅ | 동일 |
| 검색 | `SearchResultCard` | `rounded-full px-2.5 font-bold` | 없음 | 이모지 ❤️💬 | `search-feed` | ⚠️ 1곳 | 동일 |
| 상세 하단 "다른 글" | `PostListBottom` 인라인 | 없음 | **`text-caption` 회색** | 이모지 💬❤️ | — | ✅ | 동일 |

### 3-3. 상세 페이지 3종 비교

| 블록 | 커뮤니티 | 매거진 | 일자리 |
|---|---|---|---|
| 컨테이너 | `max-w-[720px] px-4` + `bg-[var(--surface-warm)]` | `max-w-[720px] px-3` (warm 없음) | `max-w-[720px] px-4` (warm 없음) |
| Breadcrumbs | ✅ | ❌ (JSON-LD만) | ❌ |
| 제목 | `text-xl` (=heading, 가+✅) | `text-2xl` (=display, 가+✅) | `text-xl` |
| IdentityBanner | ✅ | ✅ (`boardSlug="magazine"`) | ❌ |
| 본문 래퍼 | `post-content` + variant 약 22개 | `post-content magazine-body` + variant **40개+** | `post-content` + variant 1개 |
| ActionBar(공감/공유) | ✅ 카드 내부 | ✅ 카드 외부 | ✅ |
| 관련글 | `NextPostsInline`(v2 점수화, 클라) + `PostListBottom` | "함께 읽어보세요" 자체 구현 | `JobListBottom` |
| **댓글** | ✅ `CommentSection` | ❌ **없음(정책)** | ❌ **없음(정책)** |
| 가입 CTA | `PostCTA` | `MagazineExploreLinks` | ❌ |
| 광고 | in-article + Coupang + bottom | in-article + bottom | in-article + Coupang + bottom |

> **정정 이력 (2026-07-28)** — 이 표에 오기가 있어 코드 기준으로 바로잡았습니다. 이 문서는 개편 의사결정의 기준이라 틀린 표를 방치하면 다음 판단이 틀어집니다.
> - **ActionBar 일자리 `❌` → `✅`** — 오기였습니다. `jobs/[id]/page.tsx`에 `<ActionBar>`가 실제로 렌더됩니다(공감·공유 가능).
> - **댓글 일자리 `✅` → `❌`** — PR #214 반영. 내일찾기를 매거진과 같은 정보성 콘텐츠로 정리하며 상세 댓글 영역과 목록 댓글 수를 제거했습니다. **기존 Comment 레코드 164건은 보존**(UI 미노출).
> - **§3-1 의존성 지도** `CommentSection` 소비처 4 → **3**(일자리상세 제외).

---

## 4. 공용화 상태

### 4-1. 공용 컴포넌트 (변경 시 다중 화면 영향)

```
PostCard              ← BoardPostListClient(4보드) + BestContent      [5화면] 🔴
PostListWithAds       ← BoardPostListClient·BestContent·MagazineContent·JobsContent [8화면] 🔴
BoardPaginationFooter ← 위 4곳 동일                                    [8화면] 🔴
CommentSection        ← 커뮤니티상세·이벤트VOTE·이벤트FEEDBACK          [3소비처] 🔴
  └ CommentItem (재귀 답글)
getCategoryChipClass  ← PostCard·홈4섹션·SearchResults                [6소비처]
BOARD_DISPLAY_NAMES   ← PostCard·홈3섹션
formatTimeAgo         ← PostCard·상세3종·MagazineCard·JobCard·PostListBottom·SearchResults·CommentItem
```

### 4-2. 단일 소비처 (격리됨 — 상대적으로 안전)

`MagazineCard`(MagazineContent 내부) · `JobCard` · `SearchResultCard`(내부) · 홈 섹션 5종 · `IdentityBanner` · `NextPostsInline` · `PostListBottom`

### 4-3. 미사용 컴포넌트 — **9개** (import 전수 조사 결과)

정적·상대경로·동적 import를 모두 수집해 대조한 결과, **어디서도 import되지 않는** 컴포넌트:

| 파일 | 비고 |
|---|---|
| `features/home/ActivityPulse.tsx` | 쿼리 `getActivityPulseData`도 동반 사망 |
| `features/home/AdInline.tsx` | |
| `features/home/CommunitySection.tsx` | ⚠️ `bbc581f9`가 스타일을 고쳤으나 **렌더되지 않음**(헛수고) |
| `features/home/Life2Section.tsx` | ⚠️ 동일 |
| `features/home/HomeSidebar.tsx` | **PC 사이드바 광고 슬롯(`ADSENSE.PC_SIDEBAR`) 포함** → 창업자 결정 필요 |
| `features/home/MyActivity.tsx` | 전용 쿼리 `getUserCounts`도 소비처 0 |
| `features/community/InlineRelatedPosts.tsx` | `NextPostsInline`이 대체 |
| `features/community/LoadMoreButton.tsx` | 페이지네이션 전환으로 사망 |
| `ad/MobileStickyAd.tsx` | 광고 컴포넌트, 미연결 |

> 별도: `features/home/PersonalGreeting.tsx`는 `(main)/page.tsx`에 **주석 처리된 import**만 존재(2026-06-17 창업자 요청 비활성화). 자동 판정에는 "import됨"으로 잡히지만 실제로는 렌더되지 않습니다.

### 4-4. 만들어놓고 안 쓰는 디자인 시스템 프리미티브

| 컴포넌트 | 서비스 사용 | dev 쇼케이스 |
|---|---|---|
| `ui/EmptyState` | **0** | ✅ |
| `ui/Card` | **0** | ✅ |
| `ui/Badge` | **0** | ✅ |
| `ui/Skeleton` | **0** | ✅ |
| `ui/Input` | **0** | ✅ |
| `ui/Chip` | 10 | — |
| `ui/BottomSheet` | 6 | — |
| `ui/ConfirmDialog` | 4 | — |
| `ui/ScrollableChipRow` | 4 | — |

> **핵심 아이러니**: 빈 상태(`EmptyState`) 컴포넌트가 이미 있는데 **실제 화면 11곳이 동일 Tailwind 문자열을 복붙**하고 있습니다.

---

## 5. 하드코딩 / 중복 / 위험 파일표

### 5-A. 게시판 이름·메뉴 배열 (진실의 원천 다중화)

| 위치 | 내용 | 비고 |
|---|---|---|
| `lib/board-registry.ts` | slug·urlPrefix·isCommunity **구조 SSoT** | 표시명은 의도적 제외 |
| `lib/board-constants.ts` | `BOARD_DISPLAY_NAMES` 7종 | 표시명 소스 ① |
| DB `BoardConfig.displayName` | `getBoardConfig()` | 표시명 소스 ② — **상세 breadcrumb·뒤로가기가 이걸 사용** |
| `community/[boardSlug]/page.tsx` | `STATIC_BOARD_CONFIGS` (displayName·seoTitle·description) | 표시명 소스 ③ |
| `layouts/GNB.tsx` | `MENU_ITEMS` 7항목 | 메뉴 배열 ① |
| `layouts/IconMenu.tsx` | `MENU_ITEMS` 7항목 + 아이콘 + 색변수 3종 | 메뉴 배열 ② |
| `ad/ListBannerClient.tsx` | `AD_ROUTES` 7경로 | 메뉴 배열 ③ |
| `app/not-found.tsx` | 보드 3개 + 이모지 | 메뉴 배열 ④ — 갱년기톡·매거진·일자리 없음 |
| `search/SearchTabs.tsx` | 탭 라벨 | 메뉴 배열 ⑤ |
| `community/write/page.tsx`, `.../edit/page.tsx` | `WRITABLE_BOARD_TYPES` ×2 | 글쓰기 가능 보드 |
| `magazine/MagazineFilter.tsx` | `MAGAZINE_CATEGORIES` 9개 | 매거진 전용 |

### 5-B. 카테고리 배지 — 색은 1곳, **모양은 5가지**

색상 매핑은 `lib/category-chip.ts` 한 곳으로 통일돼 있습니다(양호). 문제는 **모양 클래스가 호출부마다 다르다**는 점:

| 사용처 | 클래스 |
|---|---|
| `PostCard` | `px-3 py-1 rounded-full text-caption font-bold tracking-wide` |
| `TrendingSection` | `rounded-full px-2 py-0.5 text-caption font-normal leading-[1.4]` |
| `Stories`/`Humor` | `inline-block rounded-full px-2 py-0.5 text-caption font-normal leading-[1.4] mb-1.5` |
| `MagazineSection` | `inline-flex rounded-md px-2 py-0.5 text-caption font-bold mb-2` ← **radius 다름** |
| `SearchResults` | `inline-flex rounded-full px-2.5 py-0.5 text-caption font-bold mb-2` |

→ 같은 "카테고리 배지"가 **radius 2종 · font-weight 2종 · padding 4종**으로 갈립니다.

### 5-C. 랭킹 숫자 — 2가지 규칙

| 위치 | 스타일 | 가+ |
|---|---|---|
| 홈 `TrendingSection` | `text-[22px] font-bold italic text-primary-text min-w-[32px]` | ❌ |
| 상세 `PostListBottom` | `text-caption font-bold text-muted-foreground min-w-[24px]` | ✅ |
| `/best` | **랭킹 숫자 없음** | — |

### 5-D. 광고 삽입 지점 전수

| 위치 | 규칙 | 영향 범위 |
|---|---|---|
| `common/PostListWithAds.tsx` | `index===3` → NativeAdSlot(list-feed) / `index===7` → CoupangHome1 | **베스트·커뮤니티4·매거진·일자리 8개 목록 전부** 🔴 |
| `common/BoardPaginationFooter.tsx` | `-mt-[11px]`로 광고를 페이지네이션에 인접 + `h-20` FAB 여백 | 동일 8개 |
| `(main)/page.tsx` | 홈 광고 **7개소**가 페이지 파일에 직접 배치 | 홈 |
| 상세 3종 | in-article 1 + bottom 1 (+커뮤니티·일자리는 Coupang 1) | 상세 |
| `search/page.tsx` | `search-feed` | 검색 |
| `ad/ListBannerClient.tsx` | `AD_ROUTES` 정확 매칭 | 목록 7개 |
| `components/ad/ad-slots.ts` | AdSense/AdMob/Coupang ID **중앙화** ✅ | — |

### 5-E. 색상 직접 지정

| 패턴 | 건수 | 비고 |
|---|---|---|
| `text-[#B23B2E]` | 10 | `--color-primary-text`(#E85D50)와 **다른 값**의 제2 브랜드색 |
| `#FF6F61` 리터럴 | 8+ | HeroSlider·VoteHeroSlide·TipTapEditor·ProgressBar·PullToRefresh·layout themeColor |
| `border-2 border-dashed border-border` 빈 상태 | **11곳 복붙** | `ui/EmptyState` 미사용 |

### 5-F. 모바일/데스크탑 분기

| 방식 | 사용 | 특징 |
|---|---|---|
| `ResponsiveAd`(matchMedia **마운트 분기**) | 2파일(홈) | hydration 전 `null` → 삽입 시 **CLS 유발 가능** |
| CSS `lg:hidden` / `hidden lg:` | 게시판 UI 9곳 | 홈 `block lg:hidden`(세로) ↔ `hidden lg:grid grid-cols-2`(2열)가 대표 |
| 컨테이너 폭 | 목록 `max-w-[960px]` / 상세 `max-w-[720px]` / 홈 `max-w-[1200px]` | 3종 |

---

## 6. 리스크 지도

| 등급 | 대상 | 이유 |
|---|---|---|
| 🔴 **절대 금지** | `lib/queries/posts/**`, `lib/queries/search.ts`, `app/sitemap.ts` | `EXCLUDE_EVENT`/`EXCLUDE_GREETING` 24곳. 한 줄 실수 = **참여 이벤트글 누수** |
| 🔴 **절대 금지** | `lib/event-category.ts`, `lib/greeting.ts` | 격리 가드 본체 |
| 🔴 **절대 금지** | `lib/sanitize.ts` (`sanitizeHtml`/`proxyR2Images`/`proxyMagazineImages`) | 본문 이미지 렌더. 과거 **무증상 실패** 사례(`.claude/rules/debug-silent-failure.md`) |
| 🔴 **단독 PR만** | `common/PostListWithAds.tsx` | 8개 화면 광고 동시 변동 = 수익·CLS |
| 🔴 **단독 PR만** | `components/ad/**` | AdMob 좌표 오버레이(`NativeAdSlot`이 화면 좌표 측정 → 앱 광고 위치가 레이아웃에 결합) |
| 🔴 **단독 PR만** | `globals.css` 폰트·색 토큰 | 가+ 3단계 × 전 서비스 |
| 🟠 **주의** | `community/CommentSection.tsx` | 4소비처 중 **2개가 참여 이벤트**(VOTE/FEEDBACK) → `.claude/rules/participation-events-qa.md` 10항목 필수 |
| 🟠 **주의** | `community/[boardSlug]/[postId]/page.tsx` | redirect(`EVENT_CATEGORY`)·robots(noindex)·JSON-LD·본문 sanitize가 **한 파일에 공존** |
| 🟠 **주의** | `home/HeroSlider.tsx`, `vote/VoteHeroSlide`, `event/SurveyHeroSlide` | HERO가 VOTE/FEEDBACK 배타 노출 담당. 디자인 변경 시 참여 이벤트 QA 대상 |
| 🟠 **주의** | `home/HomeCardLink.tsx` | GA4 홈 클릭 추적 스키마(`section`/`position`/`contentId`/`action`) — **props 불변 필수** |
| 🟠 **주의** | 매거진 상세 본문 래퍼(variant 40개+) | AI 생성 HTML 구조에 강결합 → 기존 발행글 수백 건 동시 변동. GSC 관찰 중 |
| 🟡 SEO | 상세 3종 JSON-LD, `community/[boardSlug]/page.tsx` FAQ(4보드 인라인 37줄), `magazine/page.tsx` CollectionPage | 레이아웃 수정 중 깨뜨리기 쉬운 위치에 공존 |

### 홈 이벤트/HERO/팝업 충돌 구조

```
HeroSlider (서버)
  └ buildVoteTeaserSlide()      resolveChannelVote('hero')
  └ buildFeedbackTeaserSlide()  getExposedFeedback('hero')
     → const teaser = voteSlide ?? feedbackSlide      ← VOTE 우선, 배타

(main)/page.tsx
  └ VotePopup / FeedbackPopup / SurveyPopup  (dynamic ssr:false, 하루 1회, 어드민 팝업 양보)
```

HERO와 팝업은 채널별로 **1개만** 노출되도록 서버가 결정합니다. 홈 상단 디자인을 바꾸면 이 3종 슬라이드 컴포넌트를 건드리게 되므로 참여 이벤트 QA 범위에 들어갑니다.

---

## 7. 리팩토링 Phase 제안

> 원칙: **아래(토큰·상수) → 위(카드·페이지)**. 각 Phase는 **단일 PR**, 앞 Phase 통과 후에만 다음으로.

### Phase 0 — AS-IS 문서화 ✅ (본 문서)

| 항목 | 내용 |
|---|---|
| 목적 | 정확한 현재 지도 확보 |
| 변경 파일 | 본 문서 1개 (코드 0) |
| 리스크 | 없음 |
| 되돌리기 | 불필요 |
| QA | 창업자 검토 |
| PASS | §8 결정 항목 회신 |

### Phase 1 — 진짜 버그/누락만 수정 (화면 변화 최소)

| 항목 | 내용 |
|---|---|
| **목적** | 기능적 결함만 제거. 디자인 손대지 않음 |
| **변경 파일** | `app/not-found.tsx`(보드 목록 갱신) / 미사용 컴포넌트 9개 삭제 / `MyActivity`·`ActivityPulse` 동반 dead query 정리 |
| **리스크** | 낮음 — 삭제 대상은 import 전수 조사로 0참조 확인됨 |
| **되돌리기** | 쉬움 (단일 PR revert, git 히스토리 보존) |
| **preview QA** | Vercel preview에서 홈·4보드·매거진·일자리·검색 200 + 콘솔 에러 0 |
| **PASS** | `tsc` 0 / `build` 0 / 7개 화면 200 / **스크린샷 diff 0**(삭제만 하므로 화면 무변화) |

### Phase 2 — 공용 UI 토큰·작은 컴포넌트 정리 (화면 변화 0 목표)

| 항목 | 내용 |
|---|---|
| **목적** | ① `text-[Npx]` → 토큰 클래스 치환(**댓글 영역 21곳 최우선**) ② `text-[#B23B2E]` 토큰화 ③ `ui/EmptyState` 실사용화(11곳) |
| **변경 파일** | `CommentItem.tsx`·`CommentSection.tsx`·홈 섹션 5개·`ui/EmptyState.tsx` + 빈 상태 11곳 |
| **리스크** | 🟠 **중** — `CommentSection`은 참여 이벤트 2종이 공유 |
| **되돌리기** | 쉬움 (시각 전용) |
| **preview QA** | 가+ **3단계 전부** 전환하며 댓글 영역 실측 / `--project=qa-participation-events` |
| **PASS** | 가+ NORMAL·LARGE·XLARGE에서 댓글 폰트가 **실제로 커짐**(computed style 측정) / 참여이벤트 QA 10항목 PASS / 375px overflow 0 |

### Phase 3 — 홈 리스트 · 베스트 랭킹 스타일 변경 (첫 시각 변경)

| 항목 | 내용 |
|---|---|
| **목적** | `SectionHeader`·`RankingNumber` 추출 후 홈 5섹션 적용. 베스트 랭킹 숫자 도입 여부 반영 |
| **변경 파일** | 신규 `SectionHeader`·`RankingNumber` / 홈 섹션 5개 / `BestContent` / `PostListBottom` |
| **리스크** | 🟡 홈만. 단 `HomeCardLink` props 불변 필수(GA4) |
| **되돌리기** | 쉬움 |
| **preview QA** | 홈 375·412·1440 스크린샷 / GA4 DebugView로 `section`·`position` 파라미터 동일 확인 |
| **PASS** | GA4 파라미터 변화 0 / 홈 LCP·CLS RUM 회귀 없음 / overflow 0 |

### Phase 4 — 게시판 목록 카드 통일

| 항목 | 내용 |
|---|---|
| **목적** | `BoardBadge` 추출(5변형 → 1) + `PostMeta` 추출. **`PostListWithAds`는 무접촉** |
| **변경 파일** | 신규 `BoardBadge`·`PostMeta` / `PostCard` / 홈 5섹션 / `SearchResults` / `MagazineCard` |
| **리스크** | 🔴 **높음** — `PostCard` 하나가 **5개 화면** 동시 변경 |
| **되돌리기** | 보통 (단일 PR revert 가능하나 영향 화면 다수) |
| **preview QA** | 5개 화면 × 3뷰포트 스크린샷 / `loading.tsx` 스켈레톤과 실제 카드 높이 일치 확인 |
| **PASS** | 광고 위치(4·8번째 뒤) 이전과 동일 / CLS RUM 무회귀 / 배지 색 6보드 전부 의도대로 |

### Phase 5 — 상세 페이지 디자인 개편

| 항목 | 내용 |
|---|---|
| **목적** | 상세 헤더·메타·뒤로가기·컨테이너 정리 + 댓글 영역 시각 개편 |
| **변경 파일** | 커뮤니티 상세 `page.tsx`(헤더 영역 한정) / `CommentSection` / `CommentItem` / `PostListBottom` |
| **절대 불변** | `EVENT_CATEGORY` redirect · robots noindex 분기 · `resolveCommunityCanonicalPath` 308 · `proxyR2Images(sanitizeHtml(...))` · 본문 `[&_img]:-mx-4` 풀블리드 · `force-static`/`revalidate=300` · DiscussionForum JSON-LD |
| **리스크** | 🔴 **최고** — 상세 전체 + 일자리 상세 + 이벤트 상세 2종 동시 |
| **되돌리기** | 어려움 (ISR 캐시 300s 고려) |
| **preview QA** | 참여이벤트 QA **10항목 전부** + 한글 20자↑ `pressSequentially` + 본문 이미지 `naturalWidth > 0` |
| **PASS** | 이벤트글 누수 0 / 가입인사 noindex 유지 / 본문 이미지 로드 / 댓글 입력 중 값 보존 |

### Phase 6 — 매거진 · 일자리 별도 정책 정리

| 항목 | 내용 |
|---|---|
| **목적** | `MagazineCard` 파일 승격 + 일자리 배지 토큰화. **매거진 본문 래퍼(variant 40개+)는 제외** |
| **변경 파일** | 신규 `MagazineCard.tsx` / `MagazineContent` / `JobCard` / `JobsContent` / `jobs/region/[sido]` |
| **리스크** | 🟠 매거진 상세 무접촉이면 낮음. 지역 URL 변경 시 SEO 손실 |
| **되돌리기** | 쉬움 |
| **preview QA** | 매거진 상세 HTML **바이트 diff 0**(무접촉 증명) / 지역 링크 href 변화 0 |
| **PASS** | seoTitle·canonical·JSON-LD 유지 / 시리즈 GSC 관찰 중이므로 **색인 재요청 금지** |

---

## 8. 창업자 결정 필요 항목

| # | 질문 | 선택지 | 제 추천 |
|---|---|---|---|
| **Q1** | 게시판 **표시명의 단일 진실**을 어디로? | (a) 코드 `board-visual.ts` (b) DB `BoardConfig` (c) 현행 3중 유지 | **(a) 코드** — 게시판 이름은 거의 안 바뀌고, 코드는 배포와 함께 검증됨 |
| **Q2** | **베스트에 랭킹 숫자**를 넣을까? | (a) 넣는다 1~12위 (b) 안 넣는다 | **(a)** — "베스트"인데 순위가 없는 게 어색. 홈 트렌딩과 톤 통일 |
| **Q3** | 카테고리 배지 **모양 기준**을 무엇으로 통일? | (a) `PostCard`형(크고 bold) (b) 홈형(작고 normal) (c) 새 디자인 | **(c)를 전제로 (a) 임시 통일** — 개편 방향이 정해지기 전엔 가장 많이 쓰이는 형태로 |
| **Q4** | **매거진 상세 본문 스타일**(variant 40개+)을 개편에 포함? | (a) 제외 (b) 포함 | **(a) 제외** — 기존 발행글 수백 건 동시 변동 + GSC 관찰 중. 리스크 최대 |
| **Q5** | **광고 배치**를 개편과 함께 조정? | (a) 완전 동결 (b) 함께 조정 | **(a) 동결** — 디자인 변수와 수익 변수를 섞으면 원인 분석 불가 |
| **Q6** | 미사용 컴포넌트 9개 **삭제**? | (a) 전부 삭제 (b) `HomeSidebar` 제외 삭제 | **(b)** — `HomeSidebar`는 PC 사이드바 광고 슬롯 포함. **PC 사이드바 광고 재개 계획이 있는지**만 알려주시면 됩니다 |
| **Q7** | 개편 **성공 판정 기준**? | (a) RUM p75 48h 4지표 무회귀 + 참여이벤트 QA 10항목 (b) 그 외 | **(a)** — 기존 `project_perf_rum_baseline` 원칙 승계 |
| **Q8** | 댓글 영역 가+ 대응을 **Phase 2로 앞당길까**? | (a) 앞당긴다 (b) Phase 5에서 함께 | **(a)** — 시니어 서비스에서 댓글이 안 커지는 건 접근성 결함에 가까움 |

---

## 9. 다음 액션 추천

### ① 바로 할 수 있는 XS 수정 (디자인 결정 불필요, 리스크 최소)

| 순위 | 작업 | 규모 | 근거 |
|---|---|---|---|
| 1 | **댓글 영역 `text-[17px]` → `text-caption`/`text-base` 치환** | 2파일 21곳 | 가+ 미반응 해소. 시니어 접근성 직결 |
| 2 | 미사용 컴포넌트 8개 삭제(`HomeSidebar` 보류) | 8파일 삭제 | import 전수 조사로 0참조 확정 |
| 3 | 홈 섹션 "더보기 →" `text-[17px]` → `text-caption` | 5파일 5곳 | 가+ 대응 |
| 4 | `app/not-found.tsx` 보드 목록에 갱년기톡·매거진·일자리 추가 | 1파일 | 누락 |
| 5 | `text-[#B23B2E]` → 토큰화 | 10곳 | 제2 브랜드색 정리 |

### ② 디자인 방향 결정이 먼저 필요한 것

- 배지 통일 기준 (Q3)
- 베스트 랭킹 숫자 도입 여부 (Q2)
- 홈 섹션 레이아웃(가로스크롤 유지 여부, 데스크탑 2열 유지 여부)
- 상세 페이지 3종의 "의도된 차이"를 유지할지 통일할지 (댓글 유무·ActionBar 유무·breadcrumb 유무)

### ③ 절대 나중으로 미뤄야 하는 것

| 항목 | 이유 |
|---|---|
| **매거진 상세 본문 래퍼** | 기존 발행글 수백 건 동시 변동 + GSC 색인 관찰 중 |
| **`PostListWithAds` 광고 인덱스** | 8개 화면 수익 동시 변동. 디자인과 절대 섞지 말 것 |
| **`lib/queries/**` 전체** | `EXCLUDE_EVENT` 24곳. 디자인 PR에서 한 줄도 건드리지 않는다 |
| **`globals.css` 토큰 값 변경** | 가+ 3단계 × 전 서비스. 단독 PR + 3단계 전부 재검증 |
| **상세 페이지 구조 개편(Phase 5)** | 참여 이벤트 2종이 `CommentSection`을 공유 |

---

## 부록 A. 이번 조사에서 확인된 "문서보다 코드가 나은" 지점

기존 문서/기억을 그대로 믿지 않고 재검증한 결과 **뒤집힌 판단**:

| 항목 | 흔한 오해 | 실제 |
|---|---|---|
| 폰트 토큰 | "arbitrary px가 141곳이라 가+가 전반적으로 안 먹는다" | Tailwind `text-xs~2xl`이 **전부 CSS 변수 매핑** → 대부분 반응함. 실제 문제는 **댓글 21곳 등 특정 지점** |
| 목록 카드 | "카드들이 토큰을 안 쓴다" | `PostCard`·`MagazineCard`·`JobCard` **arbitrary 0곳**, 이미 양호 |
| 상세 본문 | "본문 폰트가 제각각" | `.post-content`에 `!important`로 **강제 토큰 적용** 중 |
| 미사용 컴포넌트 | 단순 grep은 주석·문자열까지 잡아 오탐 | **import 전수 대조**로 9개 확정 |
| `CommunitySection`/`Life2Section` | 최근 커밋(`bbc581f9`)이 스타일을 고침 | **렌더되지 않는 파일** — 그 수정은 화면에 반영 안 됨 |

## 부록 B. 참고 규칙 문서

- `.claude/rules/participation-events-qa.md` — Phase 2·5 PASS 기준의 근거(필수 10항목)
- `.claude/rules/debug-silent-failure.md` — 본문 이미지/렌더 검증 방법
- `.claude/rules/ui-components.md` — 시니어 UI 규칙(52px, 본문 17/18px, primary 대비)
- `.claude/rules/session-isolation.md` — 멀티세션 커밋 휩쓸림 방지
- `docs/features/REGISTRY.md` — 각 Phase 완료 시 수정 이력 1줄
