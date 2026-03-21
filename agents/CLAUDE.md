# 우리 나이가 어때서 — 에이전트 시스템 지시사항

## 에이전트 작성 규칙
- 모든 에이전트는 BaseAgent 클래스 상속 (core/agent.ts)
- 모델 선택: 복잡한 판단=CLAUDE_MODEL_HEAVY / 단순·빠른=CLAUDE_MODEL_LIGHT
- constitution.yaml 항상 System Prompt에 주입
- 모든 액션은 BotLog 테이블에 기록

## 안전 규칙 (절대 준수)
- DB write는 COO만 가능 (나머지 읽기 전용)
- 창업자 승인 필요 사항 → AdminQueue INSERT만, 직접 실행 금지
- 비용 누적 $40 초과 시 즉시 중단 + 텔레그램 알림
- 에이전트가 직접 에이전트 생성 금지

## MCP 권한
- supabase: SELECT 자유 / INSERT·UPDATE는 COO만
- github: Issue 생성·PR 조회만 (push 절대 금지)
- r2: 이미지 업로드만

## 스킬 추가 프로세스
1. 에이전트가 반복 패턴 감지
2. skills/registry.ts에 스킬 정의서 초안 작성
3. AdminQueue에 '진화 제안' 등록
4. 창업자 승인 후 Claude Code가 구현
