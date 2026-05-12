# 카페·스크래퍼·페르소나 에이전트 시스템 딥다이브

> 작성일: 2026-05-12 | 코드 실측 기반 + Playwright 프로덕션 감사 결과 통합
> 목적: 콘텐츠·댓글 퀄리티 → 화제글 → 홈 노출 → 신규 유저 PV 증가 경로 확보

---

## Executive Summary

### 딥크롤링 실행 현황 (실측 — 3번 모두 정상)

| 일시 | 모드 | 결과 | 수집 시도 / 실제 저장 |
|------|------|------|--------------------|
| 2026-05-11 20:00 KST | DEEP | ✅ 완료 (2회 재시도) | 160건 / 13건 저장 |
| 2026-05-12 08:31 KST | DEEP | ✅ 완료 | 270건 / 27건 저장 |
| 2026-05-11 12:55 KST | QUICK | ✅ 완료 | 14건 / 10건 저장 |

**락파일:** `/tmp/unao-crawler.lock` 없음 — 정상 정리됨

### 지금 가장 큰 3가지 문제

1. **게시글 본문에 `**`·HTML 잔재 노출** — 사용자가 직접 보는 퀄리티 문제 (B1-B4)
2. **댓글이 실제로 달리지 않음** — 이미지 전용 글 + 파동 상한선 + 거짓 SUCCESS (D1-D5)
3. **크롤링 수율 10%** — 270건 시도해도 27건만 페르소나 에이전트에 전달 (H1-H4)

### Playwright 프로덕션 감사 결과

| 보드 | RC-2 의심 (본문 50자 미만) | HTTP 429 | 비고 |
|------|--------------------------|----------|------|
| 사는이야기 30건 | 1건 (47자, 경계값) | 5건 | 실질 이상 없음 |
| 2막준비 30건 | 0건 | 4건 | 정상 |
| 웃음방 30건 | **11건** (본문 9자) | 6건 | 이미지 전용 글 — 텍스트 미존재 |

> 웃음방 11건은 RC-2(빈 본문)가 아니라 **이미지 전용 글이 의도적으로 저장된 것**. 하지만 이 글들에 댓글 파동이 예약돼도 실제로 댓글이 달리지 않는 구조적 문제가 있다.

---

## 1. 게시글 본문 오염 — `**` 마크다운·HTML 잔재 노출 [HIGH]

### 증상
사용자가 실제 게시글에서 `**` 문자, `&lt;`, 개발 메타데이터 등이 그대로 보임.

### 원인 1: stripMarkdown() 엣지케이스 미처리 (`generator.ts:392-405`)

```typescript
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')       // *italic* → italic
    // ... 기타 패턴
    .replace(/\*+/g, '')               // 나머지 * 일괄 제거
}
```

**문제:** 정규식 `.+?` (non-greedy)이 중첩·멀티라인 패턴을 처리 못함.
예: `**굵게\n다음줄**` → `**`가 그대로 남음.
Claude API가 가끔 마크다운을 섞어 반환할 때 완전히 제거되지 않음.

### 원인 2: sanitizeHtml()이 마크다운을 무시함 (`src/lib/sanitize.ts:28-30`)

```typescript
export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty, SANITIZE_OPTIONS)  // HTML 태그만 정제
}
```

`sanitize-html` 라이브러리는 HTML 태그만 처리. `**bold**`는 HTML이 아니므로 **그대로 통과**.

### 원인 3: 프론트엔드가 평문으로 그대로 표시 (`[postId]/page.tsx:192`)

```typescript
<div
  className="post-content"
  dangerouslySetInnerHTML={{ __html: proxyR2Images(sanitizeHtml(post.content)) }}
/>
```

`post.content`에 `**`가 있으면 브라우저가 평문으로 그대로 렌더링.

### 원인 4: 스크래퍼 HTML 이스케이프 이중 처리 (`content-transformer.ts`)

`sanitize-html`이 위험 태그를 이스케이프할 때 `&lt;script&gt;` 형태로 저장 →
이후 `dangerouslySetInnerHTML`에서 `&lt;` 문자열이 그대로 출력.

### 수정 방법

**Step 1 — `generator.ts` stripMarkdown 강화 (라인 392-405):**

```typescript
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/gm, '')                    // ## 헤딩
    .replace(/\*\*\*(.+?)\*\*\*/gs, '$1')          // ***bold italic***
    .replace(/\*\*(.+?)\*\*/gs, '$1')              // **bold** (멀티라인 포함)
    .replace(/\*(.+?)\*/gs, '$1')                  // *italic*
    .replace(/__(.+?)__/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/~~(.+?)~~/gs, '$1')
    .replace(/`{3}[\s\S]+?`{3}/g, '')             // 코드블록 전체 제거
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*+/g, '')                           // 나머지 * 제거
    .replace(/_{2,}/g, '')
    .trim()
}
```

**Step 2 — API 저장 전 한 번 더 strip (`src/app/api/bot/posts/route.ts`):**

```typescript
import { stripMarkdownForStorage } from '@/lib/content-utils'
// content 저장 전
const cleanContent = stripMarkdownForStorage(body.content)
```

**Step 3 — 스크래퍼 이스케이프 방지 (`content-transformer.ts`):**

`sanitize-html` 옵션에서 `textFilter`로 HTML 엔티티를 디코딩 후 재저장하도록 설정.

---

## 2. 댓글이 안 달리는 이유 [HIGH]

### 전체 파이프라인

```
sheet-scraper.ts → Post(isFeatured=true) + BotLog(SHEET_COMMENT_WAVE_PENDING)
                          ↓ [30분마다 agents-sheet-viral.yml 실행]
              processPendingSheetCommentWaves() [scheduler.ts:1121]
                          ↓
              generateSheetViralComment() [generator.ts:873]
                          ↓ (실패 5가지 경로)
              댓글 미생성 + BotLog SUCCESS 거짓 기록
```

### 원인 D1: SHEET 화제글에 일반 시드봇 댓글 차단 (`scheduler.ts:467-471`)

```typescript
// 화제글(SHEET 원본)에는 일반 시드봇 댓글 금지
if (postMeta?.isFeatured && postMeta?.source === 'SHEET') continue
```

SHEET 화제글은 스크래퍼봇(BI~BW) 전담. 일반 78명 페르소나는 **완전히 차단**.
→ 스크래퍼봇 파동이 실제로 실행되어야만 댓글이 달림.

### 원인 D2: 일일 파동 상한선 20개 초과 시 전부 스킵 (`scheduler.ts:1125-1134`)

```typescript
const todayViralCount = await prisma.botLog.count({
  where: { action: { in: ['SHEET_LIKE_WAVE_PENDING', 'SHEET_COMMENT_WAVE_PENDING'] },
           createdAt: { gte: startOfKstDay() } },
})
if (todayViralCount > 20) return  // 상한 초과 → 즉시 종료
```

화제글 1개당 4파동(좋아요 1 + 댓글 3) 예약 → 화제글 5개만 있어도 20개 상한 달성.
이후 올라오는 모든 파동 **완전 무시**.

### 원인 D3: 이미지 전용 글 — AI 호출 전 빈 문자열 반환 (`generator.ts:880-884`)

```typescript
const cleanText = rawContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
if (cleanText.length < 50) {
  console.log(`[SheetViral] 본문 텍스트 부족 (${cleanText.length}자) — 이미지 전용 글 댓글 스킵`)
  return ''  // ← 빈 문자열 반환
}
```

Playwright 감사에서 웃음방 11건이 본문 9자로 확인됨 → 이 글들은 댓글 파동이 예약됐어도 **실제 댓글 0개**.
BotLog는 SUCCESS로 마킹되어 창업자가 정상 동작으로 착각 가능.

### 원인 D4: 키워드 검증 루프 버그 (`generator.ts:917-939`)

```typescript
const maxAttempts = 2
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  const response = await client.messages.create({...})
  const cleaned = stripMarkdown(comment)
  const hasKeyTerm = keyTerms.length === 0 || keyTerms.some(term => cleaned.includes(term))
  if (hasKeyTerm || attempt === maxAttempts - 1) {
    return cleaned  // ← 2차 시도에서 키워드 없어도 무조건 반환
  }
}
```

1차 시도에서 키워드 불일치 → 2차 재시도 → 여전히 불일치지만 `attempt === 1`이므로 무조건 반환.
저품질 댓글이 DB에 저장되거나, 빈 문자열로 다음 단계에서 스킵됨.

### 원인 D5: 빈 댓글 스킵 시 로그 없음 (`scheduler.ts:1195`)

```typescript
if (!commentText || commentText.length < 5) continue  // ← 로그 없음
```

얼마나 많은 댓글이 이 경로로 사라졌는지 **집계 불가**. BotLog에도 기록 없음.

### 수정 방법

**D2 상한선 조정:** `todayViralCount > 20` → `todayViralCount > 50` (화제글 10개까지 처리)

**D3 이미지 전용 글 댓글 대안:**
```typescript
if (cleanText.length < 50) {
  // 이미지 전용 글: 제목 기반으로 짧은 반응 댓글 생성
  return await generateImageOnlyReaction(post.title, personaId)
  // 또는 파동 자체를 BotLog SKIPPED로 마킹하고 거짓 SUCCESS 방지
}
```

**D5 로그 추가:**
```typescript
if (!commentText || commentText.length < 5) {
  console.warn(`[SheetViral] 빈 댓글 스킵: postId=${postId} persona=${personaId} len=${commentText?.length ?? 0}`)
  await updateBotLogStatus(logId, 'SKIPPED', { reason: 'empty_comment' })
  continue
}
```

---

## 3. 크롤링 수율 10% — 270건 → 27건 [HIGH]

### 수율 계산

```
270건 수집 시도
  → 연속 5회 실패 차단 (H1): ~5% 손실
  → 크롤링 실패 (HTML 파싱): ~15% 손실
  → quality-scorer minSave=30 미달: ~30% 필터
  → isUsable=false (minUsable=60): ~40% 필터
  → 최종 저장: ~27건 (10%)
```

### 원인 H1: 연속 5회 실패 시 전체 카페 스킵 (`crawler.ts:823-829`)

```typescript
if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {  // MAX=5
  console.warn(`연속 ${MAX_CONSECUTIVE_FAILS}회 실패 — 카페 스킵`)
  break  // ← 나머지 글 전부 버림
}
```

처음 5개 글에서 네트워크 오류 발생 시 남은 45개를 처리하지 않음.
**오늘 아침 dlxogns01(은퇴카페) ETIMEDOUT이 3회 재시도 후 전체 미수집으로 이어진 근본 원인.**

### 원인 H2: 텍스트 전용 글 미디어 페널티 (`quality-scorer.ts:56-65`)

```typescript
function scoreMedia(post: RawCafePost): number {
  if (videoCount > 0 && imageCount >= 3) return 100
  if (imageCount >= 1) return 50
  return 10  // 텍스트 전용 → 10점 고정
}
// WEIGHTS.media = 0.05 → 0.05 × 10 = 0.5점만 기여
```

감정글·고민글 같은 고질 텍스트 글이 이미지 없다는 이유로 점수 하락.
결과적으로 **50~60대가 실제로 쓰는 감정적인 글이 isUsable=false로 페르소나에 안 들어감.**

### 원인 H3: 날짜 파싱 실패 시 최신성 0점 (`quality-scorer.ts:98-111`)

```typescript
function scoreRecency(post: RawCafePost): number {
  if (post.dateParseFailure) return 0  // WEIGHTS.recency=0.15 통째로 0
  // ...
}
```

네이버 카페 날짜 형식이 불규칙("어제", "3일 전", "2024.12.15 오후")하면 파싱 실패.
최신성 15점이 0이 되면 총점 10-15점 하락 → minUsable=60 미달.

### 원인 H4: dlxogns01 ETIMEDOUT (`crawler.ts`, 오늘 실측)

은퇴카페(dlxogns01) 3회 재시도 모두 ETIMEDOUT → 카페 전체 0건 수집.
크롤링 소스의 50%에 해당하는 카페가 통째로 누락됨.

### 수정 방법

**H1 — 연속 실패 차단 완화:**
```typescript
// MAX_CONSECUTIVE_FAILS: 5 → 10으로 상향
// 또는 실패한 글만 스킵하고 다음 글 계속 시도
const MAX_CONSECUTIVE_FAILS = 10
```

**H2 — 텍스트 전용 글 가중치 재조정:**
```typescript
// 텍스트 고민/감정글 가중치 상향
const WEIGHTS = {
  engagement: 0.40,
  contentLength: 0.25,  // 0.20 → 0.25
  media: 0.05,          // 현행 유지 (감점 역할 제거)
  boardPriority: 0.20,
  recency: 0.10,        // 0.15 → 0.10
}
// 텍스트 전용 미디어 점수: 10 → 30으로 완화
```

**H3 — 날짜 파싱 실패 시 페널티 완화:**
```typescript
if (post.dateParseFailure) return 50  // 0 → 50 (중립값)
```

**H4 — ETIMEDOUT 재시도 간격 조정:**
```typescript
const CRAWL_RETRY_WAIT_MS = 120_000  // 60s → 120s (IP 쿨다운)
```

---

## 4. CRITICAL — 즉시 수정 필요

### C1: 저녁 매거진 0건 생성 (launchd-alert.sh 권한 오류)

**증상:** `Operation not permitted` (exit 126)
**원인:** `scripts/launchd-alert.sh`가 chmod 644 → launchd가 실행 불가

**수정:**
```bash
chmod +x /Users/yanadoo/Documents/New_Claude_agenotmatter/scripts/launchd-alert.sh

# launchd 리로드
launchctl unload ~/Library/LaunchAgents/com.unaeo.magazine-late.plist
launchctl load ~/Library/LaunchAgents/com.unaeo.magazine-late.plist
```

### C2: 매일 아침 콘텐츠 큐레이션 미실행 (`content-curator.ts:414`)

**증상:** `TypeError: Cannot read properties of null (reading 'toLowerCase')`
**원인:** 심리분석(psych) JSON 파싱 실패 시 null이 큐레이터에 전달됨

**수정 (`content-curator.ts:414` 부근):**
```typescript
// 현재
const category = psychResult.dominantDesire.toLowerCase()

// 수정
if (!psychResult?.dominantDesire) {
  console.warn('[ContentCurator] dominantDesire 없음 — 스킵')
  return
}
const category = psychResult.dominantDesire.toLowerCase()
```

### C4: dlxogns01 은퇴카페 ETIMEDOUT

**증상:** 3회 재시도 모두 실패 → 카페 전체 0건
**원인:** 네이버 IP 제한 또는 타임아웃 설정 미흡

**수정:** 재시도 간격 60s → 120s, 타임아웃 30s → 45s 조정 (`crawler.ts` 상단 상수)

---

## 5. 파이프라인 Error Swallowing (RC-1) [MEDIUM]

### 문제

```typescript
// run-pipeline.ts:91
catch (err) {
  console.error(`[Pipeline] ${label} ❌ 실패:`, errorMsg)
  await notifySlack({ ... })
  // ← throw 없음. 다음 단계 계속 실행.
}

// run-pipeline.ts:399
} catch (err) {
  console.warn(`[Pipeline] reportPipelineStage(${stage}) 실패 (무시):`)
  // ← "무시" 주석. 완전 침묵.
}
```

**발현 시나리오:**
- 크롤링 실패 → Slack 알림 → 심리분석 단계 **그대로 실행**
- 최종 로그: "전체 완료" — 실제 2단계 실패했어도

### 수정

크롤링(crawl)은 중단 불가 전제로 설계된 것이므로, 단계별 의존성을 명시:

```typescript
// run-pipeline.ts — 크롤 실패 시 이후 분석 단계 스킵
const crawlSuccess = await run('크롤링', crawlFn)
if (!crawlSuccess) {
  await notifySlack({ message: '[Pipeline] 크롤 실패 — 분석 단계 전부 스킵' })
  return  // ← psych/trend/brief 실행 안 함
}
await run('심리분석', psychFn)
```

---

## 6. 콘텐츠 Silent Failures (RC-2) [MEDIUM]

### Q1: 빈 본문 + fallback 제목 DB 저장 (`generator.ts:679-683`)

```typescript
return {
  title: stripMarkdown(rawTitle || `${p.nickname}의 일상`),  // API 실패 → fallback
  content: stripMarkdown(rawBody || text),                   // text='' → 빈 본문 저장
}
```

**수정:**
```typescript
if (!rawBody && !text) throw new Error(`[generatePost] 빈 본문 반환: persona=${p.id}`)
if (!rawTitle) throw new Error(`[generatePost] 제목 없음: persona=${p.id}`)
```

### Q2: KST 보정 없는 UTC 기준 todayStart (`scheduler.ts:742`)

```typescript
// 현재 (UTC 기준 — KST 00:00~09:00에 날짜 오계산)
const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)

// 수정 (KST 기준)
function startOfKstDay(): Date {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  kst.setUTCHours(0, 0, 0, 0)
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000)
}
```

---

## 7. Observability Gap (RC-3) [MEDIUM]

### 지금 보이지 않는 것

| 지표 | 현재 상태 | 영향 |
|------|---------|------|
| 댓글 빈 반환 건수 | 집계 없음 | D3/D4 발현 규모 파악 불가 |
| 크롤링 qualityScore 분포 | DB 저장만, 리포트 없음 | 수율 10% 원인 추적 불가 |
| 페르소나별 생성 실패율 | BotLog 개별 실패 미기록 | 어떤 페르소나가 문제인지 모름 |
| 킬러포스트 재료 재고 | 조회 불가 | qualityScore≥7 CafePost 0개면 자동 중단 |
| 오늘 화제글 수 | 수동 DB 조회 필요 | 홈 PV 예측 불가 |

### 최소한의 개선

`seed:viral-waves` 핸들러 실행 후 Slack 일일 리포트 추가:

```
[일일 콘텐츠 리포트]
- 오늘 발행: 25건 (킬러포스트 2건 포함)
- 댓글 달린 글: 18건 / 달리지 않은 글: 7건 (이미지 전용 5 + 빈 반환 2)
- CafePost 재고 (score≥7): 43건
- 내일 크롤 예정: 08:30 KST
```

---

## 8. 화제글 → 홈 노출 → PV 증가 경로 점검

### 현재 경로

```
카페 크롤링 → CafePost (qualityScore ≥ 7, isUsable=true)
    ↓ [09:10, 22:10 KST — agents-killer-post.yml]
킬러포스트 생성 (isFeatured=true, featuredAt=now)
    ↓ [T+10분 / +1h / +3h]
봇 댓글 3파동 (3 → 4 → 3개)
    ↓ [14:00, 21:00 KST — focusedLikeRound]
좋아요 10개 누적 → promotionLevel=HOT → 홈 상단 노출
    ↓
신규 유저 유입 → 실제 댓글 달림 → likeCount 증가
```

### 현재 막혀있는 지점

| 단계 | 상태 | 이유 |
|------|------|------|
| 카페 크롤링 | ⚠️ 수율 10% | H1-H4 |
| CafePost 재고 | 알 수 없음 | RC-3 |
| 킬러포스트 생성 | 하루 최대 2건 | 정상 |
| 봇 댓글 파동 | ⚠️ 많이 안 달림 | D1-D5 |
| SHEET 화제글 댓글 | ⚠️ 이미지 전용 글은 0개 | D3 |
| 게시글 내용 | ⚠️ `**` 노출 | B1-B4 |

### SHEET 화제성 파이프라인 (스크래퍼 → 댓글 파동)

```
오늘의유머·네이트판 → sheet-scraper.ts (isFeatured=true)
    ↓ [T+2분: 좋아요 파동]
BI~BP 10명 좋아요 예약 → processPendingSheetCommentWaves()
    ↓ [T+5분: empathy 댓글]
BS~BW 5명 공감 댓글
    ↓ [T+35분: critical 댓글]
V, W, AB, Y, AA 5명 반론
    ↓ [T+65분: reversal 댓글]
AE, P, AD, BG, BH 5명 역전 댓글
```

**이미지 전용 글(웃음방 11건처럼)이 화제글로 등록되면 댓글 파동이 예약되지만 실제로 달리지 않음** → 화제글인데 댓글 0개 → 홈 노출 효과 없음.

---

## 개선 우선순위 매트릭스

| 우선순위 | 이슈 | 영향도 | 난이도 | 예상 공수 |
|---------|------|-------|-------|---------|
| P0 | C1: magazine-late 권한 수정 | 저녁 매거진 복구 | 낮음 | 5분 |
| P0 | C2: content-curator null 체크 | 아침 큐레이션 복구 | 낮음 | 15분 |
| P0 | B1-B3: stripMarkdown + sanitize 수정 | 사용자 가시 품질 | 중간 | 1-2시간 |
| P1 | D2: 댓글 파동 상한선 20→50 | 댓글 달리는 글 수 증가 | 낮음 | 10분 |
| P1 | D3: 이미지 전용 글 댓글 대안 | 웃음방 화제글 활성화 | 중간 | 2시간 |
| P1 | D5: 빈 댓글 스킵 로그 추가 | 디버깅 가능 | 낮음 | 30분 |
| P2 | H2: 텍스트 전용 가중치 완화 | 크롤 수율 개선 | 낮음 | 30분 |
| P2 | H3: 날짜 파싱 페널티 완화 | 크롤 수율 개선 | 낮음 | 20분 |
| P2 | Q1: generatePost 빈 본문 throw | RC-2 방지 | 낮음 | 30분 |
| P2 | Q2: KST todayStart 보정 | 킬러포스트 중복 방지 | 낮음 | 20분 |
| P3 | M1-M3: RC-1 Error Swallowing 수정 | 파이프라인 신뢰성 | 높음 | 4시간 |
| P3 | RC-3 일일 리포트 추가 | 운영 가시성 확보 | 중간 | 3시간 |

---

## 부록: 실측 기반 전체 이슈 코드 인덱스

| 코드 | 파일 | 라인 | 심각도 |
|------|------|------|--------|
| B1 | agents/seed/generator.ts | 392-405 | HIGH |
| B2 | src/lib/sanitize.ts | 28-30 | HIGH |
| B3 | src/app/(main)/community/[boardSlug]/[postId]/page.tsx | 192 | HIGH |
| B4 | agents/community/content-transformer.ts | 39-110 | HIGH |
| C1 | scripts/launchd-alert.sh | — | CRITICAL |
| C2 | agents/cafe/content-curator.ts | 414 | CRITICAL |
| C4 | agents/cafe/crawler.ts | ETIMEDOUT 상수 | CRITICAL |
| D1 | agents/seed/scheduler.ts | 467-471 | HIGH |
| D2 | agents/seed/scheduler.ts | 1125-1134 | HIGH |
| D3 | agents/seed/generator.ts | 880-884 | HIGH |
| D4 | agents/seed/generator.ts | 917-939 | HIGH |
| D5 | agents/seed/scheduler.ts | 1195 | HIGH |
| H1 | agents/cafe/crawler.ts | 823-829 | HIGH |
| H2 | agents/cafe/quality-scorer.ts | 56-65 | HIGH |
| H3 | agents/cafe/quality-scorer.ts | 98-111 | MEDIUM |
| H4 | agents/cafe/crawler.ts | ETIMEDOUT | CRITICAL |
| M1 | agents/cafe/run-pipeline.ts | 91 | MEDIUM |
| M2 | agents/cafe/run-pipeline.ts | 399 | MEDIUM |
| M3 | agents/cafe/run-pipeline.ts | 186-210 | MEDIUM |
| Q1 | agents/seed/generator.ts | 679-683 | MEDIUM |
| Q2 | agents/seed/scheduler.ts | 742 | MEDIUM |
