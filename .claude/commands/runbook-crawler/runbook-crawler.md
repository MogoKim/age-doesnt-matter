크롤러 장애 대응 런북 — 카페 크롤링이 실패하거나, 크롤러 관련 에러가 발생할 때 사용합니다. '크롤링 실패', '카페 에러', 'ETIMEDOUT', 'Playwright 에러' 등이 언급될 때 트리거됩니다.

## 진단 순서

1. **로그 확인**: `cat /Users/yanadoo/Documents/New_Claude_agenotmatter/logs/cafe-crawler.log | tail -50`
2. **프로세스 확인**: `launchctl list | grep unao`
3. **storage-state 쿠키 만료 확인**: `agents/cafe/storage-state.json`의 쿠키 expires 날짜
4. **네트워크 확인**: `curl -I https://cafe.naver.com`

## 주요 장애 유형

| 증상 | 원인 | 해결 |
|------|------|------|
| ETIMEDOUT | stdout 버퍼 오버플로우 | `execFileSync` + `stdio: 'inherit'` (이미 수정됨) |
| 로그인 필요 페이지 | 쿠키 만료 | storage-state.json 쿠키 갱신 |
| 빈 결과 (0건) | 카페 구조 변경 또는 셀렉터 깨짐 | crawler.ts 셀렉터 확인 |
| Playwright crash | 브라우저 업데이트 필요 | `npx playwright install chromium` |

## 참조 파일
- `references/known-issues.md` — 과거 발생한 문제와 해결책
- `scripts/diagnose.sh` — 크롤러 상태 일괄 진단 스크립트
- `gotchas.md` — 반복 실패 지점

## 중요: 크롤러는 반드시 로컬 Mac에서 실행
GitHub Actions에서 크롤러 실행하면 네이버가 차단. CI에서는 analyze + curate만 실행.
