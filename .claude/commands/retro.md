# /retro — 주간 회고

지난 7일을 데이터로 돌아보는 스킬.
감상이 아닌 숫자와 사실로 이번 주를 정리하고 다음 주를 준비.

## 트리거 조건
- "회고", "이번 주 어땠어", "retro", "주간 리뷰"
- "지난 주 정리해줘"

---

## STEP 1: 데이터 수집

```bash
# 1. 최근 7일 커밋 목록
git log --since="7 days ago" --oneline --format="%h %ai %s"

# 2. 변경된 파일 핫스팟 (자주 바뀐 파일 = 불안정 영역)
git log --since="7 days ago" --format="" --name-only | grep -v '^$' | sort | uniq -c | sort -rn | head -10

# 3. 커밋 타입 분포 (feat/fix/refactor/chore/docs)
git log --since="7 days ago" --format="%s" | grep -oE '^[a-z]+' | sort | uniq -c | sort -rn

# 4. 이번 주 변경 규모
git log --since="7 days ago" --format="" --numstat | awk '{add+=$1; del+=$2} END {print "추가:", add, "/ 삭제:", del}'
```

```bash
# 5. 에이전트 BotLog 7일 성공/실패 집계
npx tsx -e "
const {prisma} = await import('./agents/core/db.js');
const start = new Date(Date.now() - 7*24*60*60*1000);
const logs = await prisma.botLog.groupBy({
  by: ['botType', 'status'],
  where: {createdAt: {gte: start}},
  _count: true
});
const summary = {};
logs.forEach(l => {
  if (!summary[l.botType]) summary[l.botType] = {SUCCESS: 0, FAILED: 0};
  summary[l.botType][l.status] = l._count;
});
Object.entries(summary).sort().forEach(([k,v]) => 
  console.log(k, '| 성공:', v.SUCCESS, '| 실패:', v.FAILED, '| 성공률:', Math.round(v.SUCCESS/(v.SUCCESS+v.FAILED)*100)+'%')
);
await prisma.\$disconnect();
" 2>/dev/null || echo "BotLog 조회 불가"

# 6. 보류 중인 작업 확인
cat memory/project_deferred_tasks.md 2>/dev/null || echo "보류 작업 없음"
```

---

## STEP 2: 이슈/장애 탐지

```bash
# 최근 7일 FAILED BotLog 상세
npx tsx -e "
const {prisma} = await import('./agents/core/db.js');
const start = new Date(Date.now() - 7*24*60*60*1000);
const fails = await prisma.botLog.findMany({
  where: {status: 'FAILED', createdAt: {gte: start}},
  orderBy: {createdAt: 'desc'},
  take: 10,
  select: {botType: true, action: true, details: true, createdAt: true}
});
fails.forEach(l => console.log(l.createdAt.toISOString().slice(0,16), l.botType, l.action, '|', (l.details??'').slice(0,80)));
await prisma.\$disconnect();
" 2>/dev/null || echo "실패 로그 없음"
```

---

## STEP 3: 회고 출력

```
## 주간 회고 — YYYY-MM-DD ~ YYYY-MM-DD

### 숫자로 보기
| 지표 | 값 |
|------|---|
| 커밋 수 | N개 |
| 추가 LOC | +N |
| 삭제 LOC | -N |
| 가장 많이 변경된 파일 | 파일명 (N회) |
| 에이전트 실행 (7일) | N회 |
| 에이전트 성공률 | N% |

### 완료한 것
- [feat] ...
- [fix] ...

### 에이전트 상태
| 에이전트 | 성공 | 실패 | 주요 이슈 |
|---------|-----|-----|---------|
| CMO | N | N | - |
| CEO | N | N | - |
...

### 문제/장애
- [있으면 명시 / 없으면 "없음"]

### 보류 중인 작업
[project_deferred_tasks.md 내용 요약]

### 다음 주 집중 사항
1. [가장 중요한 것]
2. [두 번째]
3. [세 번째]
```
