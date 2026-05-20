---
name: cafe-crawler-direct-exec
enabled: true
event: bash
pattern: npx tsx agents/cafe/crawler
action: block
---

⚠️ **카페 크롤러 직접 실행 차단**

`agents/cafe/crawler.ts`를 직접 실행하면 dotenv가 로드되지 않아 DB 연결이 실패합니다.

**올바른 실행 방법:**
```bash
npx tsx agents/cafe/run-pipeline.ts
# 또는
npx tsx agents/cafe/run-local.ts
```

또한 크롤러는 **반드시 로컬 Mac + launchd**에서만 실행해야 합니다.
GitHub Actions에서 실행 시 네이버가 headless 봇을 탐지/차단합니다.
