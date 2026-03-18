# 공통 UX 스펙 (COMMON_UX_SPEC)

> **기준 문서**: PRD_Final_A v3.2 (A1, A3, A8, A9) · AUTH_SPEC · tokens.css
> **작성일**: 2026-03-17
> **목적**: 모든 페이지에서 재사용하는 공통 컴포넌트/패턴/인터랙션의 개발 스펙

---

## 1. 레이아웃 시스템

### 1.1 페이지 구조

```
모바일 (~767px):
┌─────────────────────────────────┐
│ Header (56px, sticky top:0)     │
├─────────────────────────────────┤
│ IconMenu (64px, sticky top:56px)│
├─────────────────────────────────┤
│ PageContent (padding: 16px)     │
│ ...                             │
├─────────────────────────────────┤
│ Footer                          │
└─────────────────────────────────┘
  [FAB - 조건부 우하단]

데스크탑 (1024px~):
┌─────────────────────────────────┐
│ GNB (64px, sticky)              │
├─────────────────────────────────┤
│  max-width: 1200px, 중앙 정렬    │
│ ┌──────────┐ ┌────────┐        │
│ │ Main     │ │Sidebar │        │
│ │ (유동)    │ │ (300px) │        │
│ └──────────┘ └────────┘        │
├─────────────────────────────────┤
│ Footer                          │
└─────────────────────────────────┘
```

### 1.2 반응형 브레이크포인트

| 이름 | 범위 | CSS 변수 | 주요 변경 |
|:---|:---|:---|:---|
| Mobile | ~767px | — (기본) | 1열, 터치 최적화, gutter 16px |
| Tablet | 768~1023px | `--bp-tablet` | 2열 그리드, gutter 24px |
| Desktop | 1024px~ | `--bp-desktop` | 3열, 사이드바, gutter 32px |

```css
/* 미디어 쿼리 패턴 */
/* Mobile: 기본 */
@media (min-width: 768px)  { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
```

### 1.3 그리드

| 속성 | 값 |
|:---|:---|
| 최대 폭 | `--content-max: 1200px` |
| 사이드바 폭 | `--sidebar-width: 300px` |
| 거터 | 모바일 16px / 태블릿 24px / 데스크탑 32px |
| 카드 간 간격 | `--space-md (16px)` |

---

## 2. 공통 컴포넌트 스펙

### 2.1 Button

| variant | 높이(모바일) | 높이(데스크탑) | 배경 | 텍스트 | border-radius |
|:---|:---:|:---:|:---|:---|:---:|
| **primary** | 52px | 48px | `--color-primary` | #FFFFFF | `--radius-sm (8px)` |
| **secondary** | 52px | 48px | transparent | `--color-primary` | `--radius-sm` |
| **ghost** | 52px | 48px | transparent | `--color-text-sub` | `--radius-sm` |
| **danger** | 52px | 48px | `--color-error` | #FFFFFF | `--radius-sm` |

```
공통:
- font: var(--font-button) → 18px/700
- 모바일 width: 100% (full-width)
- 데스크탑 width: auto (min-width: 120px)
- hover: primary → --color-primary-hover
- disabled: opacity 0.5, cursor not-allowed
- 로딩: 텍스트 → 스피너(20px) + 텍스트, pointer-events: none
- 터치 타겟: 최소 52×52px
```

### 2.2 Card

```
┌──────────────────────────┐
│ [카테고리 태그]            │  ← optional
│ 제목 (17px bold)          │
│ 본문 미리보기 1줄 (17px)   │  ← optional
│ [썸네일]                  │  ← optional
│ 🌱닉네임 · 2시간 전        │
│ ❤️ 5  💬 12  👁 89        │
└──────────────────────────┘
```

| 속성 | 모바일 | 데스크탑 |
|:---|:---|:---|
| border-radius | `--radius-md (12px)` | `--radius-md (12px)` |
| padding | `--space-md (16px)` | 20px |
| 배경 | `--color-surface` | `--color-surface` |
| 그림자 | `--shadow-sm` | `--shadow-sm` |
| hover | — | `--shadow-md` + translateY(-2px) |
| 폭 | 100% | 그리드 셀 |
| active (터치) | background: `--color-primary-light` 0.1s | — |

### 2.3 Input

| 속성 | 값 |
|:---|:---|
| 높이 | 52px |
| font | `--font-body` (17px/400) |
| border | 1px solid `--color-border` |
| border-radius | `--radius-sm (8px)` |
| focus | border-color: `--color-primary` |
| error | border-color: `--color-error` |
| padding | 0 16px |
| placeholder 색상 | `--color-text-muted` |

```
라벨: 17px, --color-text, margin-bottom: 8px
에러 메시지: 14px, --color-error, margin-top: 4px
성공 메시지: 14px, --color-success, margin-top: 4px
```

### 2.4 Textarea

| 속성 | 값 |
|:---|:---|
| 최소 높이 | 120px |
| font | `--font-body` (17px/400) |
| border | Input과 동일 |
| padding | 16px |
| resize | vertical |
| 글자수 카운터 | 우하단, 14px, `--color-text-muted` |

### 2.5 Chip (태그/필터)

| 속성 | 비활성 | 활성 |
|:---|:---|:---|
| 높이 | 36px | 36px |
| padding | 0 16px | 0 16px |
| 배경 | `--color-bg` | `--color-primary-light` |
| 텍스트 | `--color-text-sub` (14px) | `--color-primary` (14px/500) |
| border | 1px solid `--color-border` | 1px solid `--color-primary` |
| border-radius | `--radius-full` | `--radius-full` |
| 터치 타겟 | 최소 52px 높이 (padding 포함) | — |

### 2.6 Badge (등급)

```
🌱 새싹   → color: --color-grade-sprout
🌿 단골   → color: --color-grade-regular
💎 터줏대감 → color: --color-grade-veteran
☀️ 따뜻한이웃 → color: --color-grade-warm-neighbor
```

| 속성 | 값 |
|:---|:---|
| font-size | 14px |
| 표시 형식 | `이모지 + 닉네임` (게시글/댓글), `이모지 + 등급명` (프로필) |

### 2.7 Avatar

| 속성 | 값 |
|:---|:---|
| 크기 | 40×40px (기본), 64×64px (프로필) |
| border-radius | `--radius-full` |
| fallback | 이니셜 1글자 + `--color-primary-light` 배경 |
| border | 2px solid `--color-border` |

---

## 3. 모달 & 시트 시스템

### 3.1 BottomSheet (모바일)

```
                              (오버레이)
┌──────────────────────────────────┐
│                                  │
│         (반투명 배경 탭 → 닫기)    │
│                                  │
├──────────────────────────────────┤
│  ─── (핸들바 48×4px)              │
│                                  │
│  [시트 콘텐츠]                    │
│                                  │
│  [Primary 버튼 - 52px]           │
│                                  │
│  (Safe Area padding)             │
└──────────────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 오버레이 | rgba(0,0,0,0.5) |
| 배경 | `--color-surface` |
| border-radius | 상단 `--radius-lg (16px)` |
| 핸들바 | 48×4px, `--color-border`, border-radius: 2px |
| 패딩 | 24px (상/좌/우), safe-area-inset-bottom (하단) |
| 애니메이션 | 하단→상단 slide-up, 0.3s ease |
| 닫기 | 핸들바 드래그, 오버레이 탭, ESC 키 |
| z-index | `--z-modal-overlay (200)` / `--z-modal (201)` |

### 3.2 Modal (데스크탑)

| 속성 | 값 |
|:---|:---|
| max-width | 480px |
| 위치 | 화면 중앙 |
| 배경 | `--color-surface` |
| border-radius | `--radius-lg (16px)` |
| 그림자 | `--shadow-lg` |
| 패딩 | 32px |
| 닫기 | 우상단 ✕ 버튼, 오버레이 클릭, ESC 키 |
| 애니메이션 | scale(0.95)→scale(1) + fade-in, 0.2s ease |

### 3.3 Confirm Dialog

```
┌──────────────────────────────────┐
│  제목 (20px, bold)                │
│                                  │
│  본문 메시지 (17px)               │
│                                  │
│  [취소 - ghost]  [확인 - primary] │
│  (또는 [취소]     [삭제 - danger])  │
└──────────────────────────────────┘
```

| 용도 | 제목 | 확인 버튼 |
|:---|:---|:---|
| 글쓰기 취소 | "작성 중인 내용이 사라져요" | "나가기" (danger) |
| 댓글 삭제 | "댓글을 삭제할까요?" | "삭제" (danger) |
| 회원 탈퇴 | "정말 탈퇴하시겠어요?" | "탈퇴하기" (danger) |
| 로그아웃 | "로그아웃할까요?" | "로그아웃" (primary) |

---

## 4. 피드백 시스템

### 4.1 Toast

```
┌──────────────────────────────────┐
│  ✅ 글이 등록되었어요!              │  ← 상단 중앙, slide-down
└──────────────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 위치 | 화면 상단 중앙, top: 80px (헤더 아래) |
| z-index | `--z-toast (300)` |
| 배경 | `--color-surface`, border: 1px solid `--color-border` |
| 그림자 | `--shadow-md` |
| border-radius | `--radius-md (12px)` |
| padding | 16px 24px |
| font | 17px / 500 |
| 애니메이션 | slide-down + fade-in 0.2s, slide-up + fade-out 0.2s |
| 스택 | 최대 1개 (새 토스트가 이전 것을 교체) |

#### 토스트 메시지 정의

| 상황 | 아이콘 | 메시지 | 지속시간 |
|:---|:---:|:---|:---:|
| 글 등록 | ✅ | "글이 등록되었어요!" | 3초 |
| 댓글 등록 | ✅ | "댓글이 등록되었어요" | 2초 |
| 스크랩 추가 | 📌 | "스크랩했어요" | 2초 |
| 스크랩 해제 | — | "스크랩이 해제되었어요" | 2초 |
| 공감 | — | (애니메이션만, 토스트 없음) | — |
| 신고 접수 | ✅ | "신고가 접수되었어요" | 3초 |
| 링크 복사 | ✅ | "링크가 복사되었어요" | 2초 |
| 닉네임 변경 | ✅ | "닉네임이 변경되었어요" | 2초 |
| 가입 완료 | 🎉 | "환영합니다! 우나어에 오신 것을 환영해요" | 4초 |
| 에러 | ⚠️ | "문제가 생겼어요. 다시 시도해주세요" | 4초 |

### 4.2 Empty State

```
┌──────────────────────────────────┐
│                                  │
│         (일러스트 또는 이모지)      │
│                                  │
│       메시지 (20px, medium)       │
│     서브메시지 (17px, muted)      │
│                                  │
│       [CTA 버튼 - optional]      │
│                                  │
└──────────────────────────────────┘
```

| 페이지 | 메시지 | CTA |
|:---|:---|:---|
| 검색 결과 없음 | "검색 결과가 없어요" | "다른 키워드로 검색해 보세요" |
| 게시글 목록 비어있음 | "아직 글이 없어요" | "첫 번째 글을 써보세요! [글쓰기]" |
| 내가 쓴 글 없음 | "아직 작성한 글이 없어요" | "첫 글을 남겨보세요! [글쓰기]" |
| 스크랩 없음 | "스크랩한 글이 없어요" | "마음에 드는 글에 📌 눌러보세요" |
| 알림 없음 | "새 알림이 없어요" | (없음) |
| 댓글 없음 | "아직 댓글이 없어요" | "첫 댓글을 남겨보세요" |

### 4.3 로딩 상태

#### Skeleton UI

```
┌──────────────────────────┐
│ ████████████              │  ← 제목 (높이 20px)
│ ██████████████████████    │  ← 본문 (높이 17px)
│ ████████                  │  ← 메타 (높이 14px)
│ ████  ████  ████          │  ← 통계 (높이 14px)
└──────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 배경 | `--color-bg (#F5F3F0)` |
| 애니메이션 | shimmer (좌→우 그라데이션, 1.5s linear infinite) |
| border-radius | 텍스트: 4px / 이미지: `--radius-md` / 아바타: `--radius-full` |
| 노출 카드 수 | 목록: 3개 / 그리드: 4개 |

#### 페이지 전환 프로그레스 바

| 속성 | 값 |
|:---|:---|
| 위치 | 화면 최상단, height: 3px |
| 색상 | `--color-primary` |
| 애니메이션 | 좌→우 진행, 완료 시 fade-out |
| z-index | `--z-toast (300)` 이상 |

#### 버튼 로딩

| 속성 | 값 |
|:---|:---|
| 스피너 | 20×20px, border-based, `--color-surface` |
| 텍스트 | 유지 (스피너 좌측 배치) |
| 상태 | disabled + pointer-events: none |

### 4.4 에러 상태

| 유형 | HTTP | 메시지 | 액션 |
|:---|:---:|:---|:---|
| 네트워크 오류 | — | "인터넷 연결을 확인해주세요" | [다시 시도] |
| 서버 오류 | 500 | "잠시 문제가 생겼어요. 곧 돌아올게요!" | [다시 시도] |
| 페이지 없음 | 404 | "앗, 이 페이지를 찾을 수 없어요" | [홈으로 가기] |
| 권한 없음 | 401 | "로그인이 필요한 페이지예요" | [카카오로 로그인] |
| 접근 금지 | 403 | "접근 권한이 없어요" | [홈으로 가기] |
| Rate Limit | 429 | "요청이 너무 많아요. 잠시 후 다시 시도해주세요" | [다시 시도] (10초 후 활성화) |

```
에러 페이지 구조:
┌──────────────────────────────────┐
│                                  │
│          (에러 일러스트)           │
│                                  │
│       404                        │  ← 코드 (32px, muted)
│  앗, 이 페이지를 찾을 수 없어요    │  ← 메시지 (20px, bold)
│                                  │
│       [홈으로 가기]               │  ← CTA
│                                  │
└──────────────────────────────────┘
```

---

## 5. 네비게이션

### 5.1 Header (모바일)

```
┌──────────────────────────────┐
│  [🟠Logo]  우나어     🔍  👤  │
└──────────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 높이 | `--header-height (56px)` |
| 배경 | `--color-surface` |
| 하단선 | 1px solid `--color-border` |
| position | sticky, top: 0, z-index: `--z-header (100)` |
| 로고 | 좌측, 높이 32px, 탭 → `/` |
| 검색(🔍) | 48×48 터치 타겟, 탭 → 검색 오버레이 |
| 프로필(👤) | 48×48 터치 타겟, 비로그인 → `/login`, 로그인 → `/my` |

### 5.2 IconMenu (모바일)

```
│  ⭐     💼     💬     ⚡    📖 │
│ 베스트 내일찾기 사는이야기 활력충전소 매거진│
```

| 속성 | 값 |
|:---|:---|
| 높이 | `--icon-menu-height (64px)` |
| position | sticky, top: 56px, z-index: `--z-icon-menu (99)` |
| 아이콘 크기 | 28×28px |
| 라벨 크기 | 12px (아이콘 동반이므로 예외) |
| 터치 타겟 | 52×52px 이상 |
| 배치 | `justify-content: space-around` |
| 활성 | `--color-primary` + 하단 2px indicator |
| 비활성 | `--color-text-muted` |
| 홈(/) 시 | 전체 비활성 |

#### 메뉴 항목

| 순서 | 아이콘 | 라벨 | URL |
|:---:|:---:|:---|:---|
| 1 | ⭐ | 베스트 | `/best` |
| 2 | 💼 | 내 일 찾기 | `/jobs` |
| 3 | 💬 | 사는 이야기 | `/community/stories` |
| 4 | ⚡ | 활력 충전소 | `/community/humor` |
| 5 | 📖 | 매거진 | `/magazine` |

### 5.3 GNB (데스크탑)

```
┌───────────────────────────────────────────────────────────────────┐
│ [🟠Logo] 우나어  │  베스트  내일찾기  사는이야기  활력충전소  매거진  │  🔍 통합검색  │  [로그인] │
└───────────────────────────────────────────────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 높이 | 64px |
| max-width | `--content-max (1200px)`, 중앙 정렬 |
| 로고 | 좌측, 높이 36px |
| 메뉴 | 텍스트만 (아이콘 없음), 17px, 간격 32px |
| 활성 메뉴 | `--color-primary` + 하단 2px indicator |
| 검색 | Input 필드, placeholder "통합검색", 폭 240px |
| 프로필 | 비로그인: "로그인" 텍스트 / 로그인: 아바타 + 닉네임 |

### 5.4 FAB (플로팅 글쓰기)

| 속성 | 모바일 | 데스크탑 |
|:---|:---|:---|
| 형태 | pill (아이콘 + "글쓰기") | 원형 56px, 호버 → pill 확장 |
| 높이 | 52px | `--fab-size (56px)` |
| 위치 | 우하단 margin 24px | 우하단 margin 32px |
| 색상 | `--color-primary`, 텍스트 #FFF | 동일 |
| 그림자 | `--shadow-fab` | `--shadow-fab` |
| z-index | `--z-fab (97)` | `--z-fab (97)` |
| 스크롤 | 아래 스크롤 → 축소(아이콘만), 위/정지 → 확장 | — |
| 애니메이션 | scale + fade, 0.2s ease | — |

#### 표시 규칙

| 페이지 | FAB | 이유 |
|:---|:---:|:---|
| `/community/stories` | ✅ | 사용자 UGC |
| `/community/humor` | ✅ | 사용자 UGC |
| 그 외 모든 페이지 | ❌ | 글쓰기 불가 |

### 5.5 Footer

```
┌──────────────────────────────────┐
│  회사소개 · 이용약관 · 개인정보 · 문의 │
│  © 2026 우리 나이가 어때서         │
└──────────────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 배경 | `--color-bg` |
| 텍스트 | 14px, `--color-text-muted` |
| 링크 | 14px, `--color-text-sub`, hover: `--color-text` |
| 패딩 | 32px 16px (모바일), 48px 32px (데스크탑) |
| 링크 목록 | `/about`, `/terms`, `/privacy`, `/contact` |

---

## 6. 인터랙션 패턴

### 6.1 터치 / 클릭

| 패턴 | 구현 |
|:---|:---|
| 터치 타겟 | 최소 52×52px (모바일), 44×44px (데스크탑) |
| 터치 간격 | 최소 `--touch-gap-min (8px)` |
| 터치 피드백 | `active` 상태 0.1s: 카드 → `--color-primary-light` 배경 |
| 호버 피드백 | 데스크탑만: 카드 → shadow-md + translateY(-2px) |
| ripple | 사용하지 않음 (시니어 시각 혼동 방지) |

### 6.2 스크롤

| 패턴 | 구현 |
|:---|:---|
| 스크롤 복원 | 목록→상세→뒤로가기 시 스크롤 위치 복원 (`scrollRestoration: 'manual'`) |
| Infinite scroll | 사용하지 않음 → "더보기" 버튼 (10개씩) |
| Pull-to-refresh | 모바일: 당겨서 새로고침 (네이티브 느낌) |
| Scroll-to-top | 스크롤 500px 이상 시 "↑" 버튼 표시, z-index: `--z-scroll-top (98)` |

### 6.3 공유

| 플랫폼 | 방법 |
|:---|:---|
| 카카오톡 | Kakao SDK 공유 (썸네일 + 제목 + 링크) |
| 링크 복사 | `navigator.clipboard` → 토스트 "링크가 복사되었어요" |

### 6.4 공감 (Like) 애니메이션

```
탭 → ❤️ 아이콘 scale(1.3) + 색상 fill 0.2s → scale(1.0)
해제 → ❤️ 아이콘 → 빈 하트 ♡ 0.1s
낙관적 업데이트: 즉시 UI 반영 → 서버 요청 → 실패 시 롤백
```

### 6.5 글쓰기 (FAB → Write 플로우)

```
FAB 탭 →
  비로그인 → BottomSheet: "글을 쓰려면 로그인이 필요해요" + [카카오로 시작하기]
  로그인 → /community/write (진입 게시판 프리셋)
    - 게시판 선택: 진입한 게시판 자동 선택
    - 제목: 2~40자 (필수)
    - 본문: 10자 이상 (필수)
    - 이미지: 🌿단골 이상, 최대 5장, 5MB, WebP 자동 변환
    - 유튜브: 🌿단골 이상
    - 취소 → ConfirmDialog
    - 등록 → 상세 페이지 이동 + 토스트
```

---

## 7. 페이지네이션

"더보기" 버튼 방식 (무한 스크롤 사용 안 함):

```
┌──────────────────────────┐
│  [카드] ...               │
│  [카드] ...               │
│  [카드] ...               │  ← 10개 단위
│                          │
│     [더보기 ▼]           │  ← 52px 높이, secondary 스타일
│                          │
└──────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 단위 | 10개씩 |
| 스타일 | secondary 버튼, "더보기" |
| 로딩 | 버튼 → 스피너 + "불러오는 중..." |
| 마지막 | 버튼 숨김 |

---

## 8. 접근성

### 8.1 글자 크기 3단계

| 설정 | data 속성 | body | caption |
|:---|:---|:---:|:---:|
| 기본 | `data-font-size="medium"` | 17px | 14px |
| 크게 | `data-font-size="large"` | 19px | 16px |
| 작게 | `data-font-size="small"` | 16px | 14px |

- `html` 태그에 `data-font-size` 속성으로 제어
- CSS 변수 오버라이드 방식 (tokens.css에 정의됨)
- 사용자 설정은 DB (`User.fontSize`) + localStorage에 저장

### 8.2 키보드 / 스크린 리더

| 항목 | 구현 |
|:---|:---|
| focus | `:focus-visible` — 2px solid `--color-primary` outline |
| tab order | 논리적 순서 유지 |
| aria-label | 아이콘 버튼에 필수 (검색, 프로필, FAB 등) |
| role | 모달: `role="dialog"`, 토스트: `role="alert"` |
| `word-break` | `keep-all` (한국어 단어 단위 줄바꿈) |

---

## 9. 모바일 특화

| # | 항목 | 구현 |
|:-:|:---|:---|
| 1 | 뒤로가기 | `history.back()` + 좌상단 ← 버튼 |
| 2 | 키보드 | 댓글 입력 시 키보드 위로 입력창 고정 |
| 3 | Safe Area | `env(safe-area-inset-*)` 대응 (iOS 노치/홈바) |
| 4 | FAB 충돌 | 스티키 광고와 동시 시 FAB이 광고 위에 배치 |
| 5 | 제스처 | 카드 스와이프 없음 (오작동 방지, 시니어 친화) |
| 6 | 입력 zoom | `font-size: 16px` 이상으로 iOS 자동 줌 방지 |
| 7 | 오프라인 | "인터넷 연결을 확인해주세요" 상단 배너 |

---

## 10. 광고 컴포넌트

### 10.1 광고 영역 공통 스타일

| 속성 | 값 |
|:---|:---|
| 배경 | `--color-ad-bg (#F9F5F0)` |
| 라벨 | "광고" 텍스트, 12px, `--color-text-muted`, 우상단 |
| border-radius | `--radius-md (12px)` |
| padding | 16px |

### 10.2 슬롯별 크기

| 슬롯 | 모바일 | 데스크탑 |
|:---|:---|:---|
| `HOME-INLINE` | 풀폭, 높이 auto | 콘텐츠 영역 내 |
| `LIST-INLINE` | 카드 사이 풀폭 | 카드 사이 |
| `POST-BOTTOM` | 풀폭 | max-width 720px |
| `SIDEBAR` | 없음 | 300×250px |
| `MOBILE-STICKY` | 풀폭, 높이 50px, 하단 고정 | 없음 |

---

## 11. 댓글 시스템 UI

```
💬 댓글 12
[등록순 ▼] [공감순]

🌿순자맘 · 30분 전
좋은 글이네요~ 저도 어제...
❤️ 3  [답글]
  └── 🌱영희맘 · 10분 전          ← 대댓글 (1단계만)
      감사합니다 ^^
      ❤️ 1

┌────────────────────────────┐
│ 댓글을 남겨주세요...     [등록] │  ← 하단 고정
└────────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 대댓글 | 1단계만 (좌측 indent 24px) |
| 정렬 | 등록순(기본) / 공감순 |
| 수정 | 10분 이내 |
| 삭제 | 본인 가능, 대댓글 있으면 "삭제된 댓글입니다" |
| 입력창 위치 | 모바일: 화면 하단 고정 / 데스크탑: 댓글 목록 하단 |
| 입력창 높이 | 52px (확장: 120px) |
| 비회원 | 입력창 비활성: "로그인 후 댓글을 남겨보세요" |

---

## 12. 액션 바 (글 상세 하단)

```
┌──────────────────────────────────┐
│  ❤️ 공감 5  │  📌 스크랩  │  🔗 공유  │  🚨 신고  │
└──────────────────────────────────┘
```

| 속성 | 값 |
|:---|:---|
| 위치 | 본문과 댓글 사이, 고정(sticky) 아님 |
| 높이 | 52px |
| 배경 | `--color-bg` |
| border-radius | `--radius-sm (8px)` |
| 아이템 배치 | 균등 배분 |
| 터치 타겟 | 각 52×52px |
| 공감 활성 | ❤️ fill + `--color-error` |
| 스크랩 활성 | 📌 fill + `--color-primary` |
| 신고 | 운영자 콘텐츠(일자리/매거진)에서는 미표시 |

---

## 13. 컴포넌트 파일 구조 (C0 구현 시)

```
src/components/
├── common/
│   ├── Button.tsx
│   ├── Button.module.css
│   ├── Card.tsx
│   ├── Card.module.css
│   ├── Input.tsx
│   ├── Input.module.css
│   ├── Textarea.tsx
│   ├── Chip.tsx
│   ├── Badge.tsx
│   ├── Avatar.tsx
│   ├── Skeleton.tsx
│   └── Skeleton.module.css
├── feedback/
│   ├── Toast.tsx
│   ├── Toast.module.css
│   ├── EmptyState.tsx
│   ├── ErrorState.tsx
│   └── ProgressBar.tsx
├── modal/
│   ├── BottomSheet.tsx
│   ├── BottomSheet.module.css
│   ├── Modal.tsx
│   ├── Modal.module.css
│   └── ConfirmDialog.tsx
├── nav/
│   ├── Header.tsx
│   ├── Header.module.css
│   ├── IconMenu.tsx
│   ├── IconMenu.module.css
│   ├── GNB.tsx
│   ├── GNB.module.css
│   ├── FAB.tsx
│   ├── FAB.module.css
│   ├── Footer.tsx
│   └── Footer.module.css
├── comment/
│   ├── CommentList.tsx
│   ├── CommentItem.tsx
│   ├── CommentInput.tsx
│   └── Comment.module.css
├── post/
│   ├── PostCard.tsx
│   ├── PostCard.module.css
│   ├── ActionBar.tsx
│   └── ActionBar.module.css
└── ad/
    ├── AdSlot.tsx
    └── AdSlot.module.css
```
