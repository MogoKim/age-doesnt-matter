---
globs: src/app/api/**/*.ts
---

# API 라우트 규칙

- Next.js App Router API 라우트 형식 (route.ts)
- 에러 처리: AppError / NotFoundError / ForbiddenError
- 인증 필요 시: getServerSession() 사용
- Slack webhook: HMAC-SHA256 서명 검증 필수
- 응답 형식: NextResponse.json()
