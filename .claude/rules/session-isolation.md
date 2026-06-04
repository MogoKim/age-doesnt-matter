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

## /done Gate 2-G 연동

`/done` 실행 시 자동으로 domain-map.json을 체크한다.
상세: `.claude/commands/done.md` Gate 2-G 섹션
