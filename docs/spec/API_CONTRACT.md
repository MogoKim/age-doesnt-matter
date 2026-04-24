# API 계약 (API_CONTRACT)

> **기준 문서**: AUTH_SPEC.md · DB_SCHEMA_FULL.md · PRD_Final_A~D · COMMON_UX_SPEC.md
> **작성일**: 2026-03-17
> **목적**: 프론트-백 간 API 통신 규약. 모든 API는 이 계약을 따른다.

---

## 1. 공통 규약

### 1.1 Base URL

```
개발: http://localhost:3000/api
운영: https://age-doesnt-matter.com/api
```

### 1.2 공통 응답 형식

모든 API 응답은 아래 구조를 따른다.

#### 성공 응답

```typescript
// 단일 리소스
{
  "ok": true,
  "data": { ... }
}

// 목록 (페이지네이션)
{
  "ok": true,
  "data": [ ... ],
  "meta": {
    "total": 156,
    "cursor": "clxxxxxxxxx",   // cursor 기반: 다음 페이지 커서
    "hasMore": true
  }
}
```

#### 에러 응답

```typescript
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "닉네임은 2~10자여야 합니다",
    "details": [                    // optional: 필드별 에러
      { "field": "nickname", "message": "2자 이상 입력해주세요" }
    ]
  }
}
```

### 1.3 에러 코드 체계

| HTTP | code | 설명 | errors.ts 클래스 |
|:---:|:---|:---|:---|
| 400 | `VALIDATION_ERROR` | 입력값 유효성 실패 | `ValidationError` |
| 401 | `UNAUTHORIZED` | 로그인 필요 | `UnauthorizedError` |
| 403 | `FORBIDDEN` | 권한 부족 | `ForbiddenError` |
| 404 | `NOT_FOUND` | 리소스 없음 | `NotFoundError` |
| 409 | `CONFLICT` | 중복 (닉네임 등) | `AppError` |
| 429 | `RATE_LIMIT` | 요청 제한 초과 | `RateLimitError` |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 | `AppError` |

### 1.4 인증

| 항목 | 값 |
|:---|:---|
| 방식 | NextAuth JWT (httpOnly 쿠키, 자동 전송) |
| 헤더 | 별도 Authorization 헤더 불필요 (쿠키 기반) |
| 미인증 시 | 401 `UNAUTHORIZED` |
| 권한 부족 시 | 403 `FORBIDDEN` |

### 1.5 페이지네이션

Cursor 기반 페이지네이션을 기본으로 사용:

```
GET /api/posts?cursor=clxxxx&limit=10
```

| 파라미터 | 타입 | 기본값 | 설명 |
|:---|:---|:---:|:---|
| `cursor` | string | — | 마지막 아이템의 ID (첫 페이지: 생략) |
| `limit` | number | 10 | 페이지당 아이템 수 (최대 50) |

응답:

```typescript
{
  "ok": true,
  "data": [...],
  "meta": {
    "total": 156,
    "cursor": "cl_last_item_id",  // 다음 요청에 전달할 커서
    "hasMore": true                // false면 마지막 페이지
  }
}
```

### 1.6 날짜/시간

| 규칙 | 값 |
|:---|:---|
| 저장 | UTC (DB) |
| API 응답 | ISO 8601 (`2026-03-17T09:30:00.000Z`) |
| 프론트 표시 | KST 변환 + 상대 시간 ("2시간 전", "3일 전") |

#### 상대 시간 표시 규칙

| 경과 시간 | 표시 |
|:---|:---|
| ~1분 | "방금 전" |
| ~59분 | "N분 전" |
| ~23시간 | "N시간 전" |
| ~6일 | "N일 전" |
| 7일~ | "YYYY.MM.DD" |

### 1.7 Rate Limiting

| 대상 | 제한 | 응답 헤더 |
|:---|:---|:---|
| 로그인 시도 | 5회/5분 | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| API 호출 (일반) | 60회/분/IP | 동일 |
| 글 작성 | 3회/분/유저 | 동일 |
| 댓글 작성 | 10회/분/유저 | 동일 |

초과 시: 429 + `Retry-After` 헤더 (초 단위)

---

## 2. API 엔드포인트 전체 목록

### 2.1 인증 (NextAuth 자동)

| Method | Path | 설명 | 인증 |
|:---|:---|:---|:---:|
| GET | `/api/auth/signin` | 로그인 페이지 | — |
| GET | `/api/auth/signout` | 로그아웃 | ✅ |
| GET | `/api/auth/session` | 현재 세션 조회 | — |
| POST | `/api/auth/callback/kakao` | 카카오 콜백 | — |

> NextAuth가 자동 처리. 직접 구현 불필요.

---

### 2.2 온보딩

#### `GET /api/nickname/check`

닉네임 중복 체크 (debounce 300ms 권장)

```
GET /api/nickname/check?q=행복한바리스타
```

| 파라미터 | 타입 | 필수 | 설명 |
|:---|:---|:---:|:---|
| `q` | string | ✅ | 체크할 닉네임 (2~10자) |

성공 응답:
```json
{ "ok": true, "data": { "available": true } }
```

실패 (중복):
```json
{ "ok": true, "data": { "available": false, "reason": "이미 사용 중인 닉네임이에요" } }
```

실패 (유효성):
```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "닉네임은 2~10자, 한글/영문/숫자만 가능해요" } }
```

#### `POST /api/onboarding`

온보딩 완료 (닉네임 설정 + 약관 동의)

```json
{
  "nickname": "행복한바리스타",
  "agreements": {
    "termsOfService": { "version": "2026-03-17-v1", "agreed": true },
    "privacyPolicy": { "version": "2026-03-17-v1", "agreed": true },
    "marketing": { "version": "2026-03-17-v1", "agreed": false }
  }
}
```

| 필드 | 타입 | 필수 | 유효성 |
|:---|:---|:---:|:---|
| `nickname` | string | ✅ | 2~10자, 한글/영문/숫자, 금지어 불포함, 미중복 |
| `agreements.termsOfService` | object | ✅ | `agreed: true` 필수 |
| `agreements.privacyPolicy` | object | ✅ | `agreed: true` 필수 |
| `agreements.marketing` | object | ❌ | 선택 |

성공: `{ "ok": true, "data": { "user": { ... } } }`

---

### 2.3 사용자

#### `GET /api/users/me`

내 프로필 조회 (🔒 로그인 필수)

```json
{
  "ok": true,
  "data": {
    "id": "clxxxx",
    "nickname": "행복한바리스타",
    "profileImage": "https://...",
    "grade": "SPROUT",
    "gradeEmoji": "🌱",
    "gradeLabel": "새싹",
    "role": "USER",
    "postCount": 3,
    "commentCount": 12,
    "receivedLikes": 5,
    "fontSize": "NORMAL",
    "marketingOptIn": false,
    "nicknameChangedAt": null,
    "createdAt": "2026-03-10T00:00:00.000Z"
  }
}
```

#### `PATCH /api/users/me`

프로필 수정 (🔒 로그인 필수)

```json
{
  "nickname": "새로운닉네임",
  "profileImage": "https://r2.../new-avatar.webp"
}
```

| 필드 | 타입 | 유효성 |
|:---|:---|:---|
| `nickname` | string? | 2~10자, 30일 1회 제한 |
| `profileImage` | string? | URL 또는 null (삭제) |

닉네임 변경 30일 제한 에러:
```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "닉네임은 30일에 한 번만 변경할 수 있어요", "details": [{ "field": "nickname", "nextChangeAt": "2026-04-16T00:00:00.000Z" }] } }
```

#### `PATCH /api/users/me/font-size`

글자 크기 변경 (🔒 로그인 필수)

```json
{ "fontSize": "LARGE" }
```

| 값 | 설명 |
|:---|:---|
| `NORMAL` | 기본 (17px) |
| `LARGE` | 크게 (19px) |
| `XLARGE` | 아주크게 (22px) |

#### `DELETE /api/users/me`

회원 탈퇴 (🔒 로그인 필수)

- 소프트 삭제: `status → WITHDRAWN`
- 30일 유예 후 하드 삭제 (배치)

성공: `{ "ok": true, "data": { "message": "탈퇴가 완료되었어요. 30일 이내 재로그인 시 복구할 수 있어요" } }`

---

### 2.4 게시글

#### `GET /api/posts`

게시글 목록 조회

```
GET /api/posts?board=STORIES&category=일상&cursor=clxxxx&limit=10
```

| 파라미터 | 타입 | 필수 | 설명 |
|:---|:---|:---:|:---|
| `board` | enum | ✅ | `STORIES` \| `HUMOR` \| `MAGAZINE` \| `JOBS` |
| `category` | string | — | 카테고리 필터 |
| `cursor` | string | — | 페이지네이션 커서 |
| `limit` | number | — | 기본 10, 최대 50 |

응답:
```json
{
  "ok": true,
  "data": [
    {
      "id": "clxxxx",
      "boardType": "STORIES",
      "category": "일상",
      "title": "오늘 시장에서 생긴 일",
      "preview": "김치를 담그려고 시장에 갔는데...",
      "thumbnailUrl": null,
      "author": {
        "id": "clxxxx",
        "nickname": "영희맘",
        "grade": "SPROUT",
        "gradeEmoji": "🌱",
        "profileImage": null
      },
      "likeCount": 5,
      "commentCount": 12,
      "viewCount": 89,
      "promotionLevel": "NORMAL",
      "createdAt": "2026-03-17T07:00:00.000Z"
    }
  ],
  "meta": { "total": 156, "cursor": "clxxxx", "hasMore": true }
}
```

#### `GET /api/posts/:id`

게시글 상세 조회 (조회수 +1)

```json
{
  "ok": true,
  "data": {
    "id": "clxxxx",
    "boardType": "STORIES",
    "category": "일상",
    "title": "오늘 시장에서 생긴 일",
    "content": "<p>김치를 담그려고...</p>",
    "imageUrls": ["https://..."],
    "youtubeUrl": null,
    "author": {
      "id": "clxxxx",
      "nickname": "영희맘",
      "grade": "SPROUT",
      "gradeEmoji": "🌱",
      "profileImage": null
    },
    "likeCount": 5,
    "commentCount": 12,
    "viewCount": 90,
    "promotionLevel": "NORMAL",
    "isLiked": false,
    "isScrapped": false,
    "createdAt": "2026-03-17T07:00:00.000Z",
    "updatedAt": "2026-03-17T07:00:00.000Z"
  }
}
```

> `isLiked`, `isScrapped`: 로그인 시에만 포함. 비로그인 시 항상 `false`.

#### `POST /api/posts`

게시글 작성 (🔒 🌱새싹 이상)

```json
{
  "boardType": "STORIES",
  "category": "일상",
  "title": "오늘 시장에서 생긴 일",
  "content": "<p>김치를 담그려고 시장에 갔는데...</p>",
  "imageUrls": [],
  "youtubeUrl": null
}
```

| 필드 | 타입 | 필수 | 유효성 |
|:---|:---|:---:|:---|
| `boardType` | enum | ✅ | `STORIES` \| `HUMOR` |
| `category` | string | ✅ | 게시판별 허용 카테고리 |
| `title` | string | ✅ | 2~40자 |
| `content` | string | ✅ | 10자 이상 (HTML), DOMPurify 적용 |
| `imageUrls` | string[] | — | 최대 5장, 🌿단골 이상 |
| `youtubeUrl` | string | — | 유튜브 URL, 🌿단골 이상 |

성공: `201` + `{ "ok": true, "data": { "id": "clxxxx", ... } }`

등급 부족 (이미지/유튜브):
```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "이미지 첨부는 🌿단골 등급부터 가능해요" } }
```

#### `PATCH /api/posts/:id`

게시글 수정 (🔒 본인만)

- body: `POST /api/posts`와 동일 (수정할 필드만)
- 성공: `{ "ok": true, "data": { ... } }`

#### `DELETE /api/posts/:id`

게시글 삭제 (🔒 본인 또는 ADMIN)

- 소프트 삭제: `status → DELETED`
- 성공: `{ "ok": true, "data": { "message": "글이 삭제되었어요" } }`

---

### 2.5 일자리 (Jobs)

#### `GET /api/jobs`

일자리 목록 (필터 지원)

```
GET /api/jobs?region=서울&district=강남구&salaryType=MONTHLY&salaryMin=2000000&tags=나이무관,초보환영&cursor=clxxxx&limit=10
```

| 파라미터 | 타입 | 설명 |
|:---|:---|:---|
| `region` | string | 지역 (시/도) |
| `district` | string | 구/군 |
| `salaryType` | enum | `HOURLY` \| `DAILY` \| `MONTHLY` |
| `salaryMin` | number | 최소 급여 |
| `workTime` | enum | `MORNING` \| `AFTERNOON` \| `FULLTIME` |
| `tags` | string | 쉼표 구분 태그 |

응답: 게시글 목록과 동일 구조 + `jobDetail` 필드:

```json
{
  "id": "clxxxx",
  "title": "간호조무사",
  "jobDetail": {
    "company": "○○병원",
    "region": "인천",
    "district": "남동구",
    "address": "○○동 123",
    "salaryType": "HOURLY",
    "salaryAmount": 12000,
    "workTime": "오전 9시~12시",
    "workDays": "주5일",
    "contactPhone": "032-XXX-XXXX",
    "contactEmail": null,
    "tags": ["나이무관", "오전만", "초보환영"],
    "deadline": null,
    "isOpen": true
  },
  "likeCount": 12,
  "commentCount": 3,
  "viewCount": 45,
  "createdAt": "2026-03-17T00:00:00.000Z"
}
```

> 일자리 등록/수정/삭제: 어드민 API에서만 가능 (2.9 참조)

---

### 2.6 댓글

#### `GET /api/posts/:postId/comments`

댓글 목록 조회

```
GET /api/posts/clxxxx/comments?sort=latest&cursor=clxxxx&limit=20
```

| 파라미터 | 타입 | 설명 |
|:---|:---|:---|
| `sort` | enum | `latest` (기본) \| `likes` |

응답:
```json
{
  "ok": true,
  "data": [
    {
      "id": "clxxxx",
      "content": "좋은 글이네요~",
      "author": {
        "id": "clxxxx",
        "nickname": "순자맘",
        "grade": "REGULAR",
        "gradeEmoji": "🌿",
        "profileImage": null
      },
      "likeCount": 3,
      "isLiked": false,
      "isDeleted": false,
      "createdAt": "2026-03-17T08:00:00.000Z",
      "replies": [
        {
          "id": "clxxxx",
          "content": "감사합니다 ^^",
          "author": { ... },
          "likeCount": 1,
          "isLiked": false,
          "isDeleted": false,
          "createdAt": "2026-03-17T08:30:00.000Z"
        }
      ]
    }
  ],
  "meta": { "total": 12, "cursor": "clxxxx", "hasMore": false }
}
```

> 삭제된 댓글: `isDeleted: true`, `content: "삭제된 댓글입니다"`, `author: null`
> 대댓글(replies)은 부모 댓글에 중첩 (1단계만)

#### `POST /api/posts/:postId/comments`

댓글 작성 (🔒 🌱새싹 이상)

```json
{
  "content": "좋은 글이네요~",
  "parentId": null
}
```

| 필드 | 타입 | 필수 | 유효성 |
|:---|:---|:---:|:---|
| `content` | string | ✅ | 1~500자 |
| `parentId` | string | — | 대댓글 시 부모 댓글 ID (1단계만) |

#### `PATCH /api/posts/:postId/comments/:id`

댓글 수정 (🔒 본인, 10분 이내)

```json
{ "content": "수정된 내용" }
```

10분 초과:
```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "댓글은 작성 후 10분 이내에만 수정할 수 있어요" } }
```

#### `DELETE /api/posts/:postId/comments/:id`

댓글 삭제 (🔒 본인 또는 ADMIN)

- 대댓글 없으면: 실제 삭제
- 대댓글 있으면: `isDeleted: true` → "삭제된 댓글입니다" 표시

---

### 2.7 좋아요 / 스크랩 / 신고

#### `POST /api/likes`

좋아요 토글 (🔒 🌱새싹 이상)

```json
{
  "postId": "clxxxx",
  "commentId": null
}
```

> `postId` 또는 `commentId` 중 하나만 전달. 이미 좋아요 상태면 취소.

응답:
```json
{ "ok": true, "data": { "liked": true, "likeCount": 6 } }
```

#### `POST /api/scraps`

스크랩 토글 (🔒 🌱새싹 이상)

```json
{ "postId": "clxxxx" }
```

응답:
```json
{ "ok": true, "data": { "scrapped": true } }
```

#### `GET /api/scraps`

내 스크랩 목록 (🔒 로그인 필수)

```
GET /api/scraps?cursor=clxxxx&limit=10
```

응답: 게시글 목록과 동일 구조

#### `POST /api/reports`

신고 (🔒 🌱새싹 이상)

```json
{
  "postId": "clxxxx",
  "commentId": null,
  "reason": "SPAM",
  "detail": "광고 글입니다"
}
```

| 필드 | 타입 | 필수 | 유효성 |
|:---|:---|:---:|:---|
| `postId` | string | — | 게시글 신고 |
| `commentId` | string | — | 댓글 신고 |
| `reason` | enum | ✅ | `SPAM` \| `ABUSE` \| `ADULT` \| `PRIVACY` \| `OTHER` |
| `detail` | string | — | 상세 사유 (최대 200자) |

> 같은 대상 중복 신고 불가 (409 `CONFLICT`)
> 신고 3회 누적 → 자동 숨김 (`status → HIDDEN`)

---

### 2.8 검색

#### `GET /api/search`

통합 검색

```
GET /api/search?q=간호조무사&type=all&sort=relevance&cursor=clxxxx&limit=10
```

| 파라미터 | 타입 | 설명 |
|:---|:---|:---|
| `q` | string | 검색어 (2자 이상) |
| `type` | enum | `all` \| `jobs` \| `posts` \| `magazine` |
| `sort` | enum | `relevance` (기본) \| `latest` |

응답:
```json
{
  "ok": true,
  "data": {
    "jobs": { "items": [...], "total": 5 },
    "posts": { "items": [...], "total": 15 },
    "magazine": { "items": [...], "total": 2 }
  },
  "meta": { "total": 22, "query": "간호조무사" }
}
```

> `type=all`일 때는 각 카테고리별 상위 3건 + total 반환
> `type=jobs` 등 특정 타입일 때는 cursor 기반 페이지네이션

---

### 2.9 알림

#### `GET /api/notifications`

알림 목록 (🔒 로그인 필수)

```
GET /api/notifications?cursor=clxxxx&limit=20
```

응답:
```json
{
  "ok": true,
  "data": [
    {
      "id": "clxxxx",
      "type": "COMMENT",
      "message": "영희맘님의 글에 순자맘님이 댓글을 남겼어요",
      "linkUrl": "/community/stories/clxxxx",
      "isRead": false,
      "createdAt": "2026-03-17T08:00:00.000Z"
    }
  ],
  "meta": { "total": 8, "unreadCount": 3, "cursor": "clxxxx", "hasMore": false }
}
```

#### `PATCH /api/notifications/:id/read`

알림 읽음 처리 (🔒 로그인 필수)

```json
{ "ok": true, "data": { "isRead": true } }
```

#### `PATCH /api/notifications/read-all`

전체 읽음 처리 (🔒 로그인 필수)

```json
{ "ok": true, "data": { "updatedCount": 3 } }
```

---

### 2.10 이미지 업로드

#### `POST /api/upload`

이미지 업로드 (🔒 🌿단골 이상)

- Content-Type: `multipart/form-data`
- 필드: `file` (단일 파일)

| 제한 | 값 |
|:---|:---|
| 허용 포맷 | jpg, png, gif, webp |
| 최대 크기 | 5MB |
| 변환 | 서버에서 WebP 자동 변환 + 리사이즈 (max 1200px) |
| 저장소 | Cloudflare R2 |

응답:
```json
{ "ok": true, "data": { "url": "https://r2.../images/clxxxx.webp" } }
```

---

### 2.11 어드민 API

> 모든 어드민 API는 `role: ADMIN` 인증 필수

#### 회원 관리

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/api/admin/users` | 회원 목록 (검색/필터/페이지네이션) |
| GET | `/api/admin/users/:id` | 회원 상세 |
| PATCH | `/api/admin/users/:id/grade` | 등급 변경 (☀️ 따뜻한이웃 수동 부여) |
| PATCH | `/api/admin/users/:id/status` | 상태 변경 (정지/차단/해제) |

```
GET /api/admin/users?q=영희&grade=SPROUT&status=ACTIVE&cursor=clxxxx&limit=20
```

등급 변경:
```json
{ "grade": "WARM_NEIGHBOR" }
```

상태 변경:
```json
{ "status": "SUSPENDED", "suspendedUntil": "2026-04-17T00:00:00.000Z", "reason": "커뮤니티 규칙 위반" }
```

#### 콘텐츠 관리

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/api/admin/posts` | 게시글 목록 (신고 포함) |
| PATCH | `/api/admin/posts/:id/status` | 게시글 상태 변경 (숨김/삭제) |
| DELETE | `/api/admin/comments/:id` | 댓글 강제 삭제 |
| GET | `/api/admin/reports` | 신고 목록 |
| PATCH | `/api/admin/reports/:id` | 신고 처리 (RESOLVED/DISMISSED) |

게시글 상태 변경:
```json
{ "status": "HIDDEN", "reason": "신고 3회 누적" }
```

신고 처리:
```json
{ "status": "RESOLVED", "action": "HIDE_CONTENT" }
```

#### 일자리 관리

| Method | Path | 설명 |
|:---|:---|:---|
| POST | `/api/admin/jobs` | 일자리 등록 |
| PATCH | `/api/admin/jobs/:id` | 일자리 수정 |
| DELETE | `/api/admin/jobs/:id` | 일자리 삭제 |

일자리 등록:
```json
{
  "title": "간호조무사",
  "content": "<p>상세 내용...</p>",
  "category": "의료",
  "jobDetail": {
    "company": "○○병원",
    "region": "인천",
    "district": "남동구",
    "address": "○○동 123",
    "salaryType": "HOURLY",
    "salaryAmount": 12000,
    "workTime": "오전 9시~12시",
    "workDays": "주5일",
    "contactPhone": "032-XXX-XXXX",
    "tags": ["나이무관", "오전만", "초보환영"],
    "deadline": null
  }
}
```

#### 매거진 관리

| Method | Path | 설명 |
|:---|:---|:---|
| POST | `/api/admin/magazine` | 매거진 발행 |
| PATCH | `/api/admin/magazine/:id` | 매거진 수정 |
| DELETE | `/api/admin/magazine/:id` | 매거진 삭제 |

#### 배너/광고 관리

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/api/admin/banners` | 배너 목록 |
| POST | `/api/admin/banners` | 배너 등록 |
| PATCH | `/api/admin/banners/:id` | 배너 수정 |
| DELETE | `/api/admin/banners/:id` | 배너 삭제 |
| GET | `/api/admin/ads` | 광고 배너 목록 |
| POST | `/api/admin/ads` | 광고 배너 등록 |
| PATCH | `/api/admin/ads/:id` | 광고 배너 수정 |
| DELETE | `/api/admin/ads/:id` | 광고 배너 삭제 |

#### 설정 관리

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/api/admin/board-config` | 게시판 설정 조회 |
| PATCH | `/api/admin/board-config/:boardType` | 게시판 설정 변경 |
| GET | `/api/admin/banned-words` | 금지어 목록 |
| POST | `/api/admin/banned-words` | 금지어 등록 |
| DELETE | `/api/admin/banned-words/:id` | 금지어 삭제 |

#### 어드민 계정

| Method | Path | 설명 |
|:---|:---|:---|
| POST | `/api/admin/accounts` | 어드민 계정 생성 |
| POST | `/api/admin/auth/login` | 어드민 로그인 (이메일+비밀번호) |

#### 로그 / 통계

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/api/admin/audit-logs` | 감사 로그 조회 |
| GET | `/api/admin/bot-logs` | 봇 활동 로그 |
| GET | `/api/admin/stats/overview` | 대시보드 통계 |

---

### 2.12 홈 피드

#### `GET /api/feed/home`

홈 화면 데이터 (집계)

```json
{
  "ok": true,
  "data": {
    "banners": [
      { "id": "clxxxx", "imageUrl": "https://...", "linkUrl": "/jobs", "title": "당신의 두번째 전성기" }
    ],
    "recommendedJobs": [
      { "id": "clxxxx", "title": "도서관 사서 보조", "region": "강남구", "salary": "월200만", "tags": ["나이무관", "오전만"] }
    ],
    "hotPosts": [
      { "id": "clxxxx", "title": "퇴직 후 처음 카페...", "likeCount": 34, "commentCount": 12 }
    ],
    "editorsPick": [
      { "id": "clxxxx", "title": "남편이 퇴직하고...", "thumbnailUrl": "https://...", "likeCount": 45, "commentCount": 23 }
    ],
    "latestMagazine": [
      { "id": "clxxxx", "title": "기초연금 달라지는 5가지", "thumbnailUrl": "https://...", "category": "연금·복지" }
    ],
    "latestPosts": [
      { "id": "clxxxx", "boardType": "STORIES", "title": "오늘 시장에서...", "createdAt": "2026-03-17T07:00:00.000Z" }
    ]
  }
}
```

#### `GET /api/feed/best`

베스트 페이지 데이터

```
GET /api/feed/best?tab=hot&sort=latest&cursor=clxxxx&limit=10
```

| 파라미터 | 타입 | 설명 |
|:---|:---|:---|
| `tab` | enum | `hot` (뜨는글, 공감 10+) \| `fame` (명예의전당, 공감 50+) |
| `sort` | enum | `latest` (기본) \| `likes` |

---

## 3. TypeScript 타입 정의

### 3.1 공통 응답 타입

```typescript
// API 응답 래퍼
interface ApiResponse<T> {
  ok: true
  data: T
  meta?: PaginationMeta
}

interface ApiError {
  ok: false
  error: {
    code: string
    message: string
    details?: Array<{ field: string; message: string; [key: string]: unknown }>
  }
}

type ApiResult<T> = ApiResponse<T> | ApiError

// 페이지네이션
interface PaginationMeta {
  total: number
  cursor: string | null
  hasMore: boolean
}
```

### 3.2 리소스 타입

```typescript
// 사용자 (목록용)
interface UserSummary {
  id: string
  nickname: string
  grade: Grade
  gradeEmoji: string
  profileImage: string | null
}

// 게시글 (목록용)
interface PostSummary {
  id: string
  boardType: BoardType
  category: string
  title: string
  preview: string
  thumbnailUrl: string | null
  author: UserSummary
  likeCount: number
  commentCount: number
  viewCount: number
  promotionLevel: PromotionLevel
  createdAt: string
}

// 게시글 (상세)
interface PostDetail extends PostSummary {
  content: string
  imageUrls: string[]
  youtubeUrl: string | null
  isLiked: boolean
  isScrapped: boolean
  updatedAt: string
  jobDetail?: JobDetail
}

// 댓글
interface CommentItem {
  id: string
  content: string
  author: UserSummary | null
  likeCount: number
  isLiked: boolean
  isDeleted: boolean
  createdAt: string
  replies: CommentItem[]
}

// 알림
interface NotificationItem {
  id: string
  type: NotificationType
  message: string
  linkUrl: string
  isRead: boolean
  createdAt: string
}
```

---

## 4. API 핸들러 패턴 (구현 가이드)

### 4.1 라우트 핸들러 기본 구조

```typescript
// src/app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ValidationError, UnauthorizedError } from '@/lib/errors'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    const { searchParams } = req.nextUrl

    const board = searchParams.get('board')
    const cursor = searchParams.get('cursor')
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 50)

    const posts = await prisma.post.findMany({
      where: { boardType: board, status: 'PUBLISHED' },
      take: limit + 1,  // hasMore 판단용 +1
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, nickname: true, grade: true, profileImage: true } } },
    })

    const hasMore = posts.length > limit
    const data = hasMore ? posts.slice(0, limit) : posts

    return NextResponse.json({
      ok: true,
      data,
      meta: {
        total: await prisma.post.count({ where: { boardType: board, status: 'PUBLISHED' } }),
        cursor: data.length > 0 ? data[data.length - 1].id : null,
        hasMore,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
```

### 4.2 에러 핸들러

```typescript
// src/lib/api-utils.ts
import { NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.statusCode },
    )
  }

  console.error('Unhandled error:', error)
  return NextResponse.json(
    { ok: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했어요' } },
    { status: 500 },
  )
}
```

### 4.3 인증 가드

```typescript
// src/lib/api-utils.ts
import { auth } from '@/lib/auth'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()
  return session.user
}

export async function requireAdmin() {
  const user = await requireAuth()
  if (user.role !== 'ADMIN') throw new ForbiddenError()
  return user
}

export async function requireGrade(minGrade: Grade) {
  const user = await requireAuth()
  const gradeOrder = { SPROUT: 1, REGULAR: 2, VETERAN: 3, WARM_NEIGHBOR: 4 }
  if (gradeOrder[user.grade] < gradeOrder[minGrade]) {
    throw new ForbiddenError(`${minGrade} 등급 이상만 가능해요`)
  }
  return user
}
```

---

## 5. 카테고리 정의

### 5.1 게시판별 카테고리

| 게시판 | 카테고리 |
|:---|:---|
| STORIES (사는 이야기) | 일상, 건강, 고민, 자녀, 기타 |
| HUMOR (활력 충전소) | 유머, 힐링, 자랑, 추천 |
| MAGAZINE (매거진) | 연금·복지, 건강, 생활, 일자리팁 |
| JOBS (내 일 찾기) | (카테고리 없음, 태그로 분류) |

> 카테고리는 `BoardConfig` 테이블에서 어드민이 추가/삭제 가능

---

## 6. 구현 체크리스트

- [ ] `src/lib/api-utils.ts` — 공통 응답 래퍼, 에러 핸들러, 인증 가드
- [ ] `src/types/api.ts` — API 타입 정의 (ApiResponse, ApiError 등)
- [ ] 온보딩 API (`/api/onboarding`, `/api/nickname/check`)
- [ ] 사용자 API (`/api/users/me`)
- [ ] 게시글 CRUD API (`/api/posts`)
- [ ] 일자리 조회 API (`/api/jobs`)
- [ ] 댓글 CRUD API (`/api/posts/:postId/comments`)
- [ ] 좋아요/스크랩/신고 API
- [ ] 검색 API (`/api/search`)
- [ ] 알림 API (`/api/notifications`)
- [ ] 이미지 업로드 API (`/api/upload`)
- [ ] 홈 피드 API (`/api/feed/home`, `/api/feed/best`)
- [ ] 어드민 API 전체
