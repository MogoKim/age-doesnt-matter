# 우나어 비용 감사 대시보드
> 실측 기준: 2026-05-11 | 10개 서비스 창업자 직접 확인 완료

---

## 핵심 요약

| 항목 | 5월 실측 | 4월 비교 |
|------|---------|---------|
| **월 총비용** | **~$87/월** | **~$345/월** |
| Anthropic Claude | ~$55 | 비슷 |
| Vercel Pro | ~$22 | **~$280** (최적화 전) |
| Google Gemini | ~$8 (₩11,000) | 비슷 |
| OpenAI DALL-E | ~$1.5 | 비슷 |
| Supabase / Upstash / Resend / Cloudflare | $0 | $0 |
| 도메인 | ~$1.5 | 비슷 |
| **절감 효과** | **-$258/월** | Vercel 최적화 단 한 번으로 달성 |

> ✅ Vercel ignoreCommand + Standard 머신 설정으로 $258/월 절감. 연간 환산 $3,096.

---

## 1. Anthropic Claude — 실측 상세

**현재 잔액 (2026-05-11): $7.72** → 약 4일치 (이르면 5/13~14 재충전)

**자동충전 설정:** 잔액 $5 이하 → $15 충전 | 월 ~5회 재충전 = ~$55/월

### 청구 이력 (실측)

| 날짜 | 유형 | 금액 |
|------|------|------|
| 2026-05-08 | 월별 청구서 (자동충전) | $11.00 |
| 2026-05-02 | 월별 청구서 (자동충전) | $11.02 |
| 2026-04-26 | 월별 청구서 (자동충전) | $11.04 |
| 2026-04-16 | 크레딧 부여 | $27.50 |
| 2026-03-24 | 크레딧 부여 | $27.50 |
| 2026-03-23 | 크레딧 부여 | $5.50 |

### 모델 3-tier

| 등급 | 모델 | 환경변수 | 용도 | 일 실행 |
|------|------|---------|------|--------|
| Light | claude-haiku-4-5 | CLAUDE_MODEL_LIGHT | 모니터링, 집계 | ~50회 |
| Heavy | claude-sonnet-4-6 | CLAUDE_MODEL_HEAVY | 콘텐츠 생성, 분석 | ~28회 |
| Strategic | claude-opus-4-7 | CLAUDE_MODEL_STRATEGIC | 주간 전략 | 월 2~3회 |

**크레딧 소진 시:** `400 "Your credit balance is too low"` → BotLog FAILED + Slack #긴급 → 콘텐츠 생성 전체 중단

---

## 2. Vercel Pro — 최적화 성과

| 기간 | 비용 | 비고 |
|------|------|------|
| 4월 (최적화 전) | ~$280 | Fluid Memory 과도 사용 |
| 5월 (최적화 후) | ~$22 | Base $20 + 사용 $1.92 |

**최적화 방법:** `vercel.json` ignoreCommand 설정 + Standard 머신

### 5월 청구 상세
- Pro Plan Base: $20.00
- Fluid Provisioned Memory: ~$1.90
- Edge/기타: ~$0.02

---

## 3. OpenAI — 실측 상세

- 4/1~5/11 누계 spend: **$2.13**
- 5월 spend: **$0.12** / $20 한도
- Chat/Responses: 971 requests, 1.21M 입력 토큰
- Images (DALL-E): **43장**

⚠️ `agents/cafe/image-generator.ts`: DALL-E 비활성화 완료  
⚠️ `agents/cmo/card-news/image-gen.ts`: **여전히 DALL-E 호출 중** (매일 15:00 KST 카드뉴스)

---

## 4. 무료 확인 완료 서비스

| 서비스 | 비용 | 확인 방법 |
|--------|------|----------|
| Supabase | $0 | Free Plan, 청구서 $0.00 직접 확인 |
| Upstash Redis | $0 | Free Tier 25K cmds/일, $0.00 확인 |
| Resend | $0 | Free 3K 이메일/월, $0/mo 확인 |
| Cloudflare R2 | $0 | 이미지/영상 저장, 무료 확인 |
| Slack | $0 | 무료 플랜 6채널 운영 |
| Perplexity | $0 | 미사용 확인 |
| ChatGPT Plus | $0 | 미구독 확인 |
| Google GA4 / Indexing | $0 | 무료 (Indexing 일 200회 한도) |
| Kakao OAuth | $0 | 무료 |

---

## 5. 비용 절감 포인트

### 즉시 가능

1. **Anthropic 자동충전 $15 → $50 상향**  
   현재 월 ~5회 충전. $50으로 올리면 한 번 충전으로 약 25일 사용.  
   비용 자체는 동일, 관리 부담 감소. console.anthropic.com → Billing → Auto-recharge

2. **DALL-E 카드뉴스 비활성화** (~$1.5/월 절감)  
   `agents/cmo/card-news/image-gen.ts`에서 DALL-E 호출 제거 또는 Unsplash 폴백 전환

### 중기 검토

3. **Gemini 구독 vs 실제 TTS 사용량 비교**  
   ₩11,000/월($8) 구독 중. TTS API 단가 $0.10/1M chars — 실사용량 확인 후 필요성 재검토

4. **단순 에이전트 Sonnet → Haiku 다운그레이드**  
   BotLog 분석으로 Haiku 전환 가능 태스크 식별 → ~$15/월 절감 가능

---

## 6. API 장애 영향도

| API | 영향 등급 | 즉각 증상 | 자동 복구 |
|-----|---------|----------|----------|
| Supabase DB | 🔴 치명 | 서비스 전면 마비 | ❌ |
| Anthropic Claude | 🔴 치명 | 콘텐츠 생성 중단 | ❌ 충전 필요 |
| Slack | 🟠 높음 | 모니터링 블라인드 | ❌ |
| Cloudflare R2 | 🟠 높음 | 신규 이미지 업로드 불가 | ❌ |
| SNS APIs | 🟠 높음 | 채널 침묵 | ❌ 재시도 없음 |
| Kakao OAuth | 🟡 중간 | 신규 로그인 불가 | ❌ |
| OpenAI DALL-E | 🟡 중간 | 카드뉴스 이미지 없음 | 수동 대응 |
| Upstash Redis | 🟡 중간 | Rate limit 우회 위험 | ⚠️ 부분 |
| Gemini TTS | 🟢 낮음 | 수동 프로세스라 즉각 영향 없음 | 수동 대응 |

---

## 7. 비상 정지 방법

```bash
# 1. 에이전트 전체 잠금
# DB automation_status = 'LOCKED' 설정 → Claude 비용 거의 0

# 2. 개별 workflow 비활성화
gh workflow disable agents-daily.yml
gh workflow disable agents-social.yml
gh workflow disable agents-cafe.yml
gh workflow disable agents-seed.yml

# 3. 상태 확인
gh workflow list
```

**LOCKED 시 유지:** cto:health-check / error-monitor / security-audit / qa-verify / cdo:anomaly-detector

---

## 8. 주간 확인 체크리스트

- [ ] Anthropic 크레딧 잔액 > $10 (console.anthropic.com/billing)
- [ ] Vercel 월누계 < $30 정상 / $50+ 이상 시 확인
- [ ] OpenAI 월누계 < $5 정상 (platform.openai.com/billing)
- [ ] Upstash Redis < 25K commands/일 (무료 한도)
- [ ] Instagram/Threads 토큰 만료 확인 (60일 주기)
- [ ] BotLog CAFE_CRAWLER 성공률 ≥ 80%
