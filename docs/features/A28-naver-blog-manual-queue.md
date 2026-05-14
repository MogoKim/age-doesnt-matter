# A28 — 네이버 블로그 수동 발행 큐

## 기본 정보

| 항목 | 내용 |
|------|------|
| ID | A28 |
| 기능명 | 네이버 블로그 수동 발행 큐 |
| 상태 | ACTIVE |
| 충족욕망 | GROWTH (콘텐츠 마케팅) |
| 실행환경 | LOCAL_ONLY |
| 최초 생성 | 2026-05-13 |

## 개요

매거진 포스트를 네이버 블로그용으로 LLM 변환 + Gemini 이미지 생성 후,
어드민 큐에 쌓아두면 창업자가 복붙 발행하는 반자동 파이프라인.

## 파일 위치

| 경로 | 역할 |
|------|------|
| `agents/naver-blog/poster.ts` | 변환 + 이미지 생성 + 큐 저장 |
| `agents/naver-blog/content-transformer.ts` | LLM 네이버 SEO 변환 |
| `agents/naver-blog/queue-manager.ts` | 큐 CRUD (Supabase) |
| `agents/naver-blog/config.ts` | 발행 정책 상수 |
| `src/app/admin/(panel)/naver-blog/page.tsx` | 어드민 큐 목록 페이지 |
| `src/app/admin/(panel)/naver-blog/[queueId]/page.tsx` | 어드민 큐 상세 (복사 발행) |
| `src/app/api/admin/naver-queue/route.ts` | 큐 API (GET/DELETE) |
| `~/Library/LaunchAgents/com.unaeo.naver-blog-morning.plist` | launchd 12:30 KST |
| `~/Library/LaunchAgents/com.unaeo.naver-blog-evening.plist` | launchd 18:30 KST |

## 플로우

```
launchd (12:30 / 18:30 KST)
  → poster.ts 실행
  → DB에서 오늘 발행 대상 매거진 포스트 조회
  → content-transformer → blogTitle + sections + hashtags + imagePrompts
  → Gemini 이미지 생성 + R2 업로드 (최소 6개)
  → NaverBlogQueue DB INSERT (status: READY_FOR_MANUAL)
  → Slack 알림 "📝 Naver 발행 대기"
  ↓
창업자 /admin/naver-blog 접속
  → 아이템 클릭 → 상세 페이지
  → 제목/본문/해시태그 복사 + 이미지 저장
  → 네이버 블로그에서 직접 발행
  → [발행 완료] 클릭 → DELETE API → 큐 삭제
```

## 운영 정책

- 발행 시각: 12:30 KST / 18:30 KST (launchd)
- 일 최대: 2건/일 (안정화 30일간: 1건/일)
- catch-up 1건 + 정기 1건 = 최대 2건/실행
- PENDING 48시간 초과 → 자동 EXPIRED
- FAILED 2건 이상 → HALT 조건

## 콘텐츠 기준 (SEO)

- 목표 글자수: 1,800자 (최소 1,000 / 최대 6,000)
- 해시태그: 5~10개
- 이미지: 최소 6개 (썸네일 + 본문 + Gemini 생성)
- 외부 링크: 최대 2개
- 금지어: 노인 · 할머니 · 시니어 · 어르신

## UTM 파라미터

- 글 중간 띠배너: `utm_source=naver_blog&utm_medium=blog&utm_campaign=content_marketing&utm_content=banner_mid`
- 글 마지막 배너: `utm_source=naver_blog&utm_medium=blog&utm_campaign=content_marketing&utm_content=banner_end`

## 수정 이력

| 날짜 | 변경 내용 | 이유 |
|------|----------|------|
| 2026-05-13 | 최초 구현 — 어드민 큐 UI + poster.ts + queue-manager.ts | SmartEditor Playwright 자동화 불가 → 수동 발행 전환 |
| 2026-05-14 | 어드민 큐 목록 페이지에 운영 가이드 토글 섹션 추가 (발행 스케줄·콘텐츠 기준·UTM 링크·GA4·큐 상태) | 창업자 운영 참조용 정보 상주화 |

## 이슈 이력

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| — | — | — | — |
