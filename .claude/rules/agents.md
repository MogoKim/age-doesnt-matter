---
globs: agents/**/*.ts
---

# 에이전트 코드 규칙

## 기본 규칙
- BaseAgent 클래스 상속 (core/agent.ts)
- 모델: CLAUDE_MODEL_HEAVY (전략 판단) / CLAUDE_MODEL_LIGHT (단순·빠른)
- constitution.yaml 항상 System Prompt에 주입
- 모든 액션은 BotLog 테이블에 기록
- DB write는 COO만 가능 (나머지 읽기 전용)
- Slack 알림: notifier.ts의 notifySlack() 사용
- 에이전트가 직접 에이전트 생성 금지

## 자사 사이트 HTTP 요청 프로토콜 (GA4/EventLog 오염 방지)

에이전트가 age-doesnt-matter.com에 HTTP 요청 시 **반드시** 아래 헤더 포함:
```
headers: { 'x-bot-type': '{에이전트타입}' }
```
예: `'x-bot-type': 'seed-agent'`, `'x-bot-type': 'cdo-agent'`, `'x-bot-type': 'cmo-agent'`

미포함 시 일반 사용자 트래픽으로 처리 → GA4 퍼널 지표 + EventLog DAU/MAU 오염 발생

---

## 신규 에이전트 체크리스트 (Orphaned Script 방지)
- [ ] `agents/cron/runner.ts` HANDLERS 등록: `'에이전트:태스크': () => import('../경로.js').then(() => {})`
- [ ] `.github/workflows/agents-*.yml` case문 추가 OR `// DISPATCH ONLY — 사유` 주석
- [ ] 로컬 전용 스크립트: 파일 상단 `// LOCAL ONLY — 사유` 주석 필수
- [ ] 유료 API(Claude/DALL-E/Perplexity): PR/커밋에 월간 비용 명시
  - 예: "DALL-E $0.04/장 × 2장 × 3회/일 ≈ $7.20/월 추가"
- [ ] 새 크론: cron expression UTC 기준 확인 (KST = UTC+9, 오전 9시 KST = 00:00 UTC)
- [ ] 실행 검증: runner.ts 등록 → GHA case 매칭 → BotLog/Slack 실행 기록까지 확인
