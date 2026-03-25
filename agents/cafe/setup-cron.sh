#!/bin/bash
# 카페 크롤링 파이프라인 — macOS launchd 설정
# 하루 3회: 08:30 KST, 12:30 KST, 18:30 KST
#
# 사용법:
#   chmod +x agents/cafe/setup-cron.sh
#   ./agents/cafe/setup-cron.sh
#
# 해제:
#   launchctl unload ~/Library/LaunchAgents/com.unao.cafe-crawler.plist

PLIST_NAME="com.unao.cafe-crawler"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>tsx</string>
        <string>${PROJECT_DIR}/agents/cafe/run-pipeline.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>

    <key>StartCalendarInterval</key>
    <array>
        <!-- 08:30 KST (아침) -->
        <dict>
            <key>Hour</key>
            <integer>8</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <!-- 12:30 KST (점심) -->
        <dict>
            <key>Hour</key>
            <integer>12</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <!-- 18:30 KST (저녁) -->
        <dict>
            <key>Hour</key>
            <integer>18</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
    </array>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/cafe-crawler.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/cafe-crawler-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
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

echo "✅ launchd 등록 완료 — 하루 3회 (08:30, 12:30, 18:30) 실행"
echo ""
echo "📂 로그: $LOG_DIR/cafe-crawler.log"
echo "🔧 해제: launchctl unload $PLIST_PATH"
echo "🧪 수동 테스트: npx tsx agents/cafe/run-pipeline.ts"
