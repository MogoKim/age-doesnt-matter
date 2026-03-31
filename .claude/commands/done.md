작업 완료 처리 — 사용자가 '다 했어', '끝', '완료' 등 작업 완료를 선언하거나 /done을 호출할 때 사용합니다.

사용법: /done [완료한 작업 설명]

## 1. 작업 확인
사용자가 입력한 작업 설명을 확인하세요: $ARGUMENTS

## 2. 검증 실행 (필수, 스킵 불가)

### 2a. 빌드 검증
- `npx tsc --noEmit` 실행 → 실패 시 중단, "완료 불가" 보고

### 2b. 프로덕션 페이지 검증 (페이지/컴포넌트 변경 시)
- 변경한 페이지를 WebFetch로 200 응답 확인
- 변경 없으면 홈(`https://age-doesnt-matter.com/`) 최소 확인

### 2c. 크론/에이전트 검증 (agents/ 또는 .github/workflows/ 변경 시)
- `npx tsx scripts/check-cron-links.ts` 실행
- 새 핸들러 추가했으면: 워크플로우 case문에도 추가했는지 확인
- 새 크론 스케줄 추가했으면: cron expression이 의도한 시간(KST→UTC 변환)과 맞는지 확인
- 에이전트 실행 결과가 실제로 DB/Slack에 기록되는지 확인 방법 명시

### 2d. 광고/인프라 검증 (광고 컴포넌트 또는 next.config.js 변경 시)
- `npm run smoke-test -- --url https://age-doesnt-matter.com` 실행

### 2e. 어드민 영향도 (서비스 코드 변경 시)
- src/app/(main)/, src/components/, prisma/schema.prisma 변경 여부 확인
- 변경 있으면 "어드민 영향: 없음/있음(내용)" 한 줄 명시

**하나라도 실패 → "완료 불가: [X] 미통과" 보고 후 중단. 절대 완료 처리하지 마라.**

## 3. memory 업데이트
- memory/project_status.md를 읽고, 해당 작업을 ✅ 완료로 업데이트

## 4. 완료 보고 (필수 형식)
- 뭘 했는지
- 검증 결과: tsc ✅/❌, 페이지 ✅/❌, 크론 ✅/❌/해당없음, smoke ✅/❌/해당없음
- 앞으로 뭐가 달라지는지
- 커밋 여부: 커밋 안 했으면 "커밋할까요?" 제안
