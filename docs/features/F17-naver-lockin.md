# F17 — 네이버 유입자 락인 (글 상세 3종)

## 개요
네이버 오가닉으로 글 한 편 보러 온 비회원을 **한 편 더 읽고 → 가입**하게 락인. 글 상세에 3가지를 추가/교체한다.
- **① 정체성 배너** (신규) — 제목 밑. "여기가 어떤 곳"인지 안내. 비회원만, 세션당 1회 닫기.
- **② 같은 고민 글** (신규) — 본문 직후. 같은 게시판+같은 주제 관련글 3개(흐름 안 끊음).
- **③ 하단 "다른 글" 교체** — 최신순 잡담 → 같은 고민 글(관련글).

타겟: 40·50·60대 **여성**(남성 이탈 감수). 정체성 배너는 전 게시판 공통 문구.

## 충족욕망 / 타겟페르소나
- 충족욕망: `RELATION` (또래 공감·소속)
- 타겟페르소나: `ALL` (여성 중심)

## 코드 위치
- `src/components/features/community/IdentityBanner.tsx` — 정체성 배너(클라이언트, 비회원만)
- `src/components/features/community/InlineRelatedPosts.tsx` — 본문 끝 "같은 고민 글"(서버)
- `src/components/features/community/TrackedPostLink.tsx` — 관련글 클릭 추적 래퍼(클라이언트)
- `src/components/features/community/PostListBottom.tsx` — `mode='related'` + `relatedPosts` prop 추가
- `src/lib/queries/posts/posts.community.ts` — `getRelatedCommunityPosts()` 신규 쿼리
- `src/app/(main)/community/[boardSlug]/[postId]/page.tsx` — 관련글 1회 조회 → 본문끝(0~2)·하단(3~14) 분배 + 배너 삽입
- `src/app/(main)/magazine/[id]/page.tsx` — 정체성 배너만 삽입(`boardSlug="magazine"`). 관련글은 매거진 자체 `getRelatedMagazinePosts` 유지
- `src/app/api/events/route.ts` — `CONVERSION_EVENTS`에 측정 이벤트 2개 면제

## 관련글 매칭 로직 (getRelatedCommunityPosts)
- 같은 `boardType` + 같은 `category` 우선 → 부족하면 같은 게시판 최신순 fallback(이미 뽑은 글·본문글 `notIn` 제외).
- `category`가 빈값('')/null이면 매칭 생략, 곧장 최신순.
- 캐시: `unstable_cache(['related-community-posts'], { revalidate:300, tags:['community-board-page'] })`.
  - ⚠️ keyParts는 **고유** `['related-community-posts']` — `getCachedBoardPage`(동일 keyParts 사용 금지)와 충돌 방지. tags만 공유해 글 발행 시 자동 무효화.

## 표시 조건 (정체성 배너)
| 상태 | 표시 |
|------|------|
| 비로그인 | 배너 표시 (✕·닫기 없음 — 안내 배너, 클릭 이동 없음) |
| 로그인 | 숨김 |
| 세션 확정 전(`status==='loading'`) | null (SSG HTML 미포함 → 회원 깜빡임 0) |

문구: 메인 "우리 또래 여성들의 이야기 공간" / 서브 "40·50·60대 여성들의 진짜 이야기". 로고는 실제 `logo.png` 심볼(겹친 원)만 crop(텍스트 영역 overflow 가림).

## 이벤트 로그 (DB 스키마 변경 0 — eventName 문자열만 추가)
| 이벤트 | 시점 | properties |
|--------|------|-----------|
| `identity_banner_view` | 배너 노출 1회 | `{ boardSlug }` |
| `related_post_click` | 관련글 클릭 | `{ position: 'inline'\|'bottom', postId, boardSlug }` |

(배너는 안내용 — 클릭/닫기 없음. `identity_banner_click`/`_dismiss`는 미사용)

- `identity_banner_view`·`related_post_click`은 `/api/events` rate-limit 면제(비회원 글뷰마다 발생 → 429 유실 방지).
- 봇은 `isBot=true` 마킹 저장 → 집계 시 `isBot=false` 필터 필수.

## 구현 메모 (버그 제로 가드)
- 비회원 판단: `useSession` `authKnown`/`isLoggedIn` (PostCTA 패턴). `if(!visible) return null`.
- 노출 1회: `viewedRef = useRef(false)`.
- CLS 완충: 상단 배너라 hydration 후 본문 밀림 → `transition-opacity` fade-in.
- 관련글 자기글 제외: `excludeId = post.id`(slug 접근해도 CUID), `id:{not}`/`notIn`.
- PostListBottom `relatedPosts` prop은 optional → 기존 latest/trending 경로 보존.

## 측정/효과 (후속 1~2주)
- 세션당 PV 1.6 → 2.5 목표 / 가입률 1% → 3% / `related_post_click`·`identity_banner_view` 발생량.
- 선행 실측(2026-06-12): STORY(사는이야기) category 채움률 98% → 관련글 매칭 품질 확보 확인.

## 수정 이력
| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-06-12 | 신규 생성 — 정체성 배너 + 같은 고민 글(본문끝·하단) + 측정 이벤트 4종 | 네이버 오가닉 유입자 락인(바운스 85%·가입 1% 개선) |
| 2026-06-12 | QA 후속 — ①배너 클릭 이탈 제거(Link→div) ②관련글 정렬 인기순(trendingScore)으로 — 시드글 상위노출 방지 ③배너 재디자인(실제 로고 심볼+한 줄, ✕·서브2줄 제거, 문구 확정) | 실기기 QA 디자인 피드백 + 매칭 품질 |
| 2026-06-12 | 배너 폰트 확대(text-body/caption 변수) — '가+' 글씨크기 조정 반응 + 18px화 / 매거진 글상세에도 배너 적용(boardSlug=magazine) | 실기기 피드백(폰트 작음·가+ 미반응) + 매거진 네이버 유입자 락인 |
