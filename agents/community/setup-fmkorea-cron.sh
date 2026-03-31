#!/bin/bash
# 펨코 시트 스크래퍼 — macOS launchd 설정
# 하루 2회: 11:30, 21:30 KST (GA sheet-scraper 30분 후)
# 펨코는 Cloudflare가 해외 IP를 차단하므로 로컬 Mac(한국 IP)에서 실행
#
# 사용법:
#   chmod +x agents/community/setup-fmkorea-cron.sh
#   ./agents/community/setup-fmkorea-cron.sh
#
# 해제:
#   launchctl unload ~/Library/LaunchAgents/com.unao.fmkorea-scraper.plist

PLIST_NAME="com.unao.fmkorea-scraper"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

# npx 경로 자동 감지 (Homebrew, nvm 등 다양한 환경 대응)
NPX_PATH=$(which npx 2>/dev/null)
if [ -z "$NPX_PATH" ]; then
  echo "❌ npx를 찾을 수 없습니다. Node.js가 설치되어 있는지 확인하세요."
  exit 1
fi

# Node.js 경로도 필요 (PATH에 포함)
NODE_DIR=$(dirname "$NPX_PATH")

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NPX_PATH}</string>
        <string>tsx</string>
        <string>${PROJECT_DIR}/agents/community/run-local-fmkorea.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>

    <key>StartCalendarInterval</key>
    <array>
        <!-- 11:30 KST (오전 — GA 11:00 이후) -->
        <dict>
            <key>Hour</key>
            <integer>11</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <!-- 21:30 KST (저녁 — GA 21:00 이후) -->
        <dict>
            <key>Hour</key>
            <integer>21</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
    </array>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/fmkorea-scraper.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/fmkorea-scraper-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${NODE_DIR}:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
</dict>
</plist>
EOF

echo "✅ plist 생성: $PLIST_PATH"

# 기존 등록 해제 후 재등록
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ launchd 등록 완료 — 하루 2회 (11:30, 21:30) 실행"
echo ""
echo "📂 로그: $LOG_DIR/fmkorea-scraper.log"
echo "🔧 해제: launchctl unload $PLIST_PATH"
echo "🧪 수동 테스트: npx tsx agents/community/run-local-fmkorea.ts"
