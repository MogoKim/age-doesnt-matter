# _quarantine/ — 격리 폴더

**격리 일시**: 2026-04-18
**삭제 예정일**: 2026-05-02 (2주 후)
**복구 방법**: `git checkout pre-cleanup -- <파일경로>`

## 격리된 파일 ([Safe] 분류 — grep 0 references 확인)

### scripts/ (일회성 완료 스크립트)
- add-canonicals.js — SEO canonical 일회성 추가 완료
- migrate-trending-columns.ts — DB 마이그레이션 완료
- reset-jisik-rows.ts — 지식 행 일회성 리셋 완료
- extract-menu-ids.ts — 메뉴 ID 일회성 추출 완료
- fix-broken-scraped-posts.ts — 스크래핑 데이터 수정 완료
- fix-existing-jobs.ts — 일자리 데이터 수정 완료
- fix-scraped-content.ts — 스크래핑 콘텐츠 수정 완료
- generate-icons.ts — 아이콘 생성 완료

### agents/scripts/
- magazine-fix.ts — 0 references (grep 확인)
- magazine-qa-check.ts — 0 references (grep 확인)

### agents/cafe/
- ~~config.ts~~ — **복원** (e2e/export-kakao-cookies.ts:21 의존성 발견)
- ~~types.ts~~ — **복원** (agents/cafe/config.ts가 import → e2e 의존성 체인)

### agents/cmo/
- test-platforms.ts — 0 references (grep 확인)

### 루트
- check-data.mjs — 임시 Prisma 진단 쿼리
- visual-qa-result.json — 자동 생성 QA 출력

## 판정 기준
2주 후 빌드/에이전트 이상 없고 WATCH 로그 미발생 → 이 폴더 전체 삭제
문제 발생 → git checkout pre-cleanup 으로 복구
