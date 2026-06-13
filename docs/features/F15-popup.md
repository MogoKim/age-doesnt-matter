---
id: F15
name: 팝업 (공지·이벤트·홍보)
status: ACTIVE
created: 2026-06-06
updated: 2026-06-06
---

## 개요
대상 페이지 진입 시 뜨는 팝업. 공지·이벤트 안내 / 콘텐츠 홍보 / 프로모션 배너 용도. 어드민에서 등록·관리하며 센터·바텀·전면 3종 형태 + 기간·빈도 제어.

## 코드 위치
| 역할 | 파일 |
|------|------|
| 사용자 렌더 (3종 + 닫기/빈도/추적) | `src/components/common/PopupRenderer.tsx` (`(main)/layout.tsx`에 렌더) |
| 어드민 폼·목록 | `src/components/admin/PopupManager.tsx` (`/admin/popups`) |
| 저장 액션 | `src/lib/actions/popups.ts` (create/update/toggle/delete) |
| 노출용 조회 | `src/lib/queries/popups.ts` (`getActivePopups` — 활성+기간+경로) |
| 노출/클릭 추적 API | `src/app/api/popups/route.ts` |
| DB 모델 | `prisma/schema.prisma` Popup (enum PopupType/PopupTarget) |
| 도움말 | `admin-help-texts.ts` POPUP_* |

## 형태 (PopupType)
| 형태 | 설명 | 권장 이미지 |
|------|------|-----------|
| CENTER | 화면 중앙 카드 (가장 무난·권장) | 1080×1080 (1:1) |
| BOTTOM_SHEET | 하단에서 올라오는 시트 | 1080×720 (3:2) |
| FULLSCREEN | 화면 전체 (이벤트용) | 1080×1920 (9:16) |
- 3종 모두 52×52px 원형 X(닫기) 버튼 (시니어 가독성).

## 대상·노출 규칙
- 대상(PopupTarget): ALL/HOME/COMMUNITY/LIFE2/JOBS/MAGAZINE/CUSTOM(경로 직접).
- 노출 조건: `isActive` + 현재 시각이 startDate~endDate 사이(**KST**) + 경로 매칭.
- 빈도: "하루 1회만 노출"(`showOncePerDay`) / "N일간 안보기"(`hideForDays`) — localStorage 기반. 시니어 UX상 빈도 제어 권장.
- 우선순위(priority desc)로 1개씩 표시, 닫으면 다음 팝업.

## 어드민 사용성 (2026-06-06 리뉴얼)
- 용도 프리셋(공지/홍보/프로모션) → 형태 자동.
- 실시간 미리보기(형태별 모양).
- 이미지 파일 업로드(`/api/admin/uploads/banner` 재사용) + 형태별 권장 규격 동적 표시.
- 시간 KST 입출력(`+09:00`), 전 필드 HelpTip + 운영 가이드 박스.

## 시간 처리
- 폼: `datetime-local`(KST 벽시계) → 저장 시 `+09:00` ISO → `new Date()` 정확 파싱.
- 표시: `toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })`.

## 수정 이력
| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-06-06 | 전면 리뉴얼: `POPUP_DISABLED` 제거(운영 활성화), 바텀시트 렌더 부활, X버튼 52px 가독성, 어드민 폼 개편(프리셋·미리보기·이미지업로드·규격명시·KST·HelpTip) | 그동안 꺼져 있어 노출 불가 + 어드민 사용성 최악 → 운영 가능 + 신입 직원도 이해 가능하게 |
| 2026-06-13 | 성능(Phase 1.5): `getActivePopups`가 서버에서 content를 sanitize해 `sanitizedContentHtml`로 응답 → 공개 `PopupRenderer`에서 `sanitizeHtml`(sanitize-html) import 제거. 공개 클라이언트 번들에서 sanitize-html/entities/htmlparser2 ~91KB 제거(전 페이지 bootup JS↓). 어드민 미리보기 sanitize는 유지(별도 청크). XSS 방어 수준 불변 | best/jobs 등 텍스트 페이지가 팝업 유무와 무관하게 90KB HTML 파서를 다운로드·parse하던 문제 제거 |
