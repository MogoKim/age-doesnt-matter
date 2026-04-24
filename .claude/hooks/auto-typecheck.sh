#!/bin/bash
# PostToolUse Write|Edit 후 자동 실행 — .ts/.tsx 파일 변경 시만 tsc 체크
# 에러 발견 시 Claude 대화창에 additionalContext로 표시
# async: true — Claude를 블로킹하지 않음

INPUT=$(cat)

# tool_input에서 파일 경로 추출 (Write: file_path, Edit: file_path)
FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    inp = d.get('tool_input', {})
    print(inp.get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# .ts/.tsx 파일 변경 시만 실행 (테스트 파일, 설정 파일 포함)
if [[ "$FILE" == *.ts ]] || [[ "$FILE" == *.tsx ]]; then
    cd "$CLAUDE_PROJECT_DIR"

    # tsc 실행 (최대 30줄로 제한, skipLibCheck로 속도 향상)
    RESULT=$(npx tsc --noEmit --skipLibCheck 2>&1 | head -30)
    EXIT_CODE=$?

    if [ $EXIT_CODE -ne 0 ]; then
        # 에러를 JSON-safe 문자열로 변환
        ESCAPED_RESULT=$(echo "$RESULT" | python3 -c "
import sys, json
content = sys.stdin.read()
print(json.dumps(content))
" 2>/dev/null)

        echo "{\"hookSpecificOutput\": {\"hookEventName\": \"PostToolUse\", \"additionalContext\": \"⚠️ TypeScript 에러 발견 (${FILE}):\\n${RESULT}\"}}"
    fi
fi

exit 0
