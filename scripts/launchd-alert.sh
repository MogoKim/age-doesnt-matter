#!/bin/bash
# launchd-alert.sh — 로컬 에이전트 실패 시 Slack #alert-system 알림
# Usage: launchd-alert.sh <label> <command...>
#
# 모든 로컬 plist가 이 래퍼를 거쳐 실행됨.
# 원본 명령이 exit code != 0 으로 종료되면 Slack으로 즉시 알림.
#
# 작업 디렉토리(UNAO_WORKDIR):
#   개발 작업트리를 그대로 운영에 쓰다 보니, 브랜치가 main보다 한참 뒤처진 상태로
#   로컬 크론이 돌아 옛 코드가 실행되는 일이 있었다(2026-07-30). 운영 실행 경로를
#   개발 작업트리와 분리할 수 있도록 환경변수로 받는다.
#   plist의 EnvironmentVariables에 UNAO_WORKDIR을 넣으면 그 경로에서 실행된다.
#   미설정이면 기존 경로를 그대로 쓰므로 plist를 바꾸기 전까지 동작이 달라지지 않는다.

LABEL="$1"
shift

# UNAO_WORKDIR 미설정 시 쓰는 기존 경로 — plist 전환 전까지의 호환용.
DEFAULT_WORKDIR="/Users/yanadoo/Documents/New_Claude_agenotmatter"

if [ -n "${UNAO_WORKDIR}" ]; then
  WORKDIR="${UNAO_WORKDIR}"
  echo "[launchd-alert] ${LABEL} · workdir=${WORKDIR} (UNAO_WORKDIR)"
else
  WORKDIR="${DEFAULT_WORKDIR}"
  echo "[launchd-alert] ${LABEL} · workdir=${WORKDIR} (UNAO_WORKDIR 미설정 — 기본 경로 fallback)"
fi

# launchd → bash (TCC OK) → caffeinate (Mac 슬립 방지)
# caffeinate를 plist ProgramArguments 최상위에 두면 bash가 caffeinate의
# TCC security context를 상속받아 Documents/ getcwd() 실패(126)로 크롤러 실행 불가.
# 해결: plist는 /bin/bash 직접 실행, caffeinate는 이 스크립트 내부에서 래핑.
cd "${WORKDIR}" || {
  echo "[launchd-alert] 작업 경로로 이동 실패: ${WORKDIR}" >&2
  exit 1
}

# caffeinate -i 로 Mac 슬립 방지하면서 원본 명령 실행
caffeinate -i "$@"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  ENV_FILE="${WORKDIR}/.env.local"
  if [ -f "$ENV_FILE" ]; then
    SLACK_TOKEN=$(grep "^SLACK_BOT_TOKEN=" "$ENV_FILE" | cut -d'=' -f2-)
    CHANNEL=$(grep "^SLACK_CHANNEL_ALERT_SYSTEM=" "$ENV_FILE" | cut -d'=' -f2-)
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

    curl -s -X POST "https://slack.com/api/chat.postMessage" \
      -H "Authorization: Bearer ${SLACK_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"channel\": \"${CHANNEL}\",
        \"text\": \"🚨 *로컬 에이전트 실패* — \`${LABEL}\`\n종료코드: ${EXIT_CODE}\n시각: ${TIMESTAMP} KST\n작업경로: ${WORKDIR}\n→ 터미널에서 로그 확인: ${WORKDIR}/logs/${LABEL}.log\"
      }" > /dev/null 2>&1 || true
  fi
fi

exit $EXIT_CODE
