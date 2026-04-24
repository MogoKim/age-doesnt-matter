# 알림 시스템 스펙 (NOTIFICATION_SPEC)

## 1. 알림 트리거

| 이벤트 | 트리거 시점 | 수신자 | 아이콘 |
|--------|------------|--------|--------|
| `COMMENT` | 내 글에 댓글 달림 | 글 작성자 | 💬 |
| `LIKE` | 내 글/댓글에 공감 | 작성자 | ❤️ |
| `GRADE_UP` | 등급 승급 | 해당 유저 | 🎉 |
| `SYSTEM` | 에이전트/운영 알림 | 어드민 또는 특정 유저 | 📢 |
| `CONTENT_HIDDEN` | 내 글/댓글 숨김 처리 | 작성자 | ⚠️ |

## 2. DB 모델 (`Notification`)

```
model Notification {
  id         String           @id @default(cuid())
  userId     String           // 수신자
  type       NotificationType // COMMENT | LIKE | GRADE_UP | SYSTEM | CONTENT_HIDDEN
  content    String           // 알림 메시지 본문
  postId     String?          // 관련 게시글 (클릭 시 이동)
  fromUserId String?          // 발신자 (시스템 알림은 null)
  isRead     Boolean          @default(false)
  createdAt  DateTime         @default(now())
}
```

## 3. API 엔드포인트

| API | 메서드 | 설명 |
|-----|--------|------|
| `/api/notifications` | GET | 알림 목록 조회 (최근 50개) |
| `/api/notifications/unread-count` | GET | 미읽음 카운트 |
| Server Action: `markNotificationRead` | — | 개별 읽음 처리 |
| Server Action: `markAllNotificationsRead` | — | 전체 읽음 처리 |

## 4. UI 구현

### GNB 알림 배지
- `NotificationBadge` 컴포넌트 (상단 네비게이션)
- 미읽음 > 0이면 빨간 도트 표시
- 클릭 → `/my/notifications` 이동

### 알림 목록 페이지 (`/my/notifications`)
- 각 알림: 아이콘 + 메시지 + 시간 + 미읽음 도트
- 미읽음: `bg-primary` 원형 도트 (w-2.5 h-2.5)
- "모두 읽음" 버튼: `MarkAllReadButton` (미읽음 존재 시)
- 빈 상태: "아직 알림이 없어요"
- 클릭 시: 관련 게시글로 이동 + 자동 읽음

### 알림 생성 위치 (서버)
- `src/lib/actions/posts.ts` — 댓글/공감 시 알림 생성
- `agents/core/notifier.ts` — 에이전트 시스템 알림

## 5. 운영 알림 채널
- **텔레그램 봇**: critical/important 등급 알림
- **DB Notification**: 어드민 대시보드 알림
- 카카오 알림톡: 사용하지 않음 (비용/유연성 이유)
