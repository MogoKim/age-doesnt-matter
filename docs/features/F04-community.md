# 커뮤니티 게시판 (F04)

> 최초 작성: 2026-05-11 | 최근 수정: 2026-05-11

---

## 목표

50·60대 사용자가 일상, 유머, 인생 2막 등 주제로 글을 쓰고 소통하는 핵심 커뮤니티 공간.  
SEO 최적화를 통해 검색 유입을 확보하고, 시니어 친화 UI로 낮은 진입 장벽을 유지한다.

---

## 코드 위치

| 경로 | 역할 |
|------|------|
| `src/app/(main)/community/` | App Router 페이지 (목록 · 상세 · 작성) |
| `src/components/features/community/` | 커뮤니티 전용 컴포넌트 |

---

## SEO 구현 현황

| 항목 | 상태 |
|------|------|
| generateMetadata() | ✅ (og:title, twitter:card, canonical) |
| Article JSON-LD | ✅ (headline, image, datePublished, author, publisher) |
| BreadcrumbList JSON-LD | ✅ (buildBreadcrumbJsonLd 활용) |

---

## 수정 이력

| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-05-11 | Article JSON-LD에 `image` 필드 추가 + description 본문 추출 개선 | Google Article 리치 결과 필수 필드 누락 수정 |
| 2026-05-11 | `/api/bot/posts` 봇 게시글 생성 시 `generateCommunitySlug()` 자동 호출 추가 | slug=null 게시글이 sitemap 제외되어 Google 12,533개 URL 미색인 발생 |
| 2026-05-12 | 게시판 목록 타이틀 카드 제거 + sr-only h1으로 교체, BoardFilter mb-6 / SortToggle mb-4 제거 | 모바일 above-the-fold 헤더 영역 ~180px 절약 → 첫 화면 게시글 2개 노출 |
| 2026-05-12 | cursor 무한스크롤 → 12개 번호 페이지네이션 전환, PostListWithAds+BoardPaginationFooter 공통 컴포넌트 적용, 광고 idx=3(FeedAd)/idx=7(CoupangHome1) 통일 | 6개 게시판 UX·광고 패턴 통일로 유지보수 비용 감소 |
| 2026-05-12 | 카드 gap `flex flex-col gap-4`→`space-y-3`, 컨테이너 max-w-[1200px]→max-w-[960px], 스켈레톤 2열 그리드 제거 | 6개 게시판 레이아웃 통일 |
