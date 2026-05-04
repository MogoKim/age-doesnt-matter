#!/bin/zsh
# 매거진 자동 발행 — launchd 래퍼 스크립트
# SESSION_TIME, IMAGE_GENERATOR는 plist EnvironmentVariables에서 주입됨

set -a
source /Users/yanadoo/Documents/New_Claude_agenotmatter/.env.local
set +a

/Users/yanadoo/.nvm/versions/node/v24.14.0/bin/npx tsx \
  /Users/yanadoo/Documents/New_Claude_agenotmatter/agents/cafe/local-magazine-runner.ts
