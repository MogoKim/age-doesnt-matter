코드 리뷰 체크리스트 — PR 생성 전, 또는 코드 변경이 완료된 후 품질 검증할 때 사용합니다. '리뷰해줘', 'PR 만들기 전에 확인', '코드 점검' 등을 말할 때 트리거됩니다.

---

## STEP 0: 준비

```bash
git branch --show-current
git fetch origin main --quiet && git diff origin/main --stat
```

`~/.claude/plans/*.md` 에서 현재 브랜치/작업과 관련된 계획 파일 찾기.

---

## STEP 1: 계획 이행률 감사 (plan file이 있는 경우)

각 계획 항목을 git diff와 대조:

| 상태 | 의미 |
|------|------|
| **DONE** | diff에 구현 증거 있음 |
| **PARTIAL** | 일부만 구현됨 |
| **NOT DONE** | 구현 없음 |
| **CHANGED** | 다른 방식으로 같은 목표 달성 |

**출력 형식:**
```
PLAN COMPLETION AUDIT
══════════════════════
  [DONE]     기능명 — 파일:라인
  [PARTIAL]  기능명 — 코드는 있지만 테스트 미완료
  [NOT DONE] 기능명
──────────────────────
COMPLETION: N/M DONE, N PARTIAL
```

**범위 드리프트 감지:**
- **SCOPE CREEP**: 계획에 없는 파일/기능이 추가됐는가?
- **REQUIREMENTS MISSING**: 계획했던 항목이 구현 안 됐는가?

---

## STEP 2: Pass 1 — Critical (즉시 수정 필수)

### 자동 검증
```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
```
에러 있으면 즉시 수정 후 진행.

### 보안 (P0 — 즉시 차단)
- [ ] API 라우트 인증 누락 (`getServerSession()` 없는 protected route)
- [ ] Raw SQL 사용 (`$queryRaw`, `$executeRaw`) → Prisma ORM으로 교체
- [ ] 환경변수 하드코딩
- [ ] 사용자 입력 → DB 직접 삽입 (XSS/injection)

### 에이전트 코드 (P1 — agents/ 변경 시)
- [ ] COO 외 에이전트 DB write 없는가?
- [ ] BotLog 기록 (`this.log()`) 있는가?
- [ ] notifySlack 호출 있는가? (에러 시)
- [ ] runner.ts HANDLERS 등록됐는가?
- [ ] 워크플로우 case문 추가됐는가?

### 금지 용어 (P1)
- [ ] "시니어", "어르신", "노인" 표현 없는가?

상세: `references/security-check.md`

---

## STEP 3: Pass 2 — Informational (참고 사항)

### UI 코드 (UI 변경 시)
- [ ] 터치 타겟 52×52px 이상
- [ ] 폰트 최소 15px (caption/배지), 본문 18px 베이스
- [ ] 버튼 높이 52px (모바일) / 48px (데스크탑)
- [ ] `next/image` 미사용 이미지 있는가?
- [ ] 서버 컴포넌트 전환 가능한 `'use client'` 컴포넌트?

### 코드 품질
- [ ] 매직 넘버 → 상수로 추출 권장
- [ ] 데드 코드 / 사용하지 않는 import
- [ ] N+1 쿼리 (`findMany` + `include` 남용)

### 어드민 영향
- [ ] `src/app/(main)/`, `src/components/`, `prisma/` 변경 시 어드민 패널 영향 있는가?
  - 새 필드/모델 → 어드민 테이블/폼 반영 필요
  - UI 컴포넌트 변경 → 어드민 관리 화면 정합성 확인

상세: `references/senior-ui-rules.md`

---

## STEP 4: 자동 수정 vs 확인 필요

**자동 수정** (묻지 않고 처리):
- 사용하지 않는 import 삭제
- 명백한 타입 에러 수정
- ESLint auto-fix 가능한 항목

**AskUserQuestion 처리** (판단 필요):
- 아키텍처 변경이 필요한 이슈
- 기능 동작에 영향을 줄 수 있는 수정
- 어드민 패널 동기화 작업

---

## 출력 형식

```
## 코드 리뷰 — [브랜치명 or 기능명]

### 계획 이행률
[PLAN COMPLETION AUDIT 블록]

### Pass 1 — Critical
✅ tsc --noEmit 통과
✅ eslint 통과
[P0] (신뢰도: 10/10) 파일:라인 — 설명
[P1] (신뢰도: 8/10) 파일:라인 — 설명

### Pass 2 — Informational
[P2] (신뢰도: 7/10) 파일:라인 — 설명

### 어드민 영향
없음 / [있으면 내용]

### 자동 수정한 항목
- [항목 목록]

### 최종 판단
LGTM / LGTM_WITH_CONCERNS / NEEDS_CHANGES
```

---

## 참조 파일
- `references/senior-ui-rules.md` — 시니어 UI 상세 규칙
- `references/security-check.md` — 보안 체크 상세
- `gotchas.md` — 리뷰에서 자주 놓치는 지점
