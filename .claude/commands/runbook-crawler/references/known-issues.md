# 크롤러 알려진 문제 히스토리

## 1. execSync 버퍼 오버플로우 (2026-03-27 해결)
**증상:** run-pipeline.ts에서 ETIMEDOUT
**원인:** `execSync` + `stdio: pipe` → 카페 3곳 50+글 처리 시 stdout 버퍼(~1MB) 초과 → 자식 프로세스 블로킹
**해결:** `execFileSync` + `stdio: 'inherit'`으로 변경. 출력 캡처 불필요 시 항상 inherit.

## 2. Playwright storageState 쿠키 타입 불일치
**증상:** 쿠키 로드 시 타입 에러
**원인:** secure/httpOnly 필드가 number(0/1)로 저장됨. Playwright는 boolean만 허용.
**해결:** crawler.ts line 46-51에 `Boolean()` 정규화 방어 코드 구현됨.

## 3. headless 탐지 차단
**증상:** 크롤링 결과 0건 또는 로그인 페이지로 리다이렉트
**원인:** 네이버가 headless 브라우저 탐지
**해결:** headless: false로 실행. 반드시 macOS 로그인 상태에서 launchd로 실행.

## 4. dotenv 미로드
**증상:** DB 연결 실패 (DATABASE_URL undefined)
**원인:** agents/core/db.ts는 자체적으로 dotenv 로드하지 않음
**해결:** 반드시 run-pipeline.ts 또는 run-local.ts를 통해 실행 (이들이 .env.local 로드)
