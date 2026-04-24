# 06. 마이페이지 (프로필/활동/알림/댓글/스크랩)

## 개요
로그인한 사용자가 자신의 프로필·활동 통계·작성글·댓글·스크랩·알림을 조회하고, 닉네임·글자 크기·정보공개·차단·탈퇴 등 계정 설정을 관리하는 영역.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/my` | 마이페이지 홈 — 프로필 카드(등급·활동 통계) + 메뉴 네비게이션 | ✅ |
| `/my/posts` | 내가 쓴 글 목록 | ✅ |
| `/my/comments` | 내 댓글 목록 (원문 게시글 링크 포함) | ✅ |
| `/my/scraps` | 스크랩한 글 목록 | ✅ |
| `/my/notifications` | 알림 목록 + 전체 읽음 처리 | ✅ |
| `/my/settings` | 설정 (닉네임·글자크기·정보공개·차단관리·회원탈퇴) | ✅ |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/api/notifications` | 알림 목록 조회 + 미읽음 수 반환 (Rate limit: 30회) | ✅ (미인증 시 401) |
| `GET` | `/api/notifications/unread-count` | 미읽음 알림 카운트만 반환 (Rate limit: 30회) | ✅ (미인증 시 count: 0 반환) |

> **주:** `getMyProfile`, `getMyPosts`, `getMyComments`, `getMyScraps`, `getMyNotifications`, `getMySettings`, `getUnreadNotificationCount` 등 조회 함수는 서버 컴포넌트 내에서 직접 호출하며 별도 REST 엔드포인트 없음.

---

## 데이터 모델 (주요 필드)

### User (마이페이지 표시 관련 필드)
```
id, nickname, profileImage, grade, role, status
postCount, commentCount, receivedLikes   ← 비정규화 통계 (마이페이지 홈 통계 카드)
fontSize                                 ← 글자 크기 설정
isGenderPublic, isRegionPublic           ← 정보 공개 설정
nicknameChangedAt                        ← 닉네임 변경 이력 (재변경 제한 판단)
suspendedUntil, withdrawnAt, status      ← 계정 상태
blocksInitiated → UserBlock[]            ← 차단한 사용자 목록
```

### Post (내가 쓴 글 / 스크랩 목록)
```
id, boardType, title, content, summary, thumbnailUrl
likeCount, commentCount, viewCount, scrapCount
status, publishedAt, createdAt
authorId → User
```

### Comment (내 댓글 목록)
```
id, postId, content, createdAt, status
postId → Post (postTitle, postBoardType 참조)
authorId → User
```

### Scrap (스크랩)
```
id, userId, postId, createdAt
userId + postId  ← 복합 UNIQUE (중복 스크랩 방지)
post → Post
```

### Notification (알림)
```
id, userId, type, content, postId, fromUserId, isRead, createdAt
type: COMMENT | LIKE | GRADE_UP | SYSTEM | CONTENT_HIDDEN
post → Post (onDelete: SetNull — 게시글 삭제 시 알림 유지, postId만 null)
```

---

## 핵심 비즈니스 로직

### 인증 / 접근 제어
- 모든 마이페이지 경로: `auth()` 세션 없으면 `/login` 으로 redirect
- `getMyProfile()` 반환값이 null이면 `/login` redirect (계정 비정상 상태 대응)
- `/api/notifications/unread-count`: 미인증 시 에러 대신 `{ count: 0 }` 반환 (비로그인 UX 배려)

### 등급(Grade) 표시 로직
- `GRADE_INFO` 맵에서 `grade` 키로 emoji·label 조회
- 등급별 다음 달성 조건 문구 정적 렌더링:
  - `SPROUT` → 단골 조건: 게시글 5개 또는 댓글 20개
  - `REGULAR` → 터줏대감 조건: 게시글 20개 + 받은 공감 100개
  - `VETERAN` → 따뜻한이웃은 운영진 선정 안내
  - `WARM_NEIGHBOR` → 최고 등급 달성 메시지

### 알림 타입별 아이콘 매핑
```
COMMENT       → 💬
LIKE          → ❤️
GRADE_UP      → 🎉
SYSTEM        → 📢
CONTENT_HIDDEN → ⚠️
그 외          → 🔔 (fallback)
```

### 알림 읽음 처리
- 알림 목록 내 미읽음 알림이 하나라도 있으면 **"전체 읽음"** 버튼 노출
- 개별 알림 클릭 시 읽음 처리 (`NotificationLink` 컴포넌트가 담당)

### 댓글 목록 → 원문 게시글 링크
- `comment.postBoardType` → `BOARD_TYPE_TO_SLUG` 맵으로 URL slug 변환
- 매핑 실패 시 fallback: `'stories'`
- 클릭 시 `/community/{boardSlug}/{postId}` 로 이동

### 스크랩 / 게시글 목록 → boardSlug 변환
- `BOARD_TYPE_TO_SLUG[post.boardType]` 실패 시 fallback: `'stories'`

### Rate Limiting (API)
- `/api/notifications`: `'notifications'` 키, 최대 30회
- `/api/notifications/unread-count`: `'unread'` 키, 최대 30회

### 닉네임 변경 제한
- `settings.canChangeNickname` (boolean) + `settings.nicknameChangedAt` 전달 → `NicknameSettings` 컴포넌트에서 UI 레벨 제한 처리

---

## UI 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `MyPage` (page.tsx) | `/my` | 프로필 카드(등급 emoji·통계 3종) + 메뉴 리스트 렌더링 |
| `MenuItem` | `/my/page.tsx` 내부 | 메뉴 항목 링크 단위 컴포넌트 (emoji + label + 화살표) |
| `SignOutButton` | `features/my/SignOutButton` | 로그아웃 버튼 (클라이언트 컴포넌트) |
| `PostCard` | `features/community/PostCard` | 내가 쓴 글·스크랩 목록에서 게시글 카드 렌더링 |
| `MarkAllReadButton` | `features/my/MarkAllReadButton` | 알림 전체 읽음 처리 (클라이언트 컴포넌트, 미읽음 있을 때만 노출) |
| `NotificationLink` | `features/my/NotificationLink` | 알림 클릭 시 읽음 처리 후 링크 이동 (클라이언트 컴포넌트) |
| `NicknameSettings` | `features/my/NicknameSettings` | 닉네임 변경 폼 (변경 가능 여부·마지막 변경일 수신) |
| `FontSizeSettings` | `features/my/FontSizeSettings` | 글자 크기 선택 (SMALL/NORMAL/LARGE 등) |
| `PrivacySettings` | `features/my/PrivacySettings` | 성별·지역 공개 여부 토글 |
| `BlockedUserList` | `features/my/BlockedUserList` | 차단한 사용자 목록·차단 해제 |
| `WithdrawSection` | `features/my/WithdrawSection` | 회원 탈퇴 UI |
| `MyLoading` | `/my/loading.tsx` | 마이페이지 홈 Skeleton 로딩 UI |

---

## 미완성/TODO 항목

| 구분 | 내용 |
|------|------|
| **페이지네이션 미구현** | `getMyNotifications()` 반환값에 `hasMore` 필드가 존재하지만, `/api/notifications` 응답으로만 노출되고 알림 페이지(`/my/notifications/page.tsx`) UI에는 더보기/무한스크롤 없이 단순 목록만 렌더링됨 |
| **페이지네이션 미구현** | 내가 쓴 글(`/my/posts`), 내 댓글(`/my/comments`), 스크랩(`/my/scraps`) 모두 페이지네이션·무한스크롤 없이 전체 목록 일괄 로드 |
| **로딩 UI 불완전** | `MyLoading`(Skeleton)은 `/my` 홈에만 존재하며, `/my/posts`, `/my/comments`, `/my/scraps`, `/my/notifications`, `/my/settings` 하위 경로에는 별도 `loading.tsx` 없음 |
| **`BlockedUserList` 내부 미확인** | 컴포넌트가 참조되나 소스 파일 미제공 — 차단 해제 API 엔드포인트 및 차단 목록 조회 로직 확인 불가 |
| **`WithdrawSection` 내부 미확인** | 탈퇴 처리 API 엔드포인트 및 확인 플로우 코드 미제공 |
| **`