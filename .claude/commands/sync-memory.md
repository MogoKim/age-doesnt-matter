메모리 동기화 — 새 대화를 시작할 때, 또는 메모리와 실제 코드/git 상태가 불일치할 수 있을 때 사용합니다. 사용자가 '메모리 확인', '동기화' 등을 말할 때도 트리거됩니다.

⚠️ repo `memory/`는 stale 잔재다. 읽지도 갱신하지도 마라. 장기 메모리는 CC auto-memory(`/memory`)가 정본이다.

1. CC auto-memory(`/memory`)의 현재 상태 항목을 확인하세요.
2. `git fetch origin main` 후 `git log --oneline -10 origin/main`으로 최근 반영분을 확인하세요.
3. `git status --short`로 현재 변경사항을 확인하세요.
4. auto-memory 내용이 실제 git·운영 상태와 일치하는지 검증하세요.
5. 불일치가 있으면 auto-memory를 갱신하세요. 근거는 git·CI·운영 데이터 실측으로 잡으세요.
6. 결과를 보고하세요.
