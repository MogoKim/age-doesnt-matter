# 에이전트 라이프사이클 규칙 (Orphaned Script 방지)

## 에이전트 스크립트 작성 시 필수 체크리스트

### 1. Runner 등록
- agents/ 디렉토리에 실행 가능한 스크립트(main() + process.exit 패턴) 생성 시
- 반드시 `agents/cron/runner.ts` HANDLERS 맵에 핸들러 등록
- 형식: `'에이전트:태스크': () => import('../경로.js').then(() => {})`

### 2. 크론 스케줄 연결
- runner.ts에 등록한 핸들러는 반드시 아래 중 하나:
  - `.github/workflows/agents-*.yml` 파일에 크론 스케줄 추가
  - 또는 `// DISPATCH ONLY — 사유: (예: Band API 심사중)` 주석으로 미연결 사유 명시

### 3. 로컬 전용 스크립트
- GitHub Actions에서 실행할 수 없는 스크립트(네이버 크롤러 등)는
- 파일 최상단에 `// LOCAL ONLY — 사유` 주석 필수

### 4. 비용 영향
- 유료 API(DALL-E, Claude, Perplexity) 호출하는 에이전트는
- PR 설명 또는 커밋 메시지에 월간 비용 영향 명시
- 예: "DALL-E $0.04/장 × 2장/기사 × 3회/일 = ~$7.20/월 추가"

### 5. 워크플로우 파일 구조
- 새 크론 추가 시: agents-*.yml의 `determine` 스텝에 case 추가
- env 섹션에 필요한 환경변수 추가 (secrets 참조)
- Playwright 필요 시: `npx playwright install chromium --with-deps` 스텝 추가

## 위반 시
- 코드만 작성하고 크론 미연결 = "끊긴 파이프라인" → 실제 운영에 반영 안 됨
- 이전 사례: external-crawler.ts가 3주간 미연결 상태로 방치됨
