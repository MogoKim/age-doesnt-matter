# 글쓰기 에디터 UI 스펙 (EDITOR_UI_SPEC)

## 1. 개요
- TipTap 기반 WYSIWYG 에디터
- 컴포넌트: `PostWriteForm` + `TipTapEditor`
- 경로: `/community/[boardSlug]/write` (신규) / `/community/[boardSlug]/[postId]/edit` (수정)
- CSR (`'use client'`) — TipTap은 SSR 불가

## 2. 에디터 구성

### 2-1. PostWriteForm (폼 전체)

#### 게시판 선택
- 사는이야기 / 활력충전소 토글 버튼
- 선택 시 카테고리 목록 갱신

#### 카테고리 선택
- 게시판별 카테고리 칩 (Pill 형태)
- 선택 시 primary 색상 하이라이트
- "전체" 카테고리는 필터에서 제외

#### 제목 입력
- `min-h-[52px]`, `text-lg font-bold`
- 2~40자 제한, 실시간 글자수 표시
- 미충족 시 `text-destructive` 경고

#### 본문 에디터 (TipTapEditor)
- 최소 높이 250px
- 10자 이상 필수 (HTML 태그 제외 순수 텍스트 기준)
- placeholder: "내용을 입력해 주세요 (10자 이상)"

### 2-2. TipTap 에디터 기능

| 기능 | 버튼 | 등급 제한 |
|------|------|----------|
| 텍스트 입력 | — | 없음 (새싹부터) |
| **굵게** (B) | B 버튼 | 없음 |
| *기울임* (I) | I 버튼 | 없음 |
| 구분선 | — 버튼 | 없음 |
| 📷 사진 첨부 | 사진 버튼 | 단골(REGULAR) 이상 |
| 🎬 유튜브 삽입 | 동영상 버튼 | 단골(REGULAR) 이상 |

#### 이미지 첨부 규칙
- 최대 5장
- 파일 크기: 5MB/장
- 지원 포맷: JPEG, PNG, GIF, WebP
- 프리뷰: 80×80px 썸네일 + 삭제(✕) 버튼
- 업로드: Cloudflare R2 → `/api/uploads`

#### 유튜브 삽입
- URL 입력 팝업 → 유효성 검증 → 16:9 iframe 삽입
- 지원 패턴: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`

#### 등급 제한 안내
- 단골 미만 등급이 사진/동영상 시도 시:
  - 상단 amber 배너 3초 표시
  - "🌿 단골 등급부터 가능해요 — 글 5개 쓰거나 댓글 20개 달면 단골이 돼요"

## 3. 임시저장

### 자동 임시저장 (localStorage)
- 30초마다 + 페이지 이탈 시 자동 저장
- 키: `unae_post_draft`
- 수정 모드에서는 비활성

### 서버 임시저장 (DB)
- "임시저장" 버튼 → `/api/drafts` API
- 불러오기: 글쓰기 진입 시 서버 임시저장 목록 표시
- 삭제: 개별 삭제 가능
- 발행 시 임시저장 자동 삭제

## 4. 미리보기
- 모바일: 하단 풀스크린 시트 (바텀 시트)
- 데스크탑: 중앙 모달 (max-w-[720px])
- 실제 게시글과 동일한 렌더링

## 5. 등록/수정 플로우
1. 이미지 있으면 → `/api/uploads`로 업로드 → URL 수신
2. `createPost` / `updatePost` Server Action 호출
3. 성공 시 → 임시저장 삭제 → 해당 게시판으로 redirect
4. 실패 시 → 에러 메시지 표시 (폼 유지)

## 6. 시니어 UX
- 모든 버튼: min-h-[52px] (모바일), min-h-[44px] (데스크탑)
- 게시판/카테고리 선택: 큰 터치 타겟 + primary 하이라이트
- 에디터 폰트: `text-base` (18px) + `leading-[1.85]`
- word-break: keep-all (한글 단어 단위 줄바꿈)
