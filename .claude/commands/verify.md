프로덕션 검증 — 변경사항이 실제로 프로덕션에서 동작하는지 확인합니다. '검증해줘', '확인해줘', '진짜 되는지 봐줘' 등을 말할 때 사용합니다.

## 실행 순서

### 1. 빌드 검증
- `npx tsc --noEmit` 실행

### 2. 프로덕션 페이지 응답 검증
- 변경한 페이지 경로를 WebFetch로 200 확인
- 변경 없으면 홈(`/`) + 베스트(`/best`) + 일자리(`/jobs`) 최소 확인

### 3. Smoke Test
- `npm run smoke-test -- --url https://age-doesnt-matter.com`
- AdSense 메타태그, 광고 슬롯, 쿠팡 배너, Health API 전부 체크

### 4. 크론/에이전트 연결 검증
- `npx tsx scripts/check-cron-links.ts`
- orphaned 핸들러가 있으면 경고 (LOCAL ONLY/DISPATCH ONLY 포함)
- 새 크론 추가했으면: GitHub Actions에서 해당 워크플로우가 활성화되어 있는지 `gh workflow list`로 확인

### 5. 에이전트 실행 결과 검증 (에이전트 변경 시)
- 해당 에이전트의 최근 실행 기록 확인: `gh run list --workflow=agents-daily.yml --limit=3`
- BotLog에 최근 기록이 있는지 확인 (가능하면)
- Slack #에이전트 채널에 최근 알림이 있는지 확인 (가능하면)

### 6. 어드민 영향도
- src/app/(main)/, src/components/, prisma/ 변경 여부 확인
- 변경 있으면 어드민 영향 한 줄 명시

### 7. 결과 리포트
- 각 항목 ✅/❌ 표시
- 실패 항목 있으면 원인과 조치 방안 제시
- "이것으로 프로덕션에서 [X]가 실제로 동작함을 확인했습니다" 또는 "아직 확인 불가: [Y] 때문"
