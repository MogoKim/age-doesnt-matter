# QA 버그 리포트 — 2026. 4. 4.

## 요약
| 항목 | 수치 |
|------|------|
| 전체 테스트 | 84개 |
| 통과 | ✅ 75개 |
| 실패 | ❌ 9개 |
| Skip | ⏭️ 0개 |
| 실행 시간 | 107초 |

## P0 — 즉시 수정 (기능 완전 불동작)

### qa/01-public-pages.spec.ts > 홈 페이지 — 네비게이션 메뉴 존재
- **파일**: `qa/01-public-pages.spec.ts`
- **오류**: ```
TimeoutError: page.waitForLoadState: Timeout 15000ms exceeded.
```
### qa/01-public-pages.spec.ts > 홈 페이지 — 최신글 또는 트렌딩 콘텐츠 렌더링
- **파일**: `qa/01-public-pages.spec.ts`
- **오류**: ```
TimeoutError: page.waitForLoadState: Timeout 15000ms exceeded.
```
### 모바일 뷰포트 > 홈 — 모바일 렌더링
- **파일**: `qa/14-error-edge-cases.spec.ts`
- **오류**: ```
TimeoutError: page.waitForLoadState: Timeout 15000ms exceeded.
```

## P1 — 우선 수정 (주요 기능 오류)

_해당 없음_

## P2 — 일반 수정 (부분 기능 오류)

### 글쓰기 버튼 > 비로그인 — FAB 글쓰기 클릭 → 로그인 유도
- **파일**: `qa/02-community-public.spec.ts`
- **오류**: ```
Error: 비로그인 글쓰기 → 로그인 유도 없음

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```
### 배너 관리 > 배너 목록 테이블 또는 빈 상태
- **파일**: `qa/10-admin-banners.spec.ts`
- **오류**: ```
Error: 배너 페이지 콘텐츠 없음

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```

## P3 — 개선 (UX/성능)

### 커뮤니티 글 상세 > 글 상대 — 비로그인 공감 클릭 → 로그인 유도
- **파일**: `qa/02-community-public.spec.ts`
- **오류**: ```
Error: 비로그인 공감 → 로그인 유도 없음

[2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m

Expected: [32mtrue[39m
Received: [31mfalse[39m
```
### 일자리 > 첫 번째 일자리 상세 진입
- **파일**: `qa/03-jobs-magazine.spec.ts`
- **오류**: ```
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoContain[2m([22m[32mexpected[39m[2m) // indexOf[22m

Expected substring: [32m"/jobs/"[39m
Received string:    [31m"https://www.age-doesnt-matter.com/jobs"[39m
```
### 일자리 > 일자리 상세 — 급여/근무지/고용형태 정보 렌더링
- **파일**: `qa/03-jobs-magazine.spec.ts`
- **오류**: ```
Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m

Expected: > [32m0[39m
Received:   [31m0[39m
```
### 매거진 > 매거진 상세 — OG 메타 태그 존재
- **파일**: `qa/03-jobs-magazine.spec.ts`
- **오류**: ```
[31mTest timeout of 30000ms exceeded.[39m
```

---
> 자동 생성: `npx tsx scripts/qa-report-generator.ts`