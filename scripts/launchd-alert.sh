#!/bin/bash
# launchd-alert.sh — 로컬 에이전트 실패 시 Slack #alert-system 알림
# Usage: launchd-alert.sh <label> <command...>
#
# 모든 로컬 plist가 이 래퍼를 거쳐 실행됨.
# 원본 명령이 exit code != 0 으로 종료되면 Slack으로 즉시 알림.

LABEL="$1"
shift

# 원본 명령 실행
"$@"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  ENV_FILE="/Users/yanadoo/Documents/New_Claude_agenotmatter/.env.local"
  if [ -f "$ENV_FILE" ]; then
    SLACK_TOKEN=$(grep "^SLACK_BOT_TOKEN=" "$ENV_FILE" | cut -d'=' -f2-)
    CHANNEL=$(grep "^SLACK_CHANNEL_ALERT_SYSTEM=" "$ENV_FILE" | cut -d'=' -f2-)
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

    curl -s -X POST "https://slack.com/api/chat.postMessage" \
      -H "Authorization: Bearer ${SLACK_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"channel\": \"${CHANNEL}\",
        \"text\": \"🚨 *로컬 에이전트 실패* — \`${LABEL}\`\n종료코드: ${EXIT_CODE}\n시각: ${TIMESTAMP} KST\n→ 터미널에서 로그 확인: ~/Documents/New_Claude_agenotmatter/logs/${LABEL}.log\"
      }" > /dev/null 2>&1 || true
  fi
fi

exit $EXIT_CODE
