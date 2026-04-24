배포 QA 검증 — 프로덕션 smoke test + 크론 연결 검증을 실행합니다. '배포 검증', 'QA 돌려줘' 등을 말할 때 사용합니다.

## 실행 순서

1. 프로덕션 Smoke Test 실행
```bash
npm run smoke-test -- --url https://age-doesnt-matter.com
```

2. 크론 연결 검증 실행
```bash
npx tsx scripts/check-cron-links.ts
```

3. 결과를 요약 리포트로 출력:
- 통과/실패 항목 목록
- 실패 시 원인과 조치 방안 제시
- 크론 미연결 에이전트가 있으면 경고

## 로컬 테스트 (개발 서버)
dev 서버가 실행 중이면 로컬 대상으로도 테스트 가능:
```bash
npm run smoke-test -- --url http://localhost:3000
```
