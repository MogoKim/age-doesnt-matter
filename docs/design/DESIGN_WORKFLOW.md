# 디자인 시스템 & 워크플로우 가이드

> 우나어 프로젝트의 디자인 → 개발 → 검증 전체 워크플로우
> 2026-03-16 작성 | v1.0

---

## 1. 전략: 하이브리드 (Code-First + Figma 병행)

### 왜 하이브리드인가?

| 접근법 | 장점 | 단점 | 적합 상황 |
|:---|:---|:---|:---|
| **Design-First** (Figma → 코드) | 디자인 완성도 높음, 시각적 검증 선행 | 속도 느림, 디자이너 필요 | 전문 디자이너 있을 때 |
| **Code-First** (코드 → Figma) | 빠른 프로토타입, 실제 동작 확인 | 디자인 일관성 깨지기 쉬움 | 개발자 1인 프로젝트 |
| **하이브리드** | 빠르면서 일관성 유지 | 두 곳 동기화 관리 필요 | **우나어 (현재)** |

### 우나어 하이브리드 전략

```
[Step 1] 디자인 토큰 정의 (코드 — CSS Variables)
   ↓ PRD A1 기반, 이미 완료
[Step 2] 핵심 화면 와이어프레임 (Figma)
   ↓ 5~7개 핵심 화면, lo-fi 수준
[Step 3] Figma → 코드 동기화 (MCP)
   ↓ 토큰 추출, 컴포넌트 구조 참조
[Step 4] 컴포넌트 라이브러리 구현 (코드)
   ↓ Button, Card, Modal 등 10종
[Step 5] 페이지 개발 (코드)
   ↓ 와이어프레임 참조하며 구현
[Step 6] 코드 → Figma 역동기화 (선택)
   ↓ 완성된 화면을 Figma에 기록
[Step 7] 시니어 UI 검증
   ↓ 52px 터치 타겟, 17px 폰트 등
```

---

## 2. Figma 프로젝트 구조

### 파일 구조 (권장)

```
📁 우나어 (Figma Team/Project)
├── 📄 0. Design System
│   ├── Colors (PRD A1 컬러 토큰 전체)
│   ├── Typography (Noto Sans KR 스케일)
│   ├── Spacing (4px 단위 시스템)
│   ├── Components (Button, Card, Modal, Toast, Badge, Avatar, Input, Chip, Skeleton, FAB)
│   └── Icons (메뉴 아이콘 5종 + 액션 아이콘)
│
├── 📄 1. IA (정보 구조도)
│   ├── Sitemap (PRD A2 시각화)
│   ├── Navigation Flow (상단바 + 아이콘 메뉴 + FAB)
│   └── User Flow (핵심 3개: 가입, 글쓰기, 일자리 조회)
│
├── 📄 2. Wireframes (Lo-Fi)
│   ├── Mobile
│   │   ├── 홈
│   │   ├── 내 일 찾기 (목록 + 상세)
│   │   ├── 사는 이야기 (목록 + 상세 + 글쓰기)
│   │   ├── 매거진 (목록 + 상세)
│   │   ├── 베스트
│   │   ├── 검색
│   │   ├── 마이페이지
│   │   └── 로그인/온보딩
│   └── Desktop
│       ├── 홈
│       ├── 내 일 찾기
│       └── 소통 마당
│
├── 📄 3. Hi-Fi Mockup (Phase 2)
│   └── (개발 완료 후 실제 화면 캡처 기반)
│
└── 📄 4. Prototype (Phase 2)
    └── (핵심 플로우 인터랙티브 연결)
```

### Figma Variables 매핑 (디자인 토큰)

PRD A1의 CSS Variables를 Figma Variables로 1:1 매핑:

| CSS Variable | Figma Variable | Collection |
|:---|:---|:---|
| `--color-primary` | `color/primary` | Colors |
| `--color-primary-hover` | `color/primary-hover` | Colors |
| `--color-primary-light` | `color/primary-light` | Colors |
| `--color-bg` | `color/bg` | Colors |
| `--color-surface` | `color/surface` | Colors |
| `--color-text` | `color/text` | Colors |
| `--color-text-sub` | `color/text-sub` | Colors |
| `--color-text-muted` | `color/text-muted` | Colors |
| `--color-border` | `color/border` | Colors |
| `--font-h1` | `font/h1` (28/700) | Typography |
| `--font-body` | `font/body` (17/400) | Typography |
| `--font-button` | `font/button` (18/600) | Typography |

---

## 3. Figma MCP 연동

### 3-1. 공식 Remote MCP 서버 (기본 — 권장)

**장점**: 가장 간단, Figma가 호스팅, 모든 플랜 사용 가능

```bash
# Claude Code에서 설치
claude mcp add --transport http figma https://mcp.figma.com/mcp

# 전체 프로젝트에서 사용하려면
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```

**인증 절차:**
1. Claude Code에서 Figma 관련 작업 요청
2. 브라우저에서 OAuth 인증 팝업 → 승인
3. 이후 자동 인증

**할 수 있는 것:**
- Figma 파일 구조 읽기 (프레임, 컴포넌트, 레이어)
- 디자인 토큰(Variables) 추출
- 선택한 프레임을 코드로 변환
- 컴포넌트 정보 조회
- 접근성 정보 확인

**할 수 없는 것:**
- Figma에 직접 디자인 생성/수정 (읽기 전용)
- 복잡한 레이아웃의 완벽한 코드 변환 (85~90% 정확도)

### 3-2. Desktop MCP 서버 (로컬)

Figma 데스크톱 앱이 있을 때, 더 빠른 로컬 연결:

```bash
# 1. Figma Desktop → Menu → Preferences → "Enable Dev Mode MCP Server" 활성화
# 2. Claude Code에서 설정
claude mcp add --transport sse figma-desktop http://127.0.0.1:3845/sse
```

- Dev 또는 Full 시트 필요 (유료)
- 로컬이라 속도 빠름
- 오프라인에서도 동작

### 3-3. claude-talk-to-figma-mcp (쓰기 가능 — 보조)

AI가 Figma에 직접 디자인을 생성/수정해야 할 때:

- **GitHub**: `arinspunk/claude-talk-to-figma-mcp`
- **특징**: Figma 플러그인 + WebSocket 서버로 양방향 통신
- **무료 계정에서도 사용 가능**
- 설정이 공식 서버보다 복잡 (플러그인 설치 + 서버 실행 필요)

```bash
# 설치
git clone https://github.com/arinspunk/claude-talk-to-figma-mcp.git
cd claude-talk-to-figma-mcp
bun install && bun run socket

# Figma Desktop에서 플러그인 import (manifest.json)
# 채널 ID 복사 → Claude Code에서 사용
```

### 3-4. 권장 조합

| 용도 | MCP 서버 | 시점 |
|:---|:---|:---|
| **디자인 → 코드 변환** | Figma 공식 Remote | B2 (디자인 시스템 기반) |
| **디자인 토큰 추출** | Figma 공식 Remote | B2 |
| **코드 → Figma 생성** | claude-talk-to-figma-mcp | 필요 시 (선택) |
| **컴포넌트 검증** | Figma 공식 Remote | C0 (공통 컴포넌트) |

---

## 4. 디자인 ↔ 코드 동기화 방법

### 4-1. 디자인 토큰 동기화

```
[Figma Variables]
      ↕ Figma MCP로 추출/검증
[CSS Variables: src/styles/tokens.css]
      ↕ 코드에서 직접 사용
[컴포넌트: src/components/ui/*]
```

**tokens.css** (코드가 Source of Truth):

```css
:root {
  /* Colors — PRD A1 */
  --color-primary: #FF6F61;
  --color-primary-hover: #E85D50;
  --color-primary-light: #FFF0EE;
  /* ... */

  /* Typography — PRD A1 */
  --font-h1: 700 28px/1.75 'Noto Sans KR';
  --font-body: 400 17px/1.75 'Noto Sans KR';
  /* ... */

  /* Spacing — 4px 단위 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
}

/* 글자크기 설정 */
html[data-font-size="large"] {
  --font-body: 400 20px/1.75 'Noto Sans KR';
}
html[data-font-size="xlarge"] {
  --font-body: 400 24px/1.75 'Noto Sans KR';
}
```

**동기화 규칙:**
- 코드(tokens.css)가 원본 (Source of Truth)
- Figma Variables는 코드와 동일하게 유지
- 토큰 변경 시: 코드 먼저 → Figma 동기화
- Figma MCP로 주기적 검증 ("Figma의 primary color가 코드와 같은지?")

### 4-2. 컴포넌트 동기화

```
[Figma Component]          [React Component]
Button/Primary    ←→     <Button variant="primary">
Card/Post         ←→     <PostCard>
Modal/BottomSheet ←→     <Modal type="sheet">
```

**방법:**
1. 코드에서 컴포넌트 구현 (TRACK C0)
2. Figma MCP로 Figma 컴포넌트와 대조 검증
3. 불일치 발견 시 코드 기준으로 Figma 업데이트

---

## 5. 시니어 친화 디자인 검증 체크리스트

### 자동 검증 (Figma MCP + Playwright)

| # | 검증 항목 | 방법 | 기준 |
|:-:|:---|:---|:---|
| 1 | 터치 타겟 크기 | Playwright: 모든 interactive 요소 크기 측정 | 52×52px 이상 |
| 2 | 폰트 크기 | CSS computed style 검사 | 17px 이상 (caption 14px 예외) |
| 3 | 색상 대비 | axe-core 접근성 스캔 | WCAG AA (4.5:1) |
| 4 | 버튼 높이 | Playwright: 모든 버튼 높이 측정 | 모바일 52px / 데스크탑 48px |
| 5 | 줄간격 | CSS computed style | line-height 1.75 |
| 6 | 광고 라벨 | DOM에서 "광고" 텍스트 존재 확인 | 모든 광고 슬롯 |

### 수동 검증 (배포 전)

| # | 검증 항목 | 방법 |
|:-:|:---|:---|
| 1 | 실기기 터치 | iPhone SE + 갤럭시 A 시리즈에서 주요 플로우 |
| 2 | 가독성 | 50대 테스터 실제 화면 읽기 확인 |
| 3 | 네비게이션 이해도 | "일자리 페이지로 가보세요" 태스크 성공률 |
| 4 | 글쓰기 플로우 | FAB 발견 → 글 작성 완료까지 소요 시간 |
| 5 | 반응형 | 767px 기준 모바일 ↔ 데스크탑 전환 |

---

## 6. 작업 순서 (타임라인)

### Phase 0: 디자인 기반 (TRACK A 기획과 병렬)

```
1. Figma 프로젝트 생성 + 파일 구조 세팅
2. Design System 파일:
   - Colors: PRD A1 토큰 전체 입력
   - Typography: Noto Sans KR 스케일
   - Components: Button, Card, Modal 기본형
3. IA 파일:
   - Sitemap 시각화
   - Navigation Flow (상단바 + 아이콘 메뉴 + FAB)
4. Wireframe 파일 (Lo-Fi):
   - 홈 (모바일 + 데스크탑)
   - 내 일 찾기 (목록 + 상세)
   - 사는 이야기 (목록 + 상세 + 글쓰기)
   - 매거진 (목록 + 상세)
   - 검색 (오버레이 + 결과)
   - 마이페이지
   - 로그인/온보딩
```

### Phase 1: 개발 중 (TRACK B~C)

```
5. Figma MCP 설정 (B0/B2에서)
6. tokens.css 작성 (B2에서)
7. 컴포넌트 10종 구현 시 Figma 참조 (C0에서)
8. 각 페이지 개발 시 와이어프레임 참조 (C1~C10에서)
9. 개발 완료 페이지 스크린샷 → Figma Hi-Fi 페이지에 기록 (선택)
```

### Phase 2: 런칭 후

```
10. 실사용자 피드백 → 디자인 개선
11. Figma Prototype 연결 (주요 플로우)
12. 디자인 시스템 문서화 완성
```

---

## 7. Figma 제한사항 및 주의점

| 항목 | 내용 |
|:---|:---|
| **요금** | Remote MCP는 모든 플랜 가능, 단 Starter 시트는 월 6회 도구 호출 제한 |
| **정확도** | AI의 Figma → 코드 변환은 85~90% 정확도, 반드시 수동 검토 필요 |
| **할루시네이션** | AI가 원본에 없는 디자인 요소를 만들 수 있음 — Figma 원본과 대조 필수 |
| **토큰 제한** | MCP 응답 25,000 토큰 초과 시 실패 가능 — 대규모 파일은 프레임 단위로 요청 |
| **쓰기 불가** | 공식 MCP는 읽기 전용, Figma에 디자인 생성은 claude-talk-to-figma-mcp 필요 |
| **코드가 원본** | 디자인 토큰은 항상 코드(tokens.css)가 Source of Truth. Figma는 참조/검증용 |

---

## 8. Google Stitch AI 통합 (2026-03 추가)

### 8-1. Stitch AI란?

Google Labs의 AI 네이티브 디자인 플랫폼. 텍스트 프롬프트로 UI 디자인 + 프로덕션 코드를 생성한다.
Figma 워크플로우를 **대체하지 않고 보완**한다.

| 용도 | 도구 | 장점 |
|:---|:---|:---|
| 빠른 화면 생성 | **Stitch AI** | 프롬프트로 즉시 생성, 디자이너 불필요 |
| 컴포넌트 검증 | **Figma MCP** | 기존 디자인 자산과 비교 |
| 코드 구현 | **Claude Code** | Stitch 출력을 React/Tailwind로 변환 |

### 8-2. 워크플로우

```
[A방향: 코드 → Stitch]
코드 읽기 → DESIGN.md 참조 → Stitch 프롬프트 → 화면 생성
→ 디자이너 핸드오프 / 시각 검토

[B방향: Stitch → 코드]
Stitch에서 디자인 수정 → MCP로 HTML 추출 → 코드 diff 비교
→ 시니어 제약조건 검증 → React/Tailwind 구현
```

### 8-3. 핵심 파일

| 파일 | 역할 |
|:---|:---|
| `/DESIGN.md` | 디자인 시스템 전체 스펙 (Claude Code가 읽고 Stitch 프롬프트 구성) |
| `/src/app/dev/components/page.tsx` | 컴포넌트 쇼케이스 (Stitch URL 임포트용) |
| `/docs/design/STITCH_INTEGRATION.md` | Stitch 설정/사용 상세 가이드 |
| `/docs/design/stitch-screens/screen-map.json` | Stitch screenId ↔ 라우트 매핑 |

### 8-4. Stitch vs Figma 사용 구분

| 상황 | 사용 도구 |
|:---|:---|
| 새 화면 빠르게 프로토타이핑 | Stitch |
| 기존 디자인 자산 참조/검증 | Figma MCP |
| 디자이너 핸드오프/협업 | Stitch → Figma 붙여넣기 |
| 디자인 토큰 관리 | 코드 (Source of Truth) |
| 디자인 변경 → 코드 반영 | Stitch → Claude Code |

### 8-5. 제약조건 검증

Stitch 출력물을 코드에 반영할 때 반드시 검증:
- 터치 타겟: 52px (모바일) / 48px (데스크탑)
- 폰트: 최소 15px, 본문 18px
- 색상 대비: WCAG AA (4.5:1)
- 광고 슬롯: "광고" 라벨 필수

> 상세 가이드: `/docs/design/STITCH_INTEGRATION.md`
