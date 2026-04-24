# 01. 커뮤니티 (게시판/글/댓글/공감/스크랩/신고)

## 개요
50·60대 사용자 대상 커뮤니티 기능으로, 게시판별 글 작성·조회·수정·삭제, 댓글(대댓글), 공감, 스크랩, 공유, 신고를 제공한다.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/community` | 커뮤니티 인덱스 — `/community/stories`로 리다이렉트 | 불필요 |
| `/community/[boardSlug]` | 게시판 목록 (카테고리 필터·정렬·무한스크롤) | 불필요 |
| `/community/[boardSlug]/[postId]` | 게시글 상세 (본문·액션바·댓글) | 불필요 (공감·스크랩은 필요) |
| `/community/[boardSlug]/[postId]/edit` | 게시글 수정 (작성자 본인만) | 필요 |
| `/community/write` | 글쓰기 (임시저장 포함) | 필요 |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/posts` | 게시판별 게시글 목록 조회 (boardType, cursor, category, limit) | 불필요 |
| GET | `/api/posts/[postId]` | 게시글 단건 상세 조회 | 선택적 (좋아요·스크랩 여부 반영) |
| GET | `/api/comments` | 게시글 댓글 목록 조회 (postId, sort) | 선택적 |

> Server Action 기반 쓰기 작업은 별도 route 없이 `lib/actions/` 하위에서 처리됨 (아래 비즈니스 로직 참고)

---

## 데이터 모델 (주요 필드)

### Post
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `boardType` | BoardType | `JOB / STORY / HUMOR / MAGAZINE / WEEKLY` |
| `category` | String? | 게시판별 하위 카테고리 |
| `title` | String | 제목 |
| `content` | String | 본문 (HTML) |
| `authorId` | String | 작성자 FK |
| `source` | PostSource | `USER` / (외부 스크랩 등) |
| `status` | PostStatus | `PUBLISHED` / (DELETED 등) |
| `promotionLevel` | PromotionLevel | `NORMAL` 이상 시 상단 노출 |
| `isPinned` | Boolean | 고정 글 여부 |
| `viewCount / likeCount / commentCount / scrapCount / reportCount` | Int | 비정규화 카운터 |
| `trendingScore` | Float | 트렌딩 점수 |
| `sourceUrl / sourceSite` | String? | 외부 출처 (unique) |

### Comment
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `postId` | String | 소속 게시글 FK (Cascade 삭제) |
| `authorId` | String | 작성자 FK |
| `content` | String | 본문 |
| `parentId` | String? | 부모 댓글 FK (null = 최상위 댓글) |
| `status` | CommentStatus | `ACTIVE` / (DELETED 등) |
| `likeCount / reportCount` | Int | 비정규화 카운터 |
| `isFiltered` | Boolean | 필터링 여부 |

### Like
- `userId + postId` 또는 `userId + commentId` 복합 unique → 중복 공감 방지
- 게시글 / 댓글 공감 단일 테이블로 관리

### Scrap
- `userId + postId` 복합 unique → 중복 스크랩 방지

### Report
| 필드 | 타입 | 설명 |
|------|------|------|
| `postId / commentId` | String? | 신고 대상 (둘 중 하나) |
| `reason` | ReportReason | 신고 사유 enum |
| `description` | String? | 부가 설명 |
| `status` | ReportStatus | `PENDING` → 처리 후 변경 |
| `action` | ReportAction? | 관리자 조치 결과 |
| `processedBy / processedAt` | | 관리자 처리 정보 |

---

## 핵심 비즈니스 로직

### 게시판 접근
- 글쓰기 가능 게시판은 `STORY`, `HUMOR` 두 종류로 제한 (`WRITABLE_BOARD_TYPES`)
- `JOB`, `MAGAZINE`, `WEEKLY`는 읽기 전용 (외부 스크랩·관리자 등록 추정)

### 게시글 목록 조회
- 정렬: `latest`(기본, 최신순) / `likes`(공감순) — `SortToggle` 컴포넌트
- 카테고리 필터: 게시판에 카테고리가 2개 이상일 때만 `BoardFilter` 렌더링
- 페이지네이션: cursor 기반 (`lastId`), 1회 기본 20건, 최대 50건 (`LoadMoreButton`)
- Rate Limit: `/api/posts`, `/api/comments` 각각 60 req/window

### 게시글 상세
- `getPostDetail(postId, userId)` — 로그인 사용자의 `isLiked`, `isScrapped` 상태 포함
- 조회 시 `viewCount` 증가 (쿼리 레이어에서 처리 추정)
- 본문 HTML은 `sanitizeHtml()`로 XSS 방어 후 `dangerouslySetInnerHTML` 렌더링

### 게시글 수정/삭제
- 수정: 작성자 본인(`authorId === session.user.id`) + 상태 `PUBLISHED` 인 글만 허용
  - 본인이 아닌 경우 상세 페이지로 리다이렉트
- 삭제: `PostDeleteButton` 컴포넌트에서 Server Action 호출 (confirm 다이얼로그)

### 공감 (Like)
- 게시글·댓글 공감 모두 토글 방식 (`togglePostLike`, `toggleCommentLike`)
- 낙관적 업데이트(Optimistic UI) 적용 — 오류 시 롤백
- 비로그인 시 `LoginPromptModal` 표시 (게시글 공감)
- 댓글 공감은 로그인 여부 별도 체크 없음 (서버 액션에서 처리 추정)
- GTM 이벤트 전송 (`gtmLike`)

### 스크랩
- 토글 방식, 낙관적 업데이트 적용
- 비로그인 시 `LoginPromptModal` 표시
- 성공/실패 토스트 메시지 출력

### 공유
- 카카오톡 공유 (`shareToKakao`) / 링크 복사 (`copyShareLink`) 2가지 방식
- 드롭다운 메뉴 토글 UI, 바깥 클릭 시 닫힘
- GTM 이벤트 전송 (`gtmShare`)

### 댓글
- 최상위 댓글 + 1단계 대댓글(`parentId`) 구조 (2단계 이상 중첩 없음)
- 정렬: 등록순(기본) / 공감순 — 클라이언트 사이드 정렬 (`useMemo`)
- 총 댓글 수: 최상위 댓글 + replies 합산 표시
- 삭제된 댓글: `isDeleted` 플래그 → "삭제된 댓글입니다." 텍스트 표시, replies는 유지 렌더링
- 수정: `canEdit` 플래그가 `true`인 경우에만 수정 버튼 노출
- 본인 댓글: `isOwn` 플래그로 수정/삭제 버튼 노출 제어

### 신고
- 게시글·댓글 모두 `ReportModal` 컴포넌트로 통합 처리
- `targetType: 'post' | 'comment'` 구분
- 신고 사유 선택 + 부가 설명 입력 (`reason`, `description`)
- 처리 상태(`PENDING` → 완료)는 관리자(`AdminAccount`)가 처리

### 임시저장 (Draft)
- 글쓰기 페이지에서 `getMyDrafts()` Server Action으로 서버 임시저장 목록 로드
- `PostWriteForm`에 `serverDrafts` prop으로 전달

---

## UI 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `BoardFilter` | `community/` | 카테고리 탭 필터 (URL searchParam 연동) |
| `SortToggle` | `community/` | 최신순/공감순 정렬 전환 (URL searchParam 연동) |
| `PostCard` | `community/` | 게시판 목록의 게시글 카드 |
| `LoadMoreButton` | `community/` | cursor 기반 추가 로드 버튼 |
| `ActionBar` | `community/` | 게시글 상세 하단 공감·스크랩·공유·신고 버튼바 |
| `PostWriteForm` | `community/` | 게시글 작성/수정 폼 (게시판 선택, 카테고리, 제목, 본문, 임시저장) |
| `PostDeleteButton` | `community/` | 게시글 삭제 버튼 (confirm → Server Action) |