# 멀티 AI 세션 격리 규칙 (Antigravity IDE 환경)

## 배경

Antigravity IDE에서 Claude + Codex 등 여러 AI 에이전트가 동시에 작업한다.
Antigravity는 git worktree로 파일 동시 쓰기 충돌을 방지하지만,
**머지 충돌·도메인 침범·인터페이스 변경 연쇄**는 하네스가 직접 관리해야 한다.

---

## 도메인 선언 (.claude/sessions/domain-map.json)

각 AI 에이전트의 담당 파일/디렉토리를 명시한다.

```json
{
  "claude":  { "domains": ["agents/community/", "docs/handover-scraper-*"] },
  "codex":   { "domains": ["agents/coo/", "agents/cron/runner.ts"] },
  "_shared": ["agents/core/", "prisma/", "src/"]
}
```

**공용 파일(_shared)**: core/, prisma/, src/ 등 — 두 AI 모두 수정 가능하나 순서 조율 필수.

---

## 규칙 (절대 준수)

### 1. 다른 AI 도메인 파일 수정 시
- domain-map.json에 본인 도메인에 없는 파일을 수정하기 전에 이유를 주석 또는 커밋 메시지에 명시
- 예: "agents/cron/runner.ts 수정 — community:sheet-scrape 핸들러 추가 (codex 도메인이지만 scraper 연동 필요)"

### 2. 공용 파일(core/, prisma/) 수정 시
- 반드시 **먼저** 다른 AI 담당 세션에 변경 내용 공지 (Slack 또는 커밋 메시지)
- 인터페이스(export 타입, function signature) 변경은 두 브랜치 모두 영향 → 순서 조율 필수

### 3. 머지 전 체크리스트
- [ ] `npx tsc --noEmit` 양쪽 브랜치 각각 통과 확인
- [ ] 동일 파일을 두 AI가 각자 수정했으면 diff 검토 후 머지
- [ ] prisma/schema.prisma 변경 시 migration 충돌 여부 확인

### 4. domain-map.json 업데이트 시점
- 새 기능/모듈이 추가될 때 담당 AI를 domain-map.json에 등록
- 세션 종료 후 담당 변경이 확정되면 업데이트

---

## 멀티세션 staged 휩쓸림 방지 (커밋 직전 필수 — 절대 준수)

> **사고 사례(2026-06-16)**: 한 세션이 P7 3파일을 명시적으로 stage해두고 검증하는 동안, **다른 세션이 광범위 add로 그 staged 파일을 자기 커밋(7c951f5 "봇 댓글 fix")에 함께 휩쓸어 푸시**했다. P7 코드는 정상 반영됐으나 커밋이 의도와 다르게 섞였고 history rewrite도 불가했다.

여러 AI 세션이 동시에 작업하는 환경에서는 **stage와 commit 사이에 다른 세션이 끼어들 수 있다.** 커밋 직전 아래를 반드시 수행한다.

### 커밋 직전 체크리스트
- [ ] **`git diff --cached --name-only` 확인**: staged 목록이 "이번 세션에서 내가 직접 수정한 파일"과 정확히 일치하는지. 모르는 파일이 1개라도 있으면 커밋 중단.
- [ ] **`git status --short`로 타 세션 staged/modified 구분**: 내 작업 외 `M`/`A`/`D` 파일이 섞였는지 확인. 타 세션 파일이 staged면 `git restore --staged <file>`로 제외.
- [ ] **staged 상태를 오래 유지하지 말 것**: stage 직후 곧바로 커밋한다. stage → 장시간 검증 → 커밋 사이에 타 세션이 휩쓸 위험. 검증이 길면 **커밋 직전에 다시 stage**한다.
- [ ] **다른 세션 작업 중이면**: 커밋 전 staged를 다시 비우고(`git restore --staged .` 후 내 파일만 재-add) 목록을 재확인한다.
- [ ] **`git add -A` / `git add .` 절대 금지** (재강조): 항상 파일명 명시. 광범위 add는 타 세션 미커밋 변경을 휩쓴다.

### 발견 시 대응
- 이미 푸시된 혼합 커밋은 **history rewrite/force push 하지 않는다**(타 세션 작업까지 얽혀 위험 — `/careful` 영역). 기능이 정상 반영됐으면 그대로 두고 창업자에게 보고한다.

---

## /done Gate 2-G 연동

`/done` 실행 시 자동으로 domain-map.json을 체크한다.
상세: `.claude/commands/done.md` Gate 2-G 섹션
