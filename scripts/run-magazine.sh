#!/bin/zsh
# 매거진 자동 발행 — launchd 래퍼 스크립트
# SESSION_TIME, IMAGE_GENERATOR는 plist EnvironmentVariables에서 주입됨

export PATH="/Users/yanadoo/.nvm/versions/node/v24.14.0/bin:$PATH"

set -a
source /Users/yanadoo/Documents/New_Claude_agenotmatter/.env.local
set +a

# tsx CJS 훅 EAGAIN(errno -11) retry 패치 — Node.js v24 + tsx 조합 버그 우회
export NODE_OPTIONS="--require /Users/yanadoo/Documents/New_Claude_agenotmatter/agents/cafe/preload-eagain-retry.cjs"

/Users/yanadoo/.nvm/versions/node/v24.14.0/bin/npx tsx \
  /Users/yanadoo/Documents/New_Claude_agenotmatter/agents/cafe/local-magazine-runner.ts
