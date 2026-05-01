# F11 — 비회원 댓글 + 비회원 좋아요

## 기본 정보
| 항목 | 내용 |
|------|------|
| ID | F11 |
| 상태 | ACTIVE |
| 생성일 | 2026-05-01 |
| 최근변경 | 2026-05-01 |

## Customer-Mission Anchor
- **고객**: P1 (박미숙, 57세)이 겪는 "로그인 장벽 때문에 참여를 포기" 문제에서 출발 (constitution.yaml — P1 pain: 가입 허들)
- **욕망**: 1위 욕망 "느슨하지만 진짜인 연결"을 충족 — 로그인 없이도 댓글·공감으로 커뮤니티에 참여
- **미션 연결**: 이 기능 없이는 비로그인 방문자가 "구경만 하는 사람"에 머물러 진짜 연결을 체감하지 못한다

## 기능 개요
비로그인 방문자도 닉네임+비밀번호(비회원 댓글)와 IP+쿠키(비회원 좋아요)로 커뮤니티에 참여 가능.
Cloudflare Turnstile(invisible)로 봇 차단, 기존 회원 기능 무영향.

## 구현 파일
| 파일 | 역할 |
|------|------|
| `src/lib/turnstile.ts` | Cloudflare Turnstile 서버 검증 유틸 |
| `src/lib/actions/guest-likes.ts` | 비회원 좋아요 토글 (IP+쿠키 중복 체크) |
| `src/lib/actions/guest-comments.ts` | 비회원 댓글 CRUD (bcrypt 비밀번호) |
| `src/components/features/community/GuestCommentInput.tsx` | 닉네임+비밀번호+Turnstile 입력 폼 |
| `src/components/features/community/GuestPasswordModal.tsx` | 수정·삭제 비밀번호 확인 모달 |
| `prisma/migrations/20260501000000_guest_comment_like/` | DB migration |

## DB 변경
- `Comment.authorId`: `String` → `String?` (onDelete: SetNull)
- `Comment`: guestNickname, guestPasswordHash, guestPasswordAttempts, guestLockedUntil 컬럼 추가
- `GuestLike`: 신규 테이블 (postId/commentId + ipHash + cookieId 복합 유니크)
- `Report.userId`: `String` → `String?` (비회원 신고 허용)

## 수정된 기존 파일
| 파일 | 변경 내용 |
|------|---------|
| `src/lib/actions/likes.ts` | toggleCommentLike: authorId null guard 추가 |
| `src/lib/actions/reports.ts` | authorId null guard + 비회원 알림 skip |
| `src/lib/queries/comments.ts` | guestNickname/isGuest 반환, null guard |
| `src/lib/queries/posts/posts.community.ts` | activity feed 비회원 댓글 skip |
| `src/types/api.ts` | CommentItem에 guestNickname?, isGuest? 추가 |
| `src/components/features/community/CommentSection.tsx` | 비로그인 → GuestCommentInput |
| `src/components/features/community/CommentItem.tsx` | 비회원 뱃지 + 비밀번호 수정/삭제 |
| `src/components/features/community/ActionBar.tsx` | 비로그인 공감 → toggleGuestPostLike |
| `src/components/admin/ReportTable.tsx` | reporter nullable 처리 |
| `src/app/api/posts/[postId]/view/route.ts` | [id]→[postId] 슬러그 통일 |

## 수정 이력
| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-05-01 | 최초 구현 | 비로그인 참여 진입장벽 제거 |
| 2026-05-01 | Turnstile 봇 오탐 수정 — auto-execute + 6초 폴링, error_codes 서버 로깅 | 시크릿 모드(캐시 없음)에서 스크립트 로드 지연 시 'dev' 폴백 토큰 전송 → 봇 판단 오탐 |
