# 우나어 개발 컨벤션 (A10)

> 이 문서는 프로젝트의 코딩 규칙을 정의합니다.
> 모든 기여자(사람 + AI)는 이 컨벤션을 따릅니다.

---

## 1. 프로젝트 구조

```
src/
├── app/                    # Next.js App Router (페이지 + API)
│   ├── api/                # API 라우트
│   ├── (public)/           # 비인증 페이지 그룹
│   ├── (auth)/             # 인증 필요 페이지 그룹
│   ├── layout.tsx          # 루트 레이아웃
│   └── page.tsx            # 홈
├── components/
│   ├── ui/                 # 범용 UI 컴포넌트 (Button, Input, Card ...)
│   ├── layouts/            # 레이아웃 (GNB, Header, Footer, FAB ...)
│   └── features/           # 기능별 컴포넌트 (게시판, 마이페이지 ...)
├── lib/                    # 유틸리티 & 헬퍼
├── types/                  # 공유 타입 정의
├── styles/                 # 글로벌 CSS (tokens.css)
├── middleware.ts           # NextAuth 미들웨어
└── generated/              # 자동 생성 (Prisma) — 수동 편집 금지
```

---

## 2. 파일 네이밍

| 대상 | 규칙 | 예시 |
|:---|:---|:---|
| 컴포넌트 | PascalCase | `Button.tsx`, `MainLayout.tsx` |
| CSS Modules | PascalCase.module.css | `Button.module.css` |
| 유틸/헬퍼 | kebab-case | `api-utils.ts`, `auth.config.ts` |
| 타입 파일 | kebab-case | `api.ts`, `next-auth.d.ts` |
| API 라우트 | Next.js 규칙 | `[...nextauth]/route.ts`, `[id]/route.ts` |
| 스펙 문서 | UPPER_SNAKE | `AUTH_SPEC.md`, `API_CONTRACT.md` |

---

## 3. 컴포넌트 규칙

### 3.1 서버 컴포넌트 (기본)

`'use client'`를 쓰지 않으면 자동으로 서버 컴포넌트.
데이터 패칭, 정적 렌더링에 사용.

```tsx
import styles from './Card.module.css'
import type { PostSummary } from '@/types/api'

interface CardProps {
  post: PostSummary
  href: string
}

export default function Card({ post, href }: CardProps) {
  return <div className={styles.card}>...</div>
}
```

### 3.2 클라이언트 컴포넌트

상태, 이벤트, 브라우저 API가 필요할 때만 `'use client'` 사용.

```tsx
'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', isLoading = false, children, className, ...props }, ref) => {
    return (
      <button ref={ref} className={styles.button} {...props}>
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
export default Button
```

### 3.3 컴포넌트 체크리스트

- [ ] 서버 컴포넌트 우선, `'use client'` 최소화
- [ ] Props는 `interface`로 정의
- [ ] `forwardRef`는 ref가 필요한 UI 컴포넌트만
- [ ] `displayName` 설정 (forwardRef 사용 시)
- [ ] `export default` 사용 (컴포넌트)
- [ ] Context Provider: `useXxx()` 커스텀 훅 + 누락 에러 메시지

---

## 4. TypeScript 규칙

### 4.1 기본 원칙

- **`any` 사용 금지** — ESLint가 error로 차단
- **`interface`**: 객체, Props 정의
- **`type`**: 유니온, 별칭, 유틸리티 타입
- **`import type`**: 타입 전용 임포트 분리

```tsx
import type { PostSummary } from '@/types/api'     // 타입
import { GRADE_EMOJI } from '@/types/api'           // 값
```

### 4.2 타입 정의 위치

| 범위 | 위치 |
|:---|:---|
| API 공통 (요청/응답) | `src/types/api.ts` |
| NextAuth 세션 확장 | `src/types/next-auth.d.ts` |
| 컴포넌트 Props | 해당 컴포넌트 파일 내 |
| 페이지 전용 | 해당 페이지 폴더 내 |
| Prisma 모델 | `@/generated/prisma/client` (자동 생성) |

---

## 5. 임포트 순서

```tsx
'use client'                                          // 1. 디렉티브

import { useState } from 'react'                      // 2. React/Next
import Link from 'next/link'
import Image from 'next/image'

import styles from './Card.module.css'                 // 3. 로컬 스타일

import type { PostSummary } from '@/types/api'         // 4. 타입 (@/)
import { GRADE_EMOJI } from '@/types/api'              // 5. 값 (@/)
import { formatRelativeTime } from '@/lib/format'      // 6. 유틸 (@/)

const MENU_ITEMS = [...] as const                      // 7. 모듈 레벨 상수
```

- **절대 경로만 사용**: `@/components/ui/Button` (상대 경로 금지)
- 같은 폴더 내 스타일만 예외: `./Button.module.css`

---

## 6. CSS 규칙

### 6.1 CSS Modules + CSS Variables

- 모든 스타일은 CSS Modules (`.module.css`)
- 색상, 간격, 폰트 등은 **반드시** `tokens.css` 변수 사용
- 하드코딩 금지: `#FF6F61` (X) → `var(--color-primary)` (O)

```css
/* Button.module.css */
.button {
  min-height: var(--button-height-mobile);
  font: var(--font-button);
  border-radius: var(--radius-sm);
  background-color: var(--color-primary);
}

@media (min-width: 1024px) {
  .button {
    min-height: var(--button-height-desktop);
  }
}
```

### 6.2 클래스명 조합

```tsx
const classNames = [
  styles.button,
  styles[variant],
  isLoading ? styles.loading : '',
  className ?? '',
].filter(Boolean).join(' ')
```

### 6.3 반응형 브레이크포인트

| 기준 | 값 | 용도 |
|:---|:---|:---|
| 모바일 | < 768px | 기본 (mobile-first) |
| 태블릿 | 768px~1023px | 중간 레이아웃 |
| 데스크탑 | >= 1024px | 넓은 레이아웃 |

### 6.4 시니어 친화 필수 규칙

- 터치 타겟: **최소 52x52px** (`--touch-target-min`)
- 본문 폰트: **최소 17px** (`--font-size-sm`)
- 버튼 높이: 모바일 52px / 데스크탑 48px
- `-webkit-tap-highlight-color: transparent` (버튼)

---

## 7. API 라우트 규칙

### 7.1 응답 형식

모든 API는 `{ ok, data, error }` 래퍼 사용 (`src/types/api.ts` 기준):

```ts
// 성공
{ ok: true, data: { ... }, meta?: { ... } }

// 실패
{ ok: false, error: { code: "NOT_FOUND", message: "..." } }
```

### 7.2 에러 처리

`src/lib/errors.ts`의 에러 클래스 사용:

```ts
import { NotFoundError } from '@/lib/errors'
import { handleApiError } from '@/lib/api-utils'

export async function GET(req: Request) {
  try {
    const post = await prisma.post.findUnique({ where: { id } })
    if (!post) throw new NotFoundError('게시글')

    return NextResponse.json({ ok: true, data: post })
  } catch (error) {
    return handleApiError(error)
  }
}
```

### 7.3 에러 클래스 목록

| 클래스 | HTTP | 코드 | 용도 |
|:---|:---:|:---|:---|
| `ValidationError` | 400 | VALIDATION_ERROR | 입력값 검증 |
| `UnauthorizedError` | 401 | UNAUTHORIZED | 로그인 필요 |
| `ForbiddenError` | 403 | FORBIDDEN | 권한 없음 |
| `NotFoundError` | 404 | NOT_FOUND | 리소스 없음 |
| `RateLimitError` | 429 | RATE_LIMIT | 요청 제한 |
| `AppError` | 500 | INTERNAL_ERROR | 서버 에러 (기본) |

---

## 8. Prisma / DB 규칙

- **Raw SQL 절대 금지** — Prisma Client만 사용
- **싱글톤**: `import { prisma } from '@/lib/prisma'`
- **select 사용**: 필요한 필드만 선택 (성능)
- **타입**: `@/generated/prisma/client`에서 import
- **수동 편집 금지**: `src/generated/` 폴더

```ts
// Good
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, nickname: true, grade: true },
})

// Bad — 전체 필드 로딩
const user = await prisma.user.findUnique({ where: { id: userId } })
```

---

## 9. 인증 아키텍처

```
auth.config.ts  ─── 미들웨어용 (Edge Runtime, Prisma 없음)
     │
auth.ts  ───────── 서버 전용 (Full, Prisma DB 접근)
     │
middleware.ts  ──── 라우트 보호 (auth.config.ts 사용)
```

- **Kakao OAuth 전용** (다른 Provider 없음)
- **JWT 전략** (30일 만료)
- **세션 확장 필드**: `userId`, `role`, `grade`, `nickname`, `profileImage`, `needsOnboarding`

---

## 10. 코드 포맷팅

### Prettier (`.prettierrc`)

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

- 세미콜론 없음
- 작은따옴표
- 2칸 들여쓰기
- 줄끝 콤마
- 100자 줄 너비

### ESLint (`.eslintrc.json`)

- `next/core-web-vitals` + `@typescript-eslint/recommended`
- `@typescript-eslint/no-explicit-any`: **error**
- `src/generated/` 제외

---

## 11. Git 규칙

### 11.1 커밋 메시지

```
<type>: <설명 (한글, 간결하게)>

- 상세 내용 1
- 상세 내용 2
```

| type | 용도 |
|:---|:---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `chore` | 설정, 의존성 |
| `docs` | 문서 |
| `refactor` | 리팩토링 |
| `style` | 포맷팅 (코드 변경 없음) |
| `test` | 테스트 |

### 11.2 브랜치 전략

현재: `main` 단일 브랜치 (MVP 단계)

### 11.3 보안

- `.env*` 파일 커밋 금지 (pre-commit hook이 차단)
- secretlint: 스테이징 파일 시크릿 스캔
- 크레덴셜 관리: `docs/spec/SECRETS_MANAGEMENT.md`

---

## 12. 스크립트

```bash
npm run dev           # 로컬 개발 서버
npm run build         # 프로덕션 빌드
npm run lint          # ESLint 검사
npm run typecheck     # tsc --noEmit
npm run format        # Prettier 포맷 (write)
npm run format:check  # Prettier 포맷 (check)
```

---

## 13. 배포 전 체크리스트

- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과
- [ ] 모바일 767px 반응형 확인
- [ ] 터치 타겟 52px 이상
- [ ] 광고 슬롯 "광고" 라벨 확인
- [ ] 이미지: `next/image` + WebP + lazy load
- [ ] 에러 메시지 한국어
