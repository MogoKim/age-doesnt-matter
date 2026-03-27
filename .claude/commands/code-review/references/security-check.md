# 보안 점검 체크리스트

## XSS 방지
- 사용자 입력을 dangerouslySetInnerHTML로 렌더링하지 않기
- URL 파라미터를 직접 DOM에 삽입하지 않기
- React의 기본 이스케이핑에 의존 (JSX 내 직접 출력)

## SQL Injection
- Prisma ORM 사용 시 자동 방어 (파라미터 바인딩)
- Raw SQL 절대 금지 (CLAUDE.md 규칙)

## 인증/인가
- API 라우트: `getServerSession(authOptions)`로 인증 확인
- 어드민 API: role === 'ADMIN' 검증
- CSRF: NextAuth가 자동 처리

## Webhook 보안
- Slack webhook: HMAC-SHA256 서명 검증 필수
- 외부 콜백: 서명/토큰 검증

## 환경변수
- 시크릿을 코드에 하드코딩 금지
- `.env.local`은 gitignore 확인
- NEXT_PUBLIC_ 접두사: 클라이언트 노출 OK인 것만

## API 키 관리
- GitHub Secrets에 등록 (현재 27/28개)
- 로컬: .env.local
- 에이전트: env.ts에서 optionalEnv로 관리
