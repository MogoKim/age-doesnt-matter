# 컨텍스트 파일 분류 기준 (하네스 Pillar 1)

## 어디에 무엇을 기록하는가

### CLAUDE.md (프로젝트 루트)
- **언제**: Claude가 **매 세션 항상** 알아야 할 행동 규칙
- **무엇**: 위반 시 즉각 문제가 되는 금지 사항, 코딩 원칙, 스킬 라우팅
- **한도**: 200줄 이하 — 초과 시 .claude/rules/ 하위 파일로 분리
- **갱신 시점**: Claude가 실수할 때마다 한 줄 추가 (팀 PR 리뷰 방식)

### .claude/rules/*.md
- **언제**: 특정 도메인 작업 시에만 참조하면 되는 것
- **무엇**: UI 규칙, API 패턴, 에이전트 규칙, Figma 워크플로우, QA 절차
- **원칙**: CLAUDE.md에서 `@.claude/rules/파일.md` 형식으로 참조
- **현재 파일 목록**: agents.md / api-routes.md / ui-components.md / agent-lifecycle.md / qa-deploy.md / figma-first.md / debug-silent-failure.md / context-management.md(본 파일)

### memory/MEMORY.md (자동 로드 인덱스)
- **언제**: 현재 상태 + 서브파일 포인터 — **매 대화 자동 로드**
- **무엇**: 지금 켜져있는 시스템, 최근 완료 항목, 인덱스 링크
- **한도**: 40줄 이하 (넘으면 내용을 서브파일로 이동)
- **갱신 주기**: 매 작업 완료 시 "현재 상태" 섹션만 업데이트

### memory/*.md (서브파일 — 필요 시에만 읽기)
- **변경 빈도별 분류**:
  - `project_status.md` — 완료 개발 목록, 자동화 현황 (격주 업데이트)
  - `project_strategy.md` — 전략/포지셔닝/카테고리 결정 (한번 확정 후 거의 불변)
  - `project_roadmap.md` — 앞으로 할 작업 P1/P2/P3 (주간 업데이트)
  - `feedback_*.md` — Claude 실수→규칙 학습 기록 (실수 시마다 추가)
  - `reference_*.md` — API 키 위치, OAuth 설정 (설치 후 거의 변경 없음)

## 저장하지 않는 것

| 정보 유형 | 이유 | 진실의 원천 |
|-----------|------|-------------|
| 코드 패턴, 아키텍처 | 코드에서 직접 확인 가능 | 코드 자체 |
| git 히스토리, 커밋 내용 | git log / git blame으로 확인 | git |
| 디버깅 해결책, 버그 픽스 방법 | 커밋 메시지에 있음 | git commit message |
| 임시 디버깅 메모 | 다음 세션에 불필요 | 삭제 |
| 이미 CLAUDE.md에 있는 것 | 중복 — 하나만 관리 | CLAUDE.md |

## MEMORY.md 슬림 유지 규칙

새 항목을 MEMORY.md에 추가하기 전에:
1. 이 정보가 "매 세션 첫 줄부터 알아야 하는가?" → 아니면 서브파일로
2. 이 정보가 "한번 완료되면 변하지 않는가?" → `project_strategy.md` 또는 `project_status.md`
3. MEMORY.md가 40줄 초과 시 → 가장 오래된/불변 섹션을 서브파일로 이동
