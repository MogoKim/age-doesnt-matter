---
id: F09
name: 어드민 패널
status: ACTIVE
created: 2026-05-14
updated: 2026-05-20
---

# F09 — 어드민 패널

## 개요
운영자 전용 관리 패널. 콘텐츠·멤버·에이전트·배너·큐 등 서비스 전반을 관리한다.

## 주요 기능
| 섹션 | 경로 | 설명 |
|------|------|------|
| 콘텐츠 관리 | `/admin/content` | 게시글 필터·검색·상태 변경·일괄 액션 |
| 멤버 관리 | `/admin/members` | 회원 조회·제재 |
| 에이전트 로그 | `/admin/agents` | BotLog 조회 |
| 배너 관리 | `/admin/banners` | 광고·프로모 배너 |
| AdminQueue | `/admin/queue` | 창업자 승인 큐 |

## 콘텐츠 관리 필터 구조
`source` + `botType` 파라미터로 게시글 출처 세분화:

| 드롭다운 항목 | botType 값 | 실제 DB 조건 |
|--------------|-----------|-------------|
| 전체 소스 | (없음) | — |
| 실고객 | `user` | source=USER |
| 시드봇 | `seed` | source=BOT, cafePostId IS NULL |
| 큐레이션봇 | `curate` | source=BOT, cafePostId IS NOT NULL |
| 스크래퍼봇 | `sheet` | source=SHEET |
| NNN | `admin` | source=ADMIN |

> ⚠️ 시드봇/큐레이션봇 구분: cafePostId 기반(best-effort). 비킬러 큐레이션글은 시드봇 버킷에 포함될 수 있음.

## 코드 위치
| 파일 | 역할 |
|------|------|
| `src/app/admin/(panel)/content/page.tsx` | 콘텐츠 관리 페이지 (SSR 필터 파싱) |
| `src/components/admin/ContentTable.tsx` | 콘텐츠 테이블 + 필터 UI (client) |
| `src/lib/queries/admin/admin.content.ts` | getContentList() 쿼리 (botType 지원) |

## 수정 이력
| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-05-20 | 콘텐츠 필터 botType 추가 — 실고객/시드봇/큐레이션봇/스크래퍼봇/NNN | 봇 유형별 조회 필요 |
| 2026-05-24 | 회원 글·댓글 드릴다운 — 글/댓글 수 클릭 시 우측 드로어에서 목록 조회 (UserContentDrawer 신규, adminGetUserPosts/adminGetUserComments 추가) | 어드민이 특정 회원의 콘텐츠 활동을 페이지 이동 없이 확인 필요 |
| 2026-05-26 | 게시판·카테고리 인라인 수정 — ContentTable 게시판 셀 클릭으로 STORY/LIFE2/HUMOR 이동 + 카테고리 변경 (BoardCategoryCell 신규, adminMovePost server action 추가, AdminAuditLog POST_MOVE 기록) | 잘못 분류된 게시글을 DB 직접 수정 없이 어드민에서 이동 |
| 2026-05-29 | 대시보드 통합 개편 — /admin 단일 페이지로 통합 (/admin/analytics 리다이렉트), OKR 선행지표(UV/avgPV/전환율/D7) 교체, EventLog 기반 UV·트렌드·게시판활성도 추가, 봇 순서 ERROR→ACTIVE→DORMANT 변경 | 광고 집행 시작으로 비회원 트래픽 급증 — lastLoginAt 기반 MAU로는 실방문 미집계 |
