---
description: 거울 보드 — 실제 git/CI/HTTP 상태로 5분류 운영현황 보고 (문서·기억 아닌 probe 실측)
---

# /board — 거울 보드 실측 5분류

## 실행 순서

1. **`npx tsx scripts/ops-board/cli.ts` 실행** (read-only probe만 — DB 접근 없음)
2. 출력은 git/CI/HTTP **probe 실측** 결과다. `OPERATING_BACKLOG.md`·기억·이전 보고를 **믿지 말고 이 출력만 근거**로 보고한다. (이게 이 명령의 존재 이유)
3. 결과를 아래 **5분류**로 정리해 사용자에게 보고:
   1. **완료됨**
   2. **배포 완료, 적용 확인만 남음**
   3. **지금 바로 할 수 있음**
   4. **백로그 — 고객 임팩트/리텐션 기준**
   5. **제외/무시**
4. 각 항목에 **상태 / 다음 액션 / 트리거·PASS 기준** 포함.
5. probe가 `ok:null`(판정불가)이면 **"확인 불가"**로 표시. 절대 "미완료"로 단정하지 않는다.

## 주의 (drift 방지)

- 1단계 카드는 **5개**(MAGAZINE/JOB 차단·SHEET v1.5·EventLog v1·Agent DB 포화·속도캐시). 이들은 cli 실측으로 판정된다.
- **DB proof가 필요한 항목**(BOT 0건/EventLog 기록 등)은 REVIEW(=2.배포완료·적용확인)에서 멈춘다. DB probe는 2단계(read-only role 발급 후)에서 추가된다.
- cli 카드에 없는 나머지 백로그 항목은 `docs/backlog/OPERATING_BACKLOG.md`를 참고하되, **"이 문서는 손 갱신이라 stale 가능"**을 반드시 명시한다. cli 실측 항목과 문서 항목을 섞지 말고 출처를 구분해 보고한다.
- 보고 끝에 시각적 실시간 칸반 안내: **`npm run board` → http://127.0.0.1:4321**

## 절대 금지
- probe 출력 없이 기억·문서로 5분류를 만들지 않는다.
- DB·prisma 조회를 끼워넣지 않는다(1단계 범위 밖).
