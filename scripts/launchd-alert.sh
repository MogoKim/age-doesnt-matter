#!/bin/bash
# launchd-alert.sh — 로컬 에이전트 실패 시 Slack #alert-system 알림
# Usage: launchd-alert.sh <label> <command...>
#
# 모든 로컬 plist가 이 래퍼를 거쳐 실행됨.
# 원본 명령이 exit code != 0 으로 종료되면 Slack으로 즉시 알림.

LABEL="$1"
shift

# launchd → bash (TCC OK) → caffeinate (Mac 슬립 방지)
# caffeinate를 plist ProgramArguments 최상위에 두면 bash가 caffeinate의
# TCC security context를 상속받아 Documents/ getcwd() 실패(126)로 크롤러 실행 불가.
# 해결: plist는 /bin/bash 직접 실행, caffeinate는 이 스크립트 내부에서 래핑.
cd /Users/yanadoo/Documents/New_Claude_agenotmatter || exit 1

# caffeinate -i 로 Mac 슬립 방지하면서 원본 명령 실행
caffeinate -i "$@"
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
