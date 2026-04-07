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

커밋+푸시 완료 후 아래 형식으로 보고한다:

```
## Gate 1 통과 → 배포 완료

**검증 결과:**
- TypeScript: ✅ 오류 없음
- 크론 연결: ✅ / ⏭️ 해당없음
- 빌드: ✅ / ⏭️ 해당없음
- AI 아키텍처: ✅ / ⏭️ 해당없음

**커밋**: `[SHA]` "[커밋 메시지]"
**배포**: Vercel 자동 배포 진행 중 → Gate 2(post-deploy)가 배포 후 자동 실행됨

**앞으로 달라지는 것**: [한 줄]

**어드민 영향**: 없음 / 있음(내용) [src 변경 시 필수]
```

Slack에 별도 알림 불필요 (Gate 2가 배포 후 자동으로 #qa에 결과 전송).

---

## 예외 처리

- **창업자가 "커밋만"** 요청한 경우 → STEP 4에서 push 생략
- **긴급 핫픽스** (창업자가 "지금 바로 push해" 명시) → Gate 1 스킵 가능. 단 대화창에 "Gate 1 스킵됨" 명시
- **문서/메모리 파일만 변경** → Gate 1 STEP 2-A(tsc)만 실행
