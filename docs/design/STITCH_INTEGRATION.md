# Stitch AI 통합 가이드

> Google Stitch AI와 우나어 프로젝트의 양방향 디자인 워크플로우
> 2026-03-24 작성 | v1.0

---

## 1. 개요

### Stitch AI란?

Google Labs의 AI 네이티브 디자인 플랫폼. 텍스트 프롬프트나 이미지로부터 고퀄리티 UI 디자인 + 프로덕션 코드(HTML/CSS/React)를 생성한다.

- **URL**: https://stitch.withgoogle.com/
- **무료 한도**: Standard 350회/월, Experimental 200회/월
- **MCP 지원**: Claude Code, Cursor, Gemini CLI 등과 연동

### 아키텍처

```
[Stitch AI] ←MCP→ [Claude Code] ←→ [코드베이스]
   UI 생성         중재/변환/검증       Source of Truth
```

- **Stitch**: 프롬프트 기반 UI 화면 생성, HTML/CSS 출력
- **Claude Code**: DESIGN.md 참조하여 프롬프트 구성, 출력 검증, 코드 변환
- **코드베이스**: 디자인 토큰/컴포넌트의 원본 (Source of Truth)

---

## 2. 설치 및 설정

### 2-1. stitch-mcp 설치

```bash
# Google OAuth 인증 포함
npx @_davideast/stitch-mcp init

# 연결 확인
npx @_davideast/stitch-mcp doctor
```

### 2-2. MCP 설정

프로젝트 `.mcp.json`에 추가:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["@_davideast/stitch-mcp", "proxy"]
    }
  }
}
```

### 2-3. MCP 도구

| 도구 | 설명 |
|------|------|
| `build_site` | Stitch 프로젝트를 Astro 사이트로 빌드 |
| `get_screen_code` | 개별 화면의 HTML 코드 추출 |
| `get_screen_image` | 개별 화면의 스크린샷 추출 |

---

## 3. Stitch 프로젝트 설정

### 3-1. 프로젝트 생성

1. https://stitch.withgoogle.com/ 접속
2. 새 프로젝트 생성: **"우나어 (Age Doesn't Matter)"**
3. **URL 임포트**: 배포된 사이트 URL 입력하여 디자인 시스템 추출
4. 쇼케이스 페이지도 임포트: `{domain}/dev/components`

### 3-2. 스타일 프롬프트

프로젝트 설명에 아래 내용 입력:

> Korean community platform for adults 50-60+. Warm coral (#FF6F61) brand color. Senior-friendly: large 18px base font (Pretendard Variable), 52px minimum touch targets on mobile, 48px on desktop. High contrast text (#111827 on #F8F9FA). Cards on white (#FFFFFF), rounded-xl corners (12px). Line height 1.75. Warm, approachable, not clinical. No dark mode. Korean language (word-break: keep-all).

### 3-3. Project ID 기록

```
STITCH_PROJECT_ID: _________________ (생성 후 여기에 기록)
```

---

## 4. 화면 생성 가이드

### 4-1. 크레딧 예산 (350/월)

| 카테고리 | 화면 수 | 크레딧(예상) | 우선순위 |
|---------|---------|-------------|---------|
| 모바일 유저 화면 | 15 | ~30 | P0 |
| 데스크탑 유저 화면 | 12 | ~24 | P0 |
| 컴포넌트 쇼케이스 | 3 | ~6 | P0 |
| 모바일 어드민 | 8 | ~16 | P1 |
| 데스크탑 어드민 | 8 | ~16 | P1 |
| 수정/반복 | — | ~50 | 버퍼 |
| **합계** | | **~142** | |

### 4-2. 화면 명명 규칙

```
{대상}/{디바이스}/{화면명}

예시:
user/mobile/home
user/mobile/jobs-list
user/mobile/jobs-detail
user/mobile/community-list
user/mobile/community-detail
user/mobile/community-write
user/mobile/magazine
user/mobile/magazine-detail
user/mobile/best
user/mobile/search
user/mobile/my-page
user/mobile/my-settings
user/mobile/login
user/mobile/onboarding
user/mobile/faq

user/desktop/home
user/desktop/jobs-list
user/desktop/community-list
user/desktop/community-detail
user/desktop/magazine
user/desktop/best
user/desktop/search
user/desktop/my-page
user/desktop/login
user/desktop/about
user/desktop/faq
user/desktop/contact

admin/desktop/dashboard
admin/desktop/content
admin/desktop/members
admin/desktop/reports
admin/desktop/banners
admin/desktop/analytics
admin/desktop/settings
admin/desktop/login

admin/mobile/dashboard
admin/mobile/content
admin/mobile/members
admin/mobile/reports
admin/mobile/banners
admin/mobile/analytics
admin/mobile/settings
admin/mobile/login

components/buttons-cards
components/forms-inputs
components/navigation-layout
```

### 4-3. 프롬프트 템플릿

DESIGN.md의 Section 9 참조. 핵심 요소:

```
[Screen type] for 우나어 (Korean community for adults 50+).

Device: [Mobile 375px / Desktop 1280px]
Route: [/path]

Design rules:
- Brand: coral #FF6F61 primary, #F8F9FA background, #FFFFFF cards
- Font: Pretendard Variable, 18px base body, minimum 15px
- Touch targets: minimum [52px mobile / 48px desktop]
- Border radius: 12px cards (rounded-xl), 8px buttons (rounded-lg)
- Line height: 1.75 body text
- Korean text: word-break keep-all

Layout: [구체적 레이아웃 설명]
Content: [섹션/컴포넌트 설명]
```

---

## 5. 양방향 워크플로우

### A방향: 코드 → Stitch (디자인 산출물 생성)

현재 구현된 코드를 기반으로 Stitch에서 시각적 디자인을 생성하는 흐름:

1. Claude Code가 페이지 컴포넌트 코드를 읽음
2. DESIGN.md 참조하여 Stitch 프롬프트 구성
3. 사용자가 Stitch에서 화면 생성
4. 결과: 디자이너 핸드오프 가능한 시각 자료

### B방향: Stitch → 코드 (디자인 변경 구현)

디자인 변경 사항을 코드에 반영하는 흐름:

1. 사용자가 Stitch에서 디자인 수정
2. Claude Code에 변경된 화면 전달
3. Claude Code가 `get_screen_code`로 HTML 추출
4. 현재 코드와 diff 비교
5. **시니어 친화 제약조건 검증** (DESIGN.md Section 5)
6. React/Tailwind 컴포넌트에 반영
7. 필요 시 DESIGN.md 업데이트

### 제약조건 검증 (B방향에서 필수)

Stitch 출력물을 코드로 변환할 때, 아래 사항을 반드시 검증:

| 검증 항목 | 기준 |
|-----------|------|
| 터치 타겟 | 모바일 52px / 데스크탑 48px 이상 |
| 폰트 크기 | 최소 15px, 본문 18px |
| 줄간격 | 본문 1.75 |
| 색상 대비 | WCAG AA (4.5:1) |
| 버튼 높이 | 52px (모바일) / 48px (데스크탑) |
| 광고 라벨 | "광고" 텍스트 존재 |

---

## 6. 핵심 파일

| 파일 | 역할 |
|------|------|
| `/DESIGN.md` | 디자인 시스템 전체 스펙 (Claude Code 참조용) |
| `/src/app/globals.css` | CSS Variables (Source of Truth) |
| `/tailwind.config.ts` | 폰트 스케일, 색상 매핑, 반응형 설정 |
| `/src/components/ui/` | UI 컴포넌트 라이브러리 |
| `/src/app/dev/components/page.tsx` | 컴포넌트 쇼케이스 (Stitch URL 임포트용) |
| `/docs/design/stitch-screens/screen-map.json` | Stitch screenId ↔ 라우트 매핑 |

---

## 7. 주의사항

| 항목 | 내용 |
|------|------|
| **Source of Truth** | 코드가 원본. Stitch는 시각화/참조용 |
| **직접 복사 금지** | Stitch HTML을 그대로 붙여넣지 말 것. Claude Code가 변환 |
| **크레딧 관리** | 월 350회 제한. 유사 화면은 복제+수정으로 절약 |
| **폰트** | Stitch에서 Pretendard 미지원 가능. 코드에서만 정확한 폰트 적용 |
| **Google Labs** | 실험적 서비스. DESIGN.md는 도구 무관하게 유지 |
