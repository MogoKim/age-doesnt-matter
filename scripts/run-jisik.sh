#!/bin/bash
# 지식인 자동 답변 — launchd 래퍼 스크립트
# .env.local 환경변수 로드 후 실행

set -a
source /Users/yanadoo/Documents/New_Claude_agenotmatter/.env.local
set +a

/Users/yanadoo/.nvm/versions/node/v24.14.0/bin/npx tsx \
  /Users/yanadoo/Documents/New_Claude_agenotmatter/agents/cmo/jisik-answerer.ts
