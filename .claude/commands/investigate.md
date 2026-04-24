# /investigate — Iron Law 버그 근본 원인 분석

## Iron Law
**근본 원인 없이 수정 없다.**
증상만 치료하고 원인을 모르면 같은 버그가 반드시 재발한다.

## 트리거 조건
- "왜 이게 안되지", "버그 찾아줘", "이 에러 왜 나"
- "디버그해줘", "investigate", "에이전트가 자꾸 실패해"
- 에러 메시지를 붙여넣었을 때

---

## Phase 1: 증상 수집

에러 메시지 원문 보존. 추측으로 수정 시작 금지.

```bash
# 최근 실패한 BotLog (에이전트 관련 버그)
npx tsx -e "
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {prisma} = await import('./agents/core/db.js');
const logs = await prisma.botLog.findMany({
  where: {status: 'FAILED'},
  orderBy: {createdAt: 'desc'},
  take: 10,
  select: {botType: true, action: true, details: true, createdAt: true}
});
logs.forEach(l => console.log(l.createdAt.toISOString().slice(0,16), l.botType, l.action, '|', (l.details??'').slice(0,100)));
await prisma.\$disconnect();
" 2>/dev/null || echo "BotLog 조회 불가 — 일반 버그일 수 있음"

# 최근 커밋 히스토리
git log --oneline -15

# 최근 변경된 파일
git diff HEAD~5 --stat 2>/dev/null || git diff --stat
```

수집할 정보:
- 에러 메시지 **원문** (요약 금지)
- 최초 발생 시점 (언제부터?)
- 재현 조건 (항상 발생? 특정 조건?)
- 최근 변경 사항과 시점 일치 여부

---

## Phase 2: 분석

수집한 증상을 바탕으로 분석:

1. **최근 커밋 관련성**: 에러 발생 시점과 가장 가까운 커밋은 무엇인가?
2. **파일 변경 추적**: 관련 파일이 최근에 변경됐는가?
   ```bash
   git log --oneline --follow -10 -- [의심 파일 경로]
   ```
3. **환경 변수**: 환경변수/외부 API 설정이 변경됐는가?
4. **패턴 매칭**: 비슷한 과거 실패가 BotLog에 있는가?

---

## Phase 3: 가설 (최대 3개)

각 가설에 대해 아래 형식으로:

```
가설 N: [1줄 설명]
검증 방법: [어떻게 확인할지]
검증 실행: [실제 확인]
결과: 확인됨 / 불일치
```

가설이 확인되면 Phase 4로. 불일치면 다음 가설.
**3가지 모두 실패하면 → BLOCKED 형식으로 에스컬레이션.**

---

## Phase 4: 구현

**근본 원인 확인 후에만 수정.**

수정 전 체크:
- [ ] 원인이 명확히 특정됐는가?
- [ ] 수정이 다른 기능에 영향을 주는가?
- [ ] 회귀 방지 방법이 있는가?

수정 후 체크:
```bash
npx tsc --noEmit    # 타입 깨지지 않았는가?
npx eslint . --ext .ts,.tsx  # 린트 통과
```

---

## 출력 형식

```
## Investigate: [버그 제목]

증상: [에러 메시지 원문 + 발생 컨텍스트]
최초 발생: [시점]
재현 조건: [조건]

조사 경로: BotLog → git log → 코드 추적

가설 1: [설명] → 결과: 확인됨 / 불일치
가설 2: [설명] → 결과: 확인됨 / 불일치
가설 3: [설명] → 결과: 확인됨 / 불일치

ROOT CAUSE: [원인 명시 — 1-2문장]
FIX: [수정 내용 + 근거]
REGRESSION CHECK: [재발 방지 방법]
```

---

## 3회 가설 모두 실패 시 에스컬레이션

```
STATUS: BLOCKED

REASON:
[근본 원인을 특정하지 못한 이유 1-2문장]

ATTEMPTED:
1. [시도한 가설 1]
2. [시도한 가설 2]
3. [시도한 가설 3]

RECOMMENDATION:
[사용자가 직접 해야 하는 것 — 구체적으로]
예: "X 서비스 대시보드에서 최근 에러 로그를 확인해주세요"
예: "로컬에서 npm run dev 실행 후 [URL] 접근 시 콘솔 에러를 붙여넣어주세요"
```
