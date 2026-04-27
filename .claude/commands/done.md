# /done — Gate 1 QA + 자동 커밋+푸시

작업 완료 시 호출. Gate 1 검증이 **전부 통과**하면 자동으로 커밋+푸시까지 완료한다.
이슈 발생 시 **Claude 대화창 + Slack #qa 알림** 후 중단.

사용법: /done [완료한 작업 설명]

---

## STEP 1: 변경 파일 파악

```bash
git diff --name-only HEAD
git status --short
```

변경 파일 목록을 보고 아래 Gate 1 검증 범위를 결정한다.

---

## STEP 2: Gate 1 자동 검증 (순서대로, 하나라도 실패 시 즉시 중단)

### 2-A. TypeScript 타입 체크 (항상 실행)

```bash
npx tsc --noEmit 2>&1
```

- ✅ PASS: 오류 0개
- ❌ FAIL: 오류 목록을 대화창에 표시 → Slack 알림 → **커밋 중단**

### 2-B. 크론 연결 무결성 (agents/ 또는 .github/workflows/ 변경 시)

```bash
npx tsx scripts/check-cron-links.ts 2>&1
```

- ✅ PASS: orphaned 핸들러 없음
- ❌ FAIL: orphaned 목록 표시 → Slack 알림 → **커밋 중단**
- 변경 없으면: 스킵 (✅ 해당없음으로 보고)

### 2-C. 빌드 확인 (agents/ 또는 .github/workflows/ 또는 prisma/ 변경 시)

```bash
npm run build 2>&1 | tail -20
```

- ✅ PASS: 빌드 성공
- ❌ FAIL: 오류 표시 → Slack 알림 → **커밋 중단**
- 변경 없으면: 스킵

### 2-D. AI 아키텍처 검토 (agents/ 또는 src/ 변경 시)

변경 파일 목록을 보고 다음을 직접 판단:
- constitution.yaml canWrite 규칙 위반 여부 (COO/QA/SEED 외에 DB write 없는지)
- 새 에이전트 파일이 runner.ts에 등록됐는지
- 레거시 영향: 변경 파일을 import하는 다른 파일 존재 여부 (Grep으로 확인)
- any 타입이 새로 추가됐는지

- ✅ PASS: 위반 없음
- ❌/⚠️ 이슈: 구체적 위반 내용 대화창 표시 → 심각하면 Slack 알림

### 2-E. 프로덕션 페이지 확인 (src/ 변경 시)

변경한 페이지를 WebFetch로 확인: `https://age-doesnt-matter.com[경로]`
- ✅ PASS: 200 응답
- 변경 없으면: 스킵

### 2-F. Feature Lifecycle (항상 실행 — 커밋 막지 않음, 경고만)

상세 규칙: `.claude/rules/feature-lifecycle.md`

1. `git diff --name-only HEAD` + `git status --short` 변경 파일 목록 확보
2. `docs/features/REGISTRY.md`의 PATH MAP과 대조 → 영향받는 Feature ID 식별
3. 작업 유형 판단:
   - **신규 기능** (untracked 파일 + REGISTRY 미등록): REGISTRY 행 추가 + `docs/features/{ID}-{name}.md` 생성
   - **기능 개선** (기존 파일 수정 + REGISTRY 등록됨): 해당 feature 문서 수정 이력 한 줄 추가 + REGISTRY 최근변경 날짜 갱신
   - **기능 제거** (파일 삭제): REGISTRY ARCHIVED 처리 + `.claude/rules/feature-lifecycle.md` 5-B 체크리스트 실행
   - **버그수정/리팩토링/설정변경/문서만 변경**: 스킵

- ✅ 처리됨: 완료 보고에 `Feature 문서: {ID} {기능명} — {작업유형}` 추가
- ⚠️ 미처리: 커밋은 진행하되 `⚠️ Feature 문서화 미완: {ID}` 경고 표시

---

## STEP 3: Gate 1 실패 시 Slack 알림

모든 Gate 1 검사 실패 시 아래 형식으로 Slack #qa에 알림을 보낸다:

```bash
cd agents && npx tsx -e "
import { sendSlackMessage } from './core/notifier.js';
await sendSlackMessage('QA', \`[Gate 1] ❌ 코드 게이트 실패 — 우나어(age-doesnt-matter)
──────────────────────────────────────
❌ [실패한 단계]: [오류 내용]
✅ [통과한 단계]: [상세]
──────────────────────────────────────
→ 커밋 보류됨. 위 문제 수정 후 /done 재실행하세요.\`);
process.exit(0);
" 2>/dev/null || echo "[Slack 알림 전송됨 또는 실패]"
cd ..
```

메시지 변수를 실제 결과로 채울 것.

**하나라도 실패 시 여기서 중단. 커밋하지 마라.**

---

## STEP 4: 전체 PASS → 자동 커밋+푸시

Gate 1이 전부 통과하면 **묻지 않고** 즉시 커밋+푸시한다.

```bash
# 변경 파일만 명시적으로 스테이징 (git add . 금지)
git add [변경된 파일들 나열]

# 커밋 메시지 작성 (50자 이내, 한국어, feat/fix/refine/perf 접두사)
git commit -m "$(cat <<'EOF'
[한 줄 커밋 메시지]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

git push origin main
```

---

## STEP 5: 완료 보고 (대화창)

**원칙: 성공은 조용히, 실패만 시끄럽게.**

커밋+푸시 완료 후 아래 형식으로 보고한다:

```
[커밋 메시지] — `[SHA]`
Gates: all passed | 배포: Vercel 자동 진행 중
앞으로 달라지는 것: [한 줄]
어드민 영향: 없음 / 있음(내용)  ← src 변경 시만
Feature 문서: [ID] [기능명] — [신규생성 / 수정이력추가 / ARCHIVED / 해당없음]
```

실패한 게이트가 있을 경우에만 추가:
```
❌ [단계]: [오류 요약 + 해결 방법]
```

**성공한 단계는 나열하지 않는다.** 전부 통과면 "Gates: all passed" 한 줄로 끝.

Slack에 별도 알림 불필요 (Gate 2가 배포 후 자동으로 #qa에 결과 전송).

---

## 예외 처리

- **창업자가 "커밋만"** 요청한 경우 → STEP 4에서 push 생략
- **긴급 핫픽스** (창업자가 "지금 바로 push해" 명시) → Gate 1 스킵 가능. 단 대화창에 "Gate 1 스킵됨" 명시
- **문서/메모리 파일만 변경** → Gate 1 STEP 2-A(tsc)만 실행
