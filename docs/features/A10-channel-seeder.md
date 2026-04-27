# 채널 시딩 운영 기획서 (A10)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

우나어 콘텐츠를 카카오 오픈채팅·당근마켓·온라인 커뮤니티에  
AI가 채널별 톤으로 초안을 자동 생성하고 창업자 승인 후 수동 배포함으로써  
외부 채널을 통한 신규 유입을 확보한다.

---

## 배경

- Threads/X/Instagram은 공식 SNS 포스팅(A06)이 담당
- 카카오 오픈채팅·당근마켓 동네생활·네이버 카페 등 "생활 채널"은 자연스러운 경험담 톤 필요
- 광고처럼 보이면 삭제되므로 AI가 "58세 영숙이맘" 페르소나로 초안 생성 → 창업자 검토 후 배포
- 채널별로 길이·톤이 다르므로 채널별 System Prompt 분리

---

## 세부 기획

### 타겟 채널 3개

| 채널 | 타겟 | 톤 | 길이 | 비고 |
|------|------|-----|------|------|
| `KAKAO_OPENCHAT` | 50대 모임방, 건강 오픈톡, 은퇴 후 생활방 | 구어체, 친근 | 자유 | 오픈채팅방 글쓰기 |
| `DANGGEUN` | 동네생활 게시판 이웃 | 간결, 정보성 | 50~80자 | 당근마켓 동네생활 |
| `COMMUNITY` | 네이버/다음 카페 | 자연스러운 경험담 | 200~300자 | 커뮤니티 사이트 |

---

### AI 페르소나

- **이름**: 58세 영숙이맘
- **금지 표현**: "시니어", "액티브 시니어", 광고 문구, 경어체 과다
- **허용**: 경험담 형식, 마지막에 링크 살짝만
- **모델**: Claude Haiku (경량, 비용 최소화)

---

### 실행 파이프라인

```
1. fetchContentSources()
   - 최근 24h 인기글 3개 (Post, PUBLISHED)
   - 최신 매거진 1개
   - 최신 일자리 3개

2. Promise.all([KAKAO_OPENCHAT, DANGGEUN, COMMUNITY])
   - 채널별 System Prompt + 오늘의 콘텐츠 → Claude Haiku
   - 응답: { drafts: [{ targetName, draftText, linkUrl }] }
   - JSON 파싱 실패 시: 빈 배열 fallback

3. ChannelDraft.create() × N (채널별 초안 저장)
   AdminQueue.createApprovalRequest() → Slack #승인-대기 Block Kit 버튼

4. notifySlack() → BotLog.create()
```

---

### 스케줄 / 실행 환경

| 핸들러 | 워크플로우 | UTC 크론 | KST |
|--------|----------|---------|-----|
| `cmo:channel-seeder` | `agents-social.yml` | `30 2 * * *` | 매일 11:30 |

**실행 환경**: GHA ubuntu-latest, Node 20  
**AI 모델**: Claude Haiku

---

### Slack 알림

| 조건 | 채널 | 내용 |
|------|------|------|
| 초안 생성 완료 | #승인-대기 | 채널별 초안 목록 + 승인 버튼 (Block Kit) |
| 치명적 오류 | SYSTEM | critical 알림 |

---

### BotLog

- `botType: 'CMO'`
- `action: 'CHANNEL_SEED'`
- `status: 'SUCCESS'` (totalDrafts > 0) / `'PARTIAL'` (0건)
- `details: { channels, sources: { popularPosts, magazine, jobs } }`
- `itemCount: totalDrafts`

---

### DB 스키마

| 테이블 | 작업 | 내용 |
|--------|------|------|
| `Post` | 읽기 | 인기글·매거진·일자리 수집 |
| `ChannelDraft` | 쓰기 | 채널별 초안 저장 |
| `AdminQueue` | 쓰기 | 창업자 승인 요청 등록 |
| `BotLog` | 쓰기 | 실행 결과 로깅 |

---

### 비용 영향

| 항목 | 단가 | 빈도 | 월간 |
|------|------|------|------|
| Claude Haiku (채널 3개 병렬) | ~$0.0001/호출 | 3회/일 | ~$0.009 |
| **합계** | — | — | **~$1/월 이하** |

---

## 미완성 / 향후 개선

| 항목 | 상태 | 비고 |
|------|------|------|
| 초안 자동 발행 | ❌ 미구현 | 현재 창업자 수동 복붙 |
| 이미지 첨부 | ❌ 미구현 | `imageUrls: []` 고정 |
| NAVER_KNOWLEDGE | ❌ 스키마만 존재 | 코드 미구현, 동작 영향 없음 |
| 초안 재생성 UI | ❌ 미구현 | Slack 승인 버튼 외 수정 불가 |

---

## 관련 링크

- 채널 시더: `agents/cmo/channel-seeder.ts`
- GHA 워크플로우: `.github/workflows/agents-social.yml` — line 247
- Runner 핸들러: `agents/cron/runner.ts` — line 95 `cmo:channel-seeder`
- DB 모델: `prisma/schema.prisma` — ChannelDraft, AdminQueue

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | - | - | - |
