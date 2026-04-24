# 마이페이지 UI 스펙 (MY_UI_SPEC)

## 1. 페이지 구조

### `/my` — 마이페이지 허브
- **인증 필수** — 미로그인 시 `/login`으로 redirect
- 프로필 카드 + 메뉴 리스트 구조

#### 프로필 카드
| 요소 | 설명 |
|------|------|
| 등급 아이콘 | 64×64px 원형, `bg-primary/10` 배경에 등급 이모지 |
| 닉네임 | `text-xl font-bold`, 1줄 truncate |
| 등급 라벨 | `text-sm text-muted-foreground`, 이모지 + 한글 등급명 |
| 활동 통계 | 3컬럼 그리드 — 작성글 / 댓글 / 받은 공감 카운트 |

#### 메뉴 리스트
| 메뉴 | 경로 | 아이콘 |
|------|------|--------|
| 내가 쓴 글 | `/my/posts` | 📝 |
| 내 댓글 | `/my/comments` | 💬 |
| 스크랩 | `/my/scraps` | 📌 |
| 알림 | `/my/notifications` | 🔔 |
| 설정 | `/my/settings` | ⚙️ |
| 로그아웃 | — | Client-side SignOut |

- 각 메뉴 아이템 높이: `min-h-[56px]` (52px 터치 타겟 충족)
- `→` 화살표로 이동 가능함을 시각적 표시

---

### `/my/posts` — 내가 쓴 글
- 내 게시글 목록 (PostCard 재사용)
- 빈 상태: "아직 작성한 글이 없어요"

### `/my/comments` — 내 댓글
- 원글 제목 + 내 댓글 내용 표시
- 빈 상태: "아직 작성한 댓글이 없어요"

### `/my/scraps` — 스크랩
- 스크랩한 게시글 목록 (PostCard 재사용)
- 빈 상태: "스크랩한 글이 없어요"

---

### `/my/notifications` — 알림
- 알림 타입별 아이콘: 💬댓글 / ❤️공감 / 🎉등급업 / 📢시스템 / ⚠️숨김
- 미읽음: 왼쪽 primary 도트(2.5px)
- "모두 읽음" 버튼 (미읽음 존재 시만 표시)
- 클릭 시 해당 콘텐츠로 이동 + 자동 읽음 처리

---

### `/my/settings` — 설정
5개 섹션 (각 `bg-card rounded-2xl p-6 border`)

| 섹션 | 컴포넌트 | 설명 |
|------|----------|------|
| 닉네임 변경 | `NicknameSettings` | 30일 1회 제한, 중복 검사 |
| 글자 크기 | `FontSizeSettings` | 작게/보통/크게 토글 |
| 정보 공개 | `PrivacySettings` | 성별/지역 공개 여부 토글 |
| 차단 관리 | `BlockedUserList` | 차단 유저 목록 + 해제 |
| 회원 탈퇴 | `WithdrawSection` | 2단계 확인 후 탈퇴 |

---

## 2. 시니어 UX 준수 사항
- 모든 터치 타겟: min 52×52px
- 본문 텍스트: 18px (text-base) 이상
- 캡션/부가정보: 13px 이상
- 카드 간 여백: 24px (space-y-6)
- "← 마이페이지" 뒤로가기 링크: min-h-[52px]
