/**
 * 우나어 — 구글 애즈 인플랫폼 자동화 스크립트
 *
 * ══════════════════════════════════════════════════════════════
 * 설치 방법:
 *   구글 애즈 → 도구 및 설정 → 스크립트 → + 버튼 → 이 코드 전체 붙여넣기
 *   실행 주기: 매일 (Daily) 설정
 *   승인: Google Ads 계정 접근 권한 승인
 * ══════════════════════════════════════════════════════════════
 *
 * 기능:
 *   1. 예산 소진 경보 — 70% 이상 소진 시 로그 기록
 *   2. 성과 낮은 키워드 감지 — CTR 0.5% 미만 + 100회 이상 노출 시 경고
 *   3. 품질 점수 모니터링 — 품질점수 5점 이하 키워드 감지
 *   4. 일일 요약 로그 — Logger로 실행 결과 기록
 *
 * 참고: 구글 애즈 Scripts는 JavaScript만 지원 (TypeScript 불가)
 */

// ── 설정값 ──
var CONFIG = {
  CAMPAIGN_LABEL: '우나어',       // 관리할 캠페인 필터 (이름에 포함된 문자열)
  BUDGET_ALERT_PCT: 70,           // 예산 소진 경보 임계값 (%)
  LOW_CTR_THRESHOLD: 0.005,       // 저성과 CTR 기준 (0.5%)
  MIN_IMPRESSIONS_FOR_CTR: 100,   // CTR 판단 최소 노출수
  LOW_QUALITY_SCORE: 5,           // 품질점수 경보 임계값
};

// ── 메인 함수 (구글 애즈 스크립트 진입점) ──
function main() {
  Logger.log('=== 우나어 구글 애즈 일일 점검 시작 ===');
  Logger.log('실행 시각: ' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));

  checkBudgetUsage();
  checkLowCtrKeywords();
  checkQualityScores();

  Logger.log('=== 점검 완료 ===');
}

// ──────────────────────────────────────────────────────────────
// 1. 예산 소진율 점검
// ──────────────────────────────────────────────────────────────

function checkBudgetUsage() {
  Logger.log('\n[1] 예산 소진율 점검');

  var campaignIterator = AdsApp.campaigns()
    .withCondition("Name CONTAINS '" + CONFIG.CAMPAIGN_LABEL + "'")
    .withCondition("Status = ENABLED")
    .get();

  while (campaignIterator.hasNext()) {
    var campaign = campaignIterator.next();
    var budget = campaign.getBudget();
    var stats = campaign.getStatsFor('TODAY');

    var dailyBudgetKrw = budget.getAmount();
    var spentKrw = stats.getCost();
    var usedPct = dailyBudgetKrw > 0 ? Math.round((spentKrw / dailyBudgetKrw) * 100) : 0;

    var status = usedPct >= CONFIG.BUDGET_ALERT_PCT ? '⚠️ 경보' : '✅ 정상';
    Logger.log(
      campaign.getName() + ' | ' +
      '소진 ' + usedPct + '% | ' +
      '₩' + Math.round(spentKrw).toLocaleString() + ' / ₩' + Math.round(dailyBudgetKrw).toLocaleString() +
      ' ' + status
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 2. 저성과 키워드 감지
// ──────────────────────────────────────────────────────────────

function checkLowCtrKeywords() {
  Logger.log('\n[2] 저성과 키워드 점검 (CTR < ' + (CONFIG.LOW_CTR_THRESHOLD * 100) + '%, 노출 ' + CONFIG.MIN_IMPRESSIONS_FOR_CTR + '회+)');

  var keywordIterator = AdsApp.keywords()
    .withCondition("CampaignName CONTAINS '" + CONFIG.CAMPAIGN_LABEL + "'")
    .withCondition("Impressions >= " + CONFIG.MIN_IMPRESSIONS_FOR_CTR)
    .withCondition("Ctr < " + CONFIG.LOW_CTR_THRESHOLD)
    .withCondition("Status = ENABLED")
    .forDateRange('LAST_7_DAYS')
    .orderBy('Impressions DESC')
    .withLimit(20)
    .get();

  var count = 0;
  while (keywordIterator.hasNext()) {
    var keyword = keywordIterator.next();
    var stats = keyword.getStatsFor('LAST_7_DAYS');
    var ctrPct = Math.round(stats.getCtr() * 1000) / 10;

    Logger.log(
      '⚠️ [저CTR] "' + keyword.getText() + '" (' + keyword.getMatchType() + ')' +
      ' | CTR ' + ctrPct + '%' +
      ' | 노출 ' + stats.getImpressions() +
      ' | 클릭 ' + stats.getClicks() +
      ' | 캠페인: ' + keyword.getCampaign().getName()
    );
    count++;
  }

  if (count === 0) {
    Logger.log('✅ 저성과 키워드 없음');
  } else {
    Logger.log('→ 위 키워드 검토 후 일시중지 또는 제외 키워드 추가 권장');
  }
}

// ──────────────────────────────────────────────────────────────
// 3. 품질 점수 모니터링
// ──────────────────────────────────────────────────────────────

function checkQualityScores() {
  Logger.log('\n[3] 품질 점수 점검 (≤ ' + CONFIG.LOW_QUALITY_SCORE + '점 경보)');

  var keywordIterator = AdsApp.keywords()
    .withCondition("CampaignName CONTAINS '" + CONFIG.CAMPAIGN_LABEL + "'")
    .withCondition("QualityScore <= " + CONFIG.LOW_QUALITY_SCORE)
    .withCondition("Status = ENABLED")
    .orderBy('QualityScore ASC')
    .withLimit(10)
    .get();

  var count = 0;
  while (keywordIterator.hasNext()) {
    var keyword = keywordIterator.next();
    var qs = keyword.getQualityScore();

    Logger.log(
      '⚠️ [저품질] "' + keyword.getText() + '"' +
      ' | 품질점수 ' + qs + '/10' +
      ' | 광고그룹: ' + keyword.getAdGroup().getName()
    );
    count++;
  }

  if (count === 0) {
    Logger.log('✅ 품질점수 정상 (모든 키워드 ' + (CONFIG.LOW_QUALITY_SCORE + 1) + '점 이상)');
  } else {
    Logger.log('→ 광고 관련성·랜딩페이지 일치도·예상 CTR 개선 권장');
  }
}
