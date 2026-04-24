# 검색 UI 스펙 (SEARCH_UI_SPEC)

## 1. 경로 및 구조
- URL: `/search?q={query}&tab={tab}`
- 서버 컴포넌트 (force-dynamic)
- 3개 하위 컴포넌트: `SearchForm`, `SearchTabs`, `SearchResults`

## 2. 검색 초기 화면 (쿼리 없음)

### SearchForm
- 검색 입력 필드: `min-h-[52px]`, 돋보기 아이콘
- placeholder: "일자리, 커뮤니티, 매거진 검색"
- 검색 제출 → URL 파라미터 `?q=` 변경

### 인기 검색어
- `getPopularKeywords()` — 최근 7일 검색 이벤트 집계
- 칩 형태로 최대 10개 표시
- 클릭 시 해당 키워드로 즉시 검색

## 3. 검색 결과 화면

### SearchTabs — 탭 네비게이션
| 탭 | 값 | 검색 대상 |
|----|-----|----------|
| 전체 | `all` | 모든 유형 |
| 일자리 | `jobs` | JOB 게시판 |
| 커뮤니티 | `posts` | STORY + HUMOR 게시판 |
| 매거진 | `magazine` | MAGAZINE 게시판 |

- 활성 탭: primary 밑줄 + bold
- 탭 전환 시 URL 파라미터 `?tab=` 변경 (서버 재렌더링)

### SearchResults — 결과 표시
- 탭별 결과 카운트 표시
- 결과 없음: "검색 결과가 없어요"
- 게시글 결과: PostCard 재사용 (제목 + 요약 + 작성자 + 시간)
- 일자리 결과: JobCard 재사용 (회사명 + 직종 + 지역)

## 4. 검색 로직 (`searchAll`)
- Prisma `contains` 모드 (insensitive)
- 검색 대상 필드:
  - 게시글: `title`, `content` (HTML 제거 후)
  - 일자리: `title`, `company`, `location`, `jobType`
  - 매거진: `title`, `content`
- 최대 20개/탭
- 검색어 최소 2자

## 5. 이벤트 로깅
- 검색 실행 시 `logSearchEvent(query, userId)` 호출
- EventLog 테이블에 `search` 이벤트 기록
- CMO 에이전트가 주간 트렌드 분석에 활용

## 6. 시니어 UX
- 검색 필드: 큰 입력창 (52px 높이)
- 인기 검색어 칩: min-h-[40px], 충분한 터치 영역
- 탭 버튼: min-h-[48px]
- 결과 카드: 시니어 가독성 확보 (text-base + line-height 1.6)
