---
globs: agents/**/*.ts
---

# 에이전트 코드 규칙

- BaseAgent 클래스 상속 (core/agent.ts)
- 모델: CLAUDE_MODEL_HEAVY (전략 판단) / CLAUDE_MODEL_LIGHT (단순·빠른)
- constitution.yaml 항상 System Prompt에 주입
- 모든 액션은 BotLog 테이블에 기록
- DB write는 COO만 가능 (나머지 읽기 전용)
- Slack 알림: notifier.ts의 notifySlack() 사용
- 에이전트가 직접 에이전트 생성 금지
