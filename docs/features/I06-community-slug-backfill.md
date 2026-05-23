---
id: I06
name: 커뮤니티 slug 백필 스크립트
status: ACTIVE
created: 2026-05-23
---

## 개요
slug=null 상태인 커뮤니티 게시글(STORY/HUMOR/LIFE2)에 slug를 일괄 부여하는 수동 운영 도구.
sitemap.ts의 `!(isCommunity && !post.slug)` 필터로 누락된 1,792건 SEO 복구 목적.

## 코드 위치
- `agents/scripts/backfill-community-slug.ts`

## 실행 방법
```bash
cd agents

# dry-run (기본 50건)
npx tsx --env-file=../.env.local scripts/backfill-community-slug.ts

# write 샘플 (≤10건)
npx tsx --env-file=../.env.local scripts/backfill-community-slug.ts --write --limit 10 --confirm-write-sample

# write 배치 (≤100건)
npx tsx --env-file=../.env.local scripts/backfill-community-slug.ts --write --limit 100 --confirm-write-batch
```

## 안전 장치
- `--write` + `--confirm-write-sample` (≤10) 또는 `--confirm-write-batch` (≤100) 3-flag 조합 필수
- 100건 초과 write 불가 (하드가드)
- Phase1 사전계산 → Phase2 write 2단계 구조
- 롤백 CSV 자동 생성 (`backfill-community-slug-write-sample-{ts}.csv`)

## slug 생성 규칙
- title → 특수문자 제거 → 공백→하이픈 → 50자 truncate
- DB unique 충돌 시 `-2`~`-9` suffix → timestamp fallback
- in-batch 중복 방지: `assignedInBatch: Set<string>`

## 수정 이력
| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-05-23 | P1-1: dry-run 스크립트 최초 생성 | SEO slug 부재 조사 |
| 2026-05-23 | P1-2: --write --confirm-write-sample 모드 추가 (10건 샘플) | 안전한 점진적 적용 |
| 2026-05-23 | P1-3: --confirm-write-batch 모드 추가 (100건 배치) | 대량 적용 확장 |
