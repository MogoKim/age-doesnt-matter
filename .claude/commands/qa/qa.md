배포 QA 검증 — 프로덕션 응답 확인 + 변경 유형별 CI 결과 확인 + 크론 연결 검증을 실행합니다. '배포 검증', 'QA 돌려줘' 등을 말할 때 사용합니다.

> 참여 이벤트(VOTE·FEEDBACK·SURVEY) QA는 별도다 — `participation-events.md` 필수 10항목 참조.

## 실행 순서

1. 변경한 production 페이지/API를 직접 200 확인
   - 변경한 경로를 WebFetch 또는 curl 로 확인한다. 자사 요청에는 `x-bot-type` 헤더를 붙인다
   - 변경 대상이 불분명하면 홈(`/`) · 베스트(`/best`) · 일자리(`/jobs`) · `/api/health` 를 확인한다

2. 변경 유형별 CI 결과 확인
```bash
gh run list --workflow=ci.yml --limit=3
```
   - `.claude/rules/qa-deploy.md` 의 변경 유형별 QA 매핑을 기준으로 필요한 job 이 돌았는지 본다

3. 광고 컴포넌트(`src/components/ad/`) 변경이면 브라우저 기반 `@ads` E2E 만 안내한다
```bash
npx playwright test --grep "@ads" --project=chromium --project=mobile-chrome
```
   - 광고는 hydration 후 동적 삽입이라 **초기 HTML 문자열 검사로는 판정할 수 없다**

4. 크론 연결 검증 실행
```bash
npx tsx scripts/check-cron-links.ts
```

5. 결과를 요약 리포트로 출력:
- 통과/실패 항목 목록
- 실패 시 원인과 조치 방안 제시
- 크론 미연결 에이전트가 있으면 경고
