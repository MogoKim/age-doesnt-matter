#!/bin/bash
# 크롤러 상태 일괄 진단 스크립트
# 사용법: bash .claude/commands/runbook-crawler/scripts/diagnose.sh

PROJECT_DIR="/Users/yanadoo/Documents/New_Claude_agenotmatter"
LOG_FILE="$PROJECT_DIR/logs/cafe-crawler.log"

echo "=== 크롤러 진단 시작 ==="
echo ""

# 1. launchd 등록 상태
echo "--- [1] launchd 등록 상태 ---"
launchctl list 2>/dev/null | grep -i unao || echo "  launchd에 등록된 크롤러 없음"
echo ""

# 2. 최근 로그
echo "--- [2] 최근 로그 (마지막 20줄) ---"
if [ -f "$LOG_FILE" ]; then
  tail -20 "$LOG_FILE"
else
  echo "  로그 파일 없음: $LOG_FILE"
fi
echo ""

# 3. storage-state 쿠키 상태
echo "--- [3] storage-state.json 존재 여부 ---"
COOKIE_FILE="$PROJECT_DIR/agents/cafe/storage-state.json"
if [ -f "$COOKIE_FILE" ]; then
  COOKIE_SIZE=$(wc -c < "$COOKIE_FILE" | tr -d ' ')
  echo "  파일 존재 ($COOKIE_SIZE bytes)"
  # 쿠키 수 확인
  COOKIE_COUNT=$(python3 -c "import json; f=open('$COOKIE_FILE'); d=json.load(f); print(len(d.get('cookies',[])))" 2>/dev/null || echo "파싱 실패")
  echo "  쿠키 수: $COOKIE_COUNT"
else
  echo "  쿠키 파일 없음!"
fi
echo ""

# 4. 네이버 접근 가능 여부
echo "--- [4] 네이버 카페 접근 테스트 ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://cafe.naver.com" 2>/dev/null)
echo "  https://cafe.naver.com → HTTP $HTTP_CODE"
echo ""

# 5. Playwright 설치 상태
echo "--- [5] Playwright 브라우저 ---"
if command -v npx &> /dev/null; then
  npx playwright --version 2>/dev/null || echo "  Playwright 미설치"
else
  echo "  npx 미설치"
fi
echo ""

echo "=== 진단 완료 ==="
