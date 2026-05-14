---
id: F07
name: 베스트 탭 (인기글/명예의 전당)
status: ACTIVE
created: 2026-05-12
updated: 2026-05-14
---

# F07 — 베스트 탭

## 개요
HOT/HALL_OF_FAME 승격 게시글을 탭별로 모아보는 베스트 페이지.
오늘의 인기(24h) / 이번주 인기(7일, 최대 60개) / 명예의 전당(HALL_OF_FAME) 3탭 구성.

## 코드 위치
| 파일 | 역할 |
|------|------|
| `src/app/(main)/best/page.tsx` | RSC 메인 페이지 — 탭별 데이터 로드 + 페이지네이션 |
| `src/lib/queries/posts/posts.trending.ts` | getDailyTrendingPosts / getWeeklyTrendingPosts / getHallOfFamePosts |
| `src/app/api/best/route.ts` | 클라이언트용 API (getHotPosts + getHallOfFamePosts) |
| `src/components/features/best/PaginationBar.tsx` | 페이지 번호 네비게이션 컴포넌트 |
| `src/components/features/community/CategorySearchBar.tsx` | 검색창 (page 파라미터 초기화 로직 포함) |

## 기능 명세
- 탭: daily(24h trendingScore) / weekly(7일 trendingScore, max 60개) / fame(HALL_OF_FAME)
- 페이지네이션: 12개/페이지, URL 기반 (`?page=N`), RSC 렌더링
- 검색: 탭 전환 시 q/sf 파라미터 유지, 검색 시 page 1 리셋
- 광고: idx=4 FeedAd, idx=9 CoupangBanner (12개 중 2회)
- 명예의 전당 빈 상태: 게이미피케이션 UI + HOT 게시글 링크
- 캐시: page=1 + q 없음 → unstable_cache(60s), 이외 직접 DB 쿼리

## 수정 이력
| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-05-12 | 신규 생성 — 페이지 번호 페이지네이션 도입, 광고 빈도 완화(3→5개당), 검색창 위치 이동(탭 아래), 탭 전환 검색어 유실 버그 수정, 명예의 전당 빈 상태 게이미피케이션 | UX 개선 및 콘텐츠 볼륨 대응 |
| 2026-05-12 | 섹션 h2(이모지+탭명+총N개) 제거, nav·section에 max-w-[960px] 추가 | 6개 게시판 레이아웃 통일 |
| 2026-05-14 | 3탭→2탭 개편: "뜨는 이야기" 🔥 + "명예의 전당" 👑 / DB hotPromotedAt 필드 추가(영구 누적) / getAccumulatedHotPosts 신규 / fameThreshold 50→30 / BestPostCard hotPromotedAt 타임스탬프 / 시드봇 6개 경로 보정 / API route 정합성 수정 | 인기글이 된 정확한 시각 기반 영구 누적 구조 — 강등돼도 뜨는이야기 탭에 영구 잔류 |
| 2026-05-14 | BestPostCard 제거 → PostCard 공유 (showBoardBadge=true) / "🔥 N시간 전 인기글 됐어요" 텍스트 제거 / 이모지 아이콘→SVG outline / 1행 메타→2행 메타 | 베스트·커뮤니티 카드 UI 통일 |
| 2026-05-14 | PostCard에 fromParam="best" 전달 추가 — 베스트에서 진입한 게시글 상세 뒤로가기 → /best | 진입경로 맥락화 내비게이션 |
