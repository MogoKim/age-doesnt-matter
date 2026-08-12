---
paths:
  - "src/lib/auth*.ts"
  - "src/app/api/auth/**"
  - "src/app/api/health/auth/**"
globs: src/lib/auth*.ts
---

# 회원가입(Auth) 변경 시 절대 준수 체크리스트

> CLAUDE.md에서 이관(PR-B2). 인증은 가입 퍼널 전체가 막히는 영역이라 예외가 없다.

- `src/lib/auth.config.ts` / `src/lib/auth.ts` 변경 시:
  1. 배포 후 `/api/health/auth` 200 확인
  2. Android Chrome + iOS Safari 실기기 직접 로그인 테스트
  3. BotLog `action: 'AUTH_FAILURE'` 1시간 모니터링
- 다른 기능 개발 완료 후: `grep -rn "from.*auth\|from.*session" src/` 로 의도치 않은 변경 없는지 확인
- Kakao Developer Console redirect_uri 변경 시: 반드시 창업자 승인 후

## 카카오 정보 수집 원칙

providerId/닉네임/프로필만 자동, 나머지는 선택 동의. 가입 허들을 낮추는 것이 우선이다.
