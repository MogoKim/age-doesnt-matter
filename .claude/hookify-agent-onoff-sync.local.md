---
name: agent-onoff-env-sync
enabled: true
event: bash
pattern: ENABLE_.*\s*=\s*['"](true|false)['"]
action: warn
---

⚠️ **에이전트 ON/OFF 환경변수 변경 감지**

GHA 워크플로우(`.github/workflows/agents-*.yml`)의 env 변수를 변경할 때는
**반드시 `.env.local`에도 동일하게 반영**해야 합니다.

한 곳만 바꾸면 한 환경에서는 ON, 다른 환경에서는 OFF인 불일치 상태가 됩니다.

**체크리스트:**
- [ ] `.github/workflows/agents-*.yml` env 섹션 변경
- [ ] `.env.local` 동일 키 변경
- [ ] `docs/handover-cafe-pipeline.html §13` 상태 업데이트
