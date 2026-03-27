# 크롤러 Gotchas — 반복 실패 지점

1. **GitHub Actions에서 크롤러 실행 제안하지 말 것** — 네이버가 headless 봇을 탐지/차단. 크롤러는 반드시 로컬 Mac + launchd. CI에서는 analyze/curate만.

2. **execSync 대신 execFileSync** — 대량 출력 시 버퍼 오버플로우. stdio: 'inherit'로 출력 직접 전달.

3. **에이전트 직접 실행 금지** — `npx tsx agents/cafe/crawler.ts` 직접 실행 시 dotenv 미로드로 DB 연결 실패. 반드시 run-pipeline.ts 또는 run-local.ts 경유.

4. **쿠키 갱신은 수동** — storage-state.json의 네이버 로그인 쿠키는 자동 갱신 불가. 만료 시 Chrome에서 로그인 후 쿠키 재추출 필요.

5. **크롤러 설정 변경 시 launchd 재등록** — config.ts 변경 후 setup-cron.sh 재실행 필요.
