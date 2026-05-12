---
id: F12
name: HOT/명예의 전당 승격 시스템
status: ACTIVE
created: 2026-05-12
updated: 2026-05-12
---

# F12 — HOT/명예의 전당 승격 시스템

## 개요
게시글의 `likeCount + commentCount`(hotScore)가 BoardConfig에 설정된 임계값을 초과하면
자동으로 `promotionLevel`을 NORMAL → HOT → HALL_OF_FAME으로 승격한다.

## 핵심 로직
- `hotScore = likeCount + commentCount`
- `score >= fameThreshold` → HALL_OF_FAME
- `score >= hotThreshold` → HOT
- 승격 시(강등 아님) 게시글 작성자에게 HOT_POST / HALL_OF_FAME 알림 생성

## 코드 위치
| 파일 | 역할 |
|------|------|
| `src/lib/actions/promotion.ts` | checkAndPromotePost() + retroactivePromotionUpdate() 공용 함수 |
| `src/lib/actions/likes.ts` | 좋아요 후 checkAndPromotePost() 호출 |
| `src/lib/actions/guest-likes.ts` | 비회원 좋아요 후 checkAndPromotePost() 호출 |
| `src/lib/actions/comments.ts` | 댓글 작성 후 checkAndPromotePost() 호출 |
| `src/lib/queries/boards.ts` | board-config 캐시 tags: ['board-config'] |
| `src/lib/actions/admin/admin.config.ts` | 임계값 변경 시 revalidateTag + retroactivePromotionUpdate() |
| `src/lib/actions/admin/admin.content.ts` | adminSetPostLikeCount() — 어드민 직접 좋아요 수 조정 |
| `src/components/admin/ContentTable.tsx` | LikeCountCell 인라인 편집 UI |

## DB 연관
- `Post.promotionLevel`: NORMAL / HOT / HALL_OF_FAME
- `BoardConfig.hotThreshold` / `fameThreshold`: 게시판별 임계값 (어드민 설정)
- `NotificationType`: HOT_POST, HALL_OF_FAME (2026-05-12 추가)

## 수정 이력
| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-05-12 | 신규 생성 — 6가지 구조적 결함 수정 (점수공식/댓글체크/소급처리/캐시/알림타입/어드민통제) | 승격 시스템 완전 재설계 |
