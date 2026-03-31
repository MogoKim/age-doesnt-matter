---
globs: ["src/components/ad/**", "src/app/layout.tsx", "agents/**/*.ts", ".github/workflows/**"]
description: 배포 QA 규칙 — 광고/에이전트/워크플로우 변경 시 자동 안내
---

# 배포 QA 규칙

## 광고 컴포넌트 변경 시 (src/components/ad/)
- 로컬 smoke test 실행: `npm run smoke-test -- --url http://localhost:3000`
- SSR HTML에 광고 마커 포함 확인 (adsbygoogle 클래스, coupang 배너 URL)

## 에이전트 스크립트 추가 시 (agents/)
- 크론 연결 검증 실행: `npx tsx scripts/check-cron-links.ts`
- `.claude/rules/agent-lifecycle.md` 체크리스트 준수 확인

## 워크플로우 변경 시 (.github/workflows/)
- 크론 연결 검증 실행: `npx tsx scripts/check-cron-links.ts`
- runner.ts HANDLERS와 워크플로우 case문 정합성 확인

## 코드 변경 후 커밋 전
- smoke test 로컬 실행 권장: `npm run smoke-test -- --url http://localhost:3000`
