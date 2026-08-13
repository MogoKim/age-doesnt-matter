현재 프로젝트 상태 확인 — 사용자가 '지금 어디까지 했지?', '현재 상태', '뭐 남았어?' 등 프로젝트 진행 상황을 물어볼 때 사용합니다.

⚠️ repo `memory/`는 stale 잔재다. 읽지도 갱신하지도 마라.

1. `git fetch origin main` 후 `git log --oneline -10 origin/main`으로 최근 반영분을 확인하세요.
2. `git status --short`와 현재 브랜치로 진행 중인 작업을 확인하세요.
3. 열린 PR·CI는 `gh pr list`, `gh run list --limit 5`로 확인하세요.
4. 장기 컨텍스트가 필요하면 CC auto-memory(`/memory`)를 참고하세요.
5. 위 정보를 종합하여 창업자에게 간결하게 보고하세요:
   - 마지막 완료 작업
   - 현재 진행 중인 작업
   - 다음 해야 할 작업 (우선순위 순)
