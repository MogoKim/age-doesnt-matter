/**
 * Google Ads 캠페인 생성 로직
 *
 * 생성 순서:
 *   1. 예산(CampaignBudget) 생성
 *   2. 캠페인(Campaign) 생성 — 검색 캠페인, 수동 CPC
 *   3. 광고 그룹(AdGroup) 생성
 *   4. 키워드(AdGroupCriterion) 생성
 *   5. RSA 광고(AdGroupAd) 생성
 */

import { createGoogleAdsClient, krwToMicros } from './google-ads-client.js'
import type { CampaignConfig, AdGroupConfig } from '../campaigns/relation-campaign.js'

// ──────────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────────

export interface CreatedCampaign {
  desireCode: string
  campaignName: string
  campaignResourceName: string
  adGroupResourceName: string
  keywordCount: number
  adResourceName: string
}

// ──────────────────────────────────────────────────────────────
// 매칭 타입 → 구글 애즈 열거형 매핑
// ──────────────────────────────────────────────────────────────

const KEYWORD_MATCH_TYPE: Record<string, number> = {
  EXACT: 2,
  PHRASE: 3,
  BROAD: 4,
}

// ──────────────────────────────────────────────────────────────
// 메인: 단일 캠페인 생성
// ──────────────────────────────────────────────────────────────

export async function createCampaign(
  config: CampaignConfig,
  dryRun = false,
): Promise<CreatedCampaign> {
  console.log(`\n[CampaignCreator] ${config.name} 생성 시작`)

  // 복수 광고그룹 모드 여부
  const isMultiAdGroup = Array.isArray(config.adGroups) && config.adGroups.length > 0

  if (dryRun) {
    console.log('  [DRY RUN] 실제 API 호출 없이 설정 검증만 수행')
    if (isMultiAdGroup) {
      for (const ag of config.adGroups!) {
        validateAdGroupConfig(ag)
        console.log(`  ✅ [${ag.adGroupName}] 키워드 ${ag.keywords.length}개, 헤드라인 ${ag.headlines.length}개`)
      }
    } else {
      validateConfig(config)
      console.log(`  ✅ 키워드 ${config.keywords.length}개, 헤드라인 ${config.headlines.length}개, 설명문 ${config.descriptions.length}개`)
    }
    return {
      desireCode: config.desireCode,
      campaignName: config.name,
      campaignResourceName: 'dry-run/campaigns/0',
      adGroupResourceName: 'dry-run/adGroups/0',
      keywordCount: isMultiAdGroup
        ? config.adGroups!.reduce((sum, ag) => sum + ag.keywords.length, 0)
        : config.keywords.length,
      adResourceName: 'dry-run/adGroupAds/0',
    }
  }

  const customer = await createGoogleAdsClient()

  // ── Step 1: 예산 생성 ──
  console.log(`  [1/3] 예산 생성 (${config.dailyBudgetKrw.toLocaleString()}원/일)`)
  const budgetResult = await customer.campaignBudgets.create([{
    name: `${config.name}_예산`,
    amount_micros: krwToMicros(config.dailyBudgetKrw),
    delivery_method: 2, // STANDARD
  }])
  const budgetResourceName = budgetResult.results[0].resource_name
  console.log(`  ✅ 예산: ${budgetResourceName}`)

  // ── Step 2: 캠페인 생성 ──
  console.log(`  [2/3] 캠페인 생성`)
  const campaignResult = await customer.campaigns.create([{
    name: config.name,
    status: 2,           // PAUSED — 수동 활성화 필요
    advertising_channel_type: 2,  // SEARCH
    campaign_budget: budgetResourceName,
    manual_cpc: { enhanced_cpc_enabled: false },
    ad_schedule_targets: buildAdSchedule(config.adSchedule.startHour, config.adSchedule.endHour),
    target_google_search: { target_google_search: true },
    target_search_network: { target_search_network: false },
    target_content_network: { target_content_network: false },
  }])
  const campaignResourceName = campaignResult.results[0].resource_name
  console.log(`  ✅ 캠페인: ${campaignResourceName}`)

  // ── Step 3: 광고그룹(들) 생성 ──
  let firstAdGroupResourceName = ''
  let firstAdResourceName = ''
  let totalKeywordCount = 0

  const adGroupConfigs: AdGroupConfig[] = isMultiAdGroup
    ? config.adGroups!
    : [{
        adGroupName: config.adGroupName,
        maxCpcKrw: config.maxCpcKrw,
        keywords: config.keywords,
        headlines: config.headlines,
        descriptions: config.descriptions,
        finalUrl: config.finalUrl,
        displayPath: config.displayPath,
      }]

  console.log(`  [3/3] 광고그룹 ${adGroupConfigs.length}개 생성`)

  for (const ag of adGroupConfigs) {
    console.log(`\n    ── 광고그룹: ${ag.adGroupName}`)

    // 광고그룹 생성
    const adGroupResult = await customer.adGroups.create([{
      name: ag.adGroupName,
      campaign: campaignResourceName,
      status: 2,  // ENABLED
      cpc_bid_micros: krwToMicros(ag.maxCpcKrw ?? config.maxCpcKrw),
      type: 2,    // SEARCH_STANDARD
    }])
    const adGroupResourceName = adGroupResult.results[0].resource_name
    if (!firstAdGroupResourceName) firstAdGroupResourceName = adGroupResourceName
    console.log(`    ✅ 광고그룹: ${adGroupResourceName}`)

    // 키워드 + 캠페인 레벨 제외 키워드
    const positiveCriteria = ag.keywords.map(kw => ({
      ad_group: adGroupResourceName,
      status: 2,
      keyword: { text: kw.text, match_type: KEYWORD_MATCH_TYPE[kw.matchType] },
    }))
    const negativeCriteria = config.negativeKeywords.map(kw => ({
      ad_group: adGroupResourceName,
      status: 2,
      negative: true,
      keyword: { text: kw, match_type: KEYWORD_MATCH_TYPE['BROAD'] },
    }))
    await customer.adGroupCriteria.create([...positiveCriteria, ...negativeCriteria])
    totalKeywordCount += ag.keywords.length
    console.log(`    ✅ 키워드 ${ag.keywords.length}개 등록`)

    // RSA 광고 생성
    const adResult = await customer.adGroupAds.create([{
      ad_group: adGroupResourceName,
      status: 2,
      ad: {
        type: 15,  // RESPONSIVE_SEARCH_AD
        final_urls: [ag.finalUrl],
        responsive_search_ad: {
          headlines: ag.headlines.map(h => ({
            text: h.text,
            ...(h.pinPosition ? { pinned_field: h.pinPosition } : {}),
          })),
          descriptions: ag.descriptions.map(d => ({
            text: d.text,
            ...(d.pinPosition ? { pinned_field: d.pinPosition } : {}),
          })),
          path1: ag.displayPath[0],
          path2: ag.displayPath[1],
        },
      },
    }])
    const adResourceName = adResult.results[0].resource_name
    if (!firstAdResourceName) firstAdResourceName = adResourceName
    console.log(`    ✅ RSA 광고: ${adResourceName}`)

    // API 레이트 리밋 방지
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n[CampaignCreator] ${config.name} 생성 완료 ✅`)
  console.log(`  ⚠️  캠페인 상태: PAUSED — 구글 애즈 대시보드에서 직접 활성화하세요`)

  return {
    desireCode: config.desireCode,
    campaignName: config.name,
    campaignResourceName,
    adGroupResourceName: firstAdGroupResourceName,
    keywordCount: totalKeywordCount,
    adResourceName: firstAdResourceName,
  }
}

// ──────────────────────────────────────────────────────────────
// 설정 유효성 검증
// ──────────────────────────────────────────────────────────────

function validateAdGroupConfig(ag: AdGroupConfig): void {
  if (ag.headlines.length < 3 || ag.headlines.length > 15) {
    throw new Error(`[${ag.adGroupName}] 헤드라인은 3~15개 필요 (현재: ${ag.headlines.length})`)
  }
  if (ag.descriptions.length < 2 || ag.descriptions.length > 4) {
    throw new Error(`[${ag.adGroupName}] 설명문은 2~4개 필요 (현재: ${ag.descriptions.length})`)
  }
  for (const h of ag.headlines) {
    if (h.text.length > 30) {
      throw new Error(`[${ag.adGroupName}] 헤드라인 30자 초과: "${h.text}" (${h.text.length}자)`)
    }
  }
  for (const d of ag.descriptions) {
    if (d.text.length > 90) {
      throw new Error(`[${ag.adGroupName}] 설명문 90자 초과: "${d.text}" (${d.text.length}자)`)
    }
  }
  if (ag.displayPath[0].length > 15 || ag.displayPath[1].length > 15) {
    throw new Error(`[${ag.adGroupName}] 표시 경로 15자 초과: ${ag.displayPath}`)
  }
}

function validateConfig(config: CampaignConfig): void {
  if (config.headlines.length < 3 || config.headlines.length > 15) {
    throw new Error(`헤드라인은 3~15개 필요 (현재: ${config.headlines.length})`)
  }
  if (config.descriptions.length < 2 || config.descriptions.length > 4) {
    throw new Error(`설명문은 2~4개 필요 (현재: ${config.descriptions.length})`)
  }
  for (const h of config.headlines) {
    if (h.text.length > 30) {
      throw new Error(`헤드라인 30자 초과: "${h.text}" (${h.text.length}자)`)
    }
  }
  for (const d of config.descriptions) {
    if (d.text.length > 90) {
      throw new Error(`설명문 90자 초과: "${d.text}" (${d.text.length}자)`)
    }
  }
  if (config.displayPath[0].length > 15 || config.displayPath[1].length > 15) {
    throw new Error(`표시 경로 15자 초과: ${config.displayPath}`)
  }
}

// ──────────────────────────────────────────────────────────────
// 광고 일정 빌더 (KST → 구글 애즈 형식)
// ──────────────────────────────────────────────────────────────

function buildAdSchedule(startKst: number, endKst: number) {
  // 구글 애즈는 계정 타임존 기준 → 계정을 KST(Asia/Seoul)로 설정했다면 그대로 사용
  const DAYS = [2, 3, 4, 5, 6, 7, 8] // MONDAY~SUNDAY
  return DAYS.map(day => ({
    day_of_week: day,
    start_hour: startKst,
    start_minute: 0,
    end_hour: endKst,
    end_minute: 0,
  }))
}
