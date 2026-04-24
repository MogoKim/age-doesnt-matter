# PWA 홈 화면 추가 유도 기획서

## 목적
재방문율 향상을 위해 홈 화면 아이콘 등록을 유도한다.
앱처럼 바로 진입할 수 있어 이탈률 감소 + 재방문율 증가 효과.

---

## 5단계 순차 트리거

| 순서 | 트리거명 | 발동 조건 | 재발동 |
|------|----------|-----------|--------|
| 1 | `home15s` | 홈 진입 15초 후 | 1회 |
| 2 | `signup` | 회원가입 완료 직후 | 1회 |
| 3 | `engagement` | 첫 댓글 또는 글쓰기 완료 | 1회 |
| 4 | `return_visit` | 2번째 홈 방문 시 | 1회 |
| 5 | `weekly` | 1~4 전부 표시 후 미설치 → 7일마다 | 무한 반복 |
| - | `manual` | Footer "홈 화면에 추가" 클릭 | 항상 허용 |

### 순차 조건
- trigger N이 표시된 후에만 trigger N+1 발동 가능
- 설치 완료 시 모든 트리거 비활성

---

## 거절(dismiss) 정책

- 딤 배경 클릭, X 버튼, "나중에 할게요" 클릭 → 모두 거절로 처리 → `pwa_declined_count++`
- `manual` 트리거로 열렸을 때 dismiss → 카운트 미증가 (의도적 접근)
- 총 3회 거절 후 `weekly` 트리거 비활성 (manual은 항상 작동)

---

## 설치 상태 관리

| 유저 유형 | 저장 위치 | 비고 |
|-----------|-----------|------|
| 비로그인 | `localStorage.pwa_installed = '1'` | 브라우저 데이터 삭제 시 리셋 |
| 로그인 유저 | `User.pwaInstalled = true` (DB master) + localStorage 캐시 | 영구 보존 |

---

## 플랫폼별 동작

| 플랫폼 | beforeinstallprompt | 동작 |
|--------|---------------------|------|
| Android Chrome | 발생 | "홈 화면에 추가하기" 버튼 → 네이티브 설치 프롬프트 |
| Android Chrome | 미발생 | 수동 3단계 안내 (⋮ 메뉴 → 홈 화면에 추가 → 추가) |
| iOS Safari | 없음 | 수동 3단계 안내 (공유 버튼 → 홈 화면에 추가 → 추가) |
| 기타 브라우저 | 없음 | 수동 안내 |

---

## localStorage 키 목록

| 키 | 값 | 설명 |
|----|-----|------|
| `pwa_shown_triggers` | JSON Trigger[] | 표시된 트리거 목록 |
| `pwa_declined_count` | number | 거절 횟수 (max 3) |
| `pwa_installed` | `'1'` | 설치 완료 여부 |
| `pwa_last_prompted_at` | ISO timestamp | 마지막 표시 시각 |
| `pwa_visit_count` | number | 홈 방문 횟수 |

---

## DB 스키마

```prisma
model User {
  pwaInstalled    Boolean   @default(false)
  pwaInstalledAt  DateTime?
}
```

## API

```
GET  /api/user/pwa-status  → { installed: boolean }  (비로그인: { installed: false })
POST /api/user/pwa-status  → 204  (User.pwaInstalled = true 업데이트)
```

---

## UI: 중앙 모달 + 딤 배경

- `fixed inset-0 z-[300] flex items-center justify-center px-4`
- 딤 배경: `bg-black/50` — 클릭 시 dismiss
- 모달 카드: `max-w-sm rounded-2xl` — 클릭 시 propagation stop
- 버튼: `h-[52px]` (터치 타겟 52px 준수)

---

## Footer 진입점

`src/components/layouts/Footer.tsx` → `FooterPwaButton` 컴포넌트

```tsx
<FooterPwaButton />
// → window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
```

---

*작성일: 2026-04-13 | 담당: 창업자 + Claude Code*
