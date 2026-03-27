# Enum 타입 마이그레이션 패턴

## enum 값 추가 (가장 흔함)
```sql
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'NEW_VALUE';
```

## 주의사항
- `IF NOT EXISTS`를 반드시 사용 — 이미 존재하면 에러
- enum 값 삭제는 PostgreSQL에서 직접 지원 안 함 → 새 enum 만들고 교체해야 함
- 추가 후 prisma/schema.prisma의 enum도 동일하게 수정
- `npx prisma generate` 필수

## 현재 우나어 enum 목록
- `SocialPlatform`: THREADS, X, INSTAGRAM, FACEBOOK, BAND
- `Role`: USER, ADMIN
- `BoardCategory`: FREE, HUMOR, HEALTH, HOBBY, FINANCE, LIFE, JOB, NEWS
