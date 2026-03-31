---
globs: ["src/components/ad/**", "src/app/layout.tsx", "agents/**/*.ts", ".github/workflows/**"]
description: 배포 QA 규칙 — 광고/에이전트/워크플로우 변경 시 자동 안내
---

# 배포 QA 규칙 (필수, 예외 없음)

## 모든 코드 변경 시
- `npx tsc --noEmit` 통과 확인
- 변경한 페이지/API 최소 1개 curl/WebFetch 200 확인

## 광고 컴포넌트 변경 시 (src/components/ad/)
- smoke test 필수: `npm run smoke-test -- --url https://age-doesnt-matter.com`
- SSR HTML에 광고 마커 포함 확인 (adsbygoogle 클래스, coupang 배너 URL)
- CSP 도메인 추가 필요 여부 확인 (next.config.js connect-src/script-src/img-src)

## 에이전트 스크립트 변경 시 (agents/)
- 크론 연결 검증 필수: `npx tsx scripts/check-cron-links.ts`
- `.claude/rules/agent-lifecycle.md` 체크리스트 준수 확인
- **새 핸들러 → 워크플로우 case문 추가 확인**
- **새 크론 → cron expression이 KST 의도 시간과 맞는지 확인 (UTC-9)**
- **runner.ts 우회 금지**: 워크플로우에서 직접 `npx tsx agents/파일.ts` 실행하지 말고 반드시 `runner.ts` 통해 실행 (automation_status 체크 보장)

## 워크플로우 변경 시 (.github/workflows/)
- 크론 연결 검증 필수: `npx tsx scripts/check-cron-links.ts`
- runner.ts HANDLERS와 워크플로우 case문 정합성 확인
- `gh workflow list`로 워크플로우 활성화 상태 확인

## 서비스 코드 변경 시 (src/app/(main)/, src/components/, prisma/)
- 어드민 영향도 한 줄 명시 ("어드민 영향: 없음" 또는 구체 내용)

## 배포 후 프로덕션 검증 (커밋+푸시 후)
- `npm run smoke-test -- --url https://age-doesnt-matter.com` 실행
- 에이전트 변경 시: `gh run list --workflow=해당워크플로우.yml --limit=3`으로 최근 실행 확인
- 실패 시 즉시 사용자에게 보고 + 롤백 여부 확인
