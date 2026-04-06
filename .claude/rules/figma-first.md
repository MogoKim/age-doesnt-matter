# Figma-First 개발 원칙

## ⚠️ 매 세션 시작 전 필수 — Figma 플러그인 실행

**Claude Code가 Figma에 쓰기 작업을 하려면 Figma 플러그인이 반드시 실행 중이어야 한다.**

창업자가 Figma 작업 요청 시 Claude가 먼저 확인:
```
"Figma 플러그인 켜져 있어요? (Figma → Plugins → Claude MCP → Run)"
```

### 확인 절차 (Claude가 자동 실행)
1. `curl http://localhost:3055/channels` → 활성 채널 있으면 OK
2. 채널 없으면: **"Figma 열고 플러그인 실행해주세요 (Plugins → Claude MCP → Run)"** 안내
3. 채널 감지 후 `join_channel(채널명)` 자동 호출

### 플러그인 실행 경로
```
Figma Desktop 앱 열기
→ 상단 메뉴 Plugins
→ "Claude MCP" 플러그인 클릭
→ Run 또는 채널명 복사 필요 없음 (자동 감지)
```

> **Why:** WebSocket 방식은 Figma 플러그인이 서버에 연결해야 채널이 생성됨.
> LaunchAgent로 WebSocket 서버(port 3055)는 항상 가동 중이나,
> 채널(플러그인↔서버 연결)은 사용자가 플러그인을 실행해야 생성됨.

---

## 핵심 규칙

신규 기능/페이지 개발 시 반드시 아래 순서를 따른다.

1. 창업자 또는 CPO가 Product Designer에게 Figma 설계 요청
2. Product Designer가 Figma에 화면 그리기 (`mcp__figma-write__*` 도구 사용)
3. 창업자가 Figma 검토 및 승인 ("승인해" 발화)
4. 승인 후에만 Claude Code가 코딩 시작
5. 코딩 완료 후 Figma와 코드 동기화 확인

**위반 시**: 코드를 짜지 말고 반드시 "Figma 설계 먼저 필요합니다"라고 알린다.

---

## 예외 (즉시 코딩 가능한 경우)

- 버그 수정 (기존 화면 변경 없음)
- 백엔드 로직 변경 (UI 없음)
- 성능 최적화 (UI 없음)
- 긴급 핫픽스 (창업자가 명시적으로 "지금 바로 코딩해" 요청 시)

---

## 역공학 (기존 코드 → Figma)

기존에 코드가 먼저 짜진 화면들은 역공학으로 Figma에 복원한다.

명령:
```
"Product Designer야, [페이지명] Figma 역공학해줘"
"Product Designer야, 전체 Figma 초기화해줘"
```

역공학 순서:
1. Design System (DESIGN.md → Figma Variables)
2. 공통 컴포넌트 (src/components/ui/)
3. 페이지별 화면 (데스크탑 1440px + 모바일 390px)
4. User Flow 화살표

---

## 디자인 시스템 원칙

- 원본: `DESIGN.md` + Figma Variables
- 브랜드 컬러: #FF6F61 (primary)
- 폰트: Pretendard Variable
- 최소 폰트: 15px (본문 18px)
- 터치 타겟: 52px × 52px 이상
- 모달: 모바일=하단 시트 / 데스크탑=중앙 팝업

---

## MCP 도구 목록 (Product Designer가 사용)

```
읽기: get_document_info, get_node_info, get_pages, get_styles, get_variables
그리기: create_frame, create_rectangle, create_text, set_fill_color,
        set_font_size, set_auto_layout, create_connector, create_page,
        group_nodes, move_node, resize_node
```
