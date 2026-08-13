#!/bin/bash
# launchd-alert.sh — 로컬 에이전트 실패 시 Slack #alert-system 알림
# Usage: launchd-alert.sh <label> <command...>
#
# 모든 로컬 plist가 이 래퍼를 거쳐 실행됨.
# 원본 명령이 exit code != 0 으로 종료되면 Slack으로 즉시 알림.
#
# 작업 디렉토리(UNAO_WORKDIR) — **필수**:
#   plist의 EnvironmentVariables에 UNAO_WORKDIR을 넣으면 그 경로에서 실행된다.
#   운영 크론=unao-prod / 네이버 스크래퍼=unao-ops. 개발 작업트리를 넣지 마라.
#   UNAO_WORKDIR 미설정 시 old workspace fallback으로 새 코드+옛 의존성이 섞이는
#   사고를 막기 위해 즉시 실패한다(2026-07-30 사고 재발 방지).

LABEL="$1"
shift

# 설정 오류 전용 종료코드(EX_CONFIG) — 일반 실패(1)와 구분해 식별한다.
EX_CONFIG=78

# 이 스크립트가 속한 작업트리. plist가 `<트리>/scripts/launchd-alert.sh`를 절대경로로
# 지목하므로 항상 운영 트리를 가리킨다. UNAO_WORKDIR이 없을 때 Slack 토큰 조회용으로만 쓴다.
SELF_TREE="$(cd "$(dirname "$0")/.." && pwd)"

# Slack 알림 — $1=토큰을 찾을 트리, $2=본문
notify_slack() {
  ENV_FILE="$1/.env.local"
  [ -f "$ENV_FILE" ] || return 0
  SLACK_TOKEN=$(grep "^SLACK_BOT_TOKEN=" "$ENV_FILE" | cut -d'=' -f2-)
  CHANNEL=$(grep "^SLACK_CHANNEL_ALERT_SYSTEM=" "$ENV_FILE" | cut -d'=' -f2-)
  [ -n "$SLACK_TOKEN" ] && [ -n "$CHANNEL" ] || return 0
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer ${SLACK_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"channel\": \"${CHANNEL}\", \"text\": \"$2\"}" > /dev/null 2>&1 || true
}

# UNAO_WORKDIR은 필수다. cd 이전에 검사해 옛 경로로 떨어지는 길을 아예 없앤다.
if [ -z "${UNAO_WORKDIR}" ]; then
  echo "[launchd-alert] ${LABEL} · FATAL: UNAO_WORKDIR 미설정 — 실행 중단." >&2
  echo "  → plist의 EnvironmentVariables에 UNAO_WORKDIR를 추가하라 (운영: unao-prod / 스크래퍼: unao-ops)." >&2
  notify_slack "$SELF_TREE" "🚨 *로컬 에이전트 설정 오류* — \`${LABEL}\`\nUNAO_WORKDIR 미설정으로 실행하지 않았다.\n시각: $(date '+%Y-%m-%d %H:%M:%S') KST\n→ plist의 EnvironmentVariables에 UNAO_WORKDIR 추가 필요 (종료코드 ${EX_CONFIG})"
  exit $EX_CONFIG
fi

WORKDIR="${UNAO_WORKDIR}"
echo "[launchd-alert] ${LABEL} · workdir=${WORKDIR} (UNAO_WORKDIR)"

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
  TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
  notify_slack "$WORKDIR" "🚨 *로컬 에이전트 실패* — \`${LABEL}\`\n종료코드: ${EXIT_CODE}\n시각: ${TIMESTAMP} KST\n작업경로: ${WORKDIR}\n→ 터미널에서 로그 확인: ${WORKDIR}/logs/${LABEL}.log"
fi

exit $EXIT_CODE
