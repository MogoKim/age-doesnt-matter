/**
 * 우나어 HEALTH SA 캠페인 생성 스크립트
 * v2 — 욕망 재정의 반영 (2026-04-15)
 *
 * 원칙: 불안 자극 금지 / "나만 이런 거 아니야" + "괜찮다고 해줬으면" 중심
 *
 * 실행 방법:
 *   구글 애즈 콘솔 → 도구 및 설정 → 일괄 작업 → 스크립트
 *   → + 새 스크립트 → 코드 전체 붙여넣기 → 미리보기 → 실행
 *
 * 결과: 캠페인이 PAUSED 상태로 생성됨
 *       콘솔에서 내용 확인 후 수동으로 ENABLED 전환
 */

function main() {

  var CAMPAIGN_NAME  = '우나어_HEALTH_건강갱년기';
  var DAILY_BUDGET   = 10000;  // 원
  var MAX_CPC        = 800;    // 원
  var FINAL_URL      = 'https://age-doesnt-matter.com/magazine';
  var PATH1          = '갱년기공감';
  var PATH2          = '50대여성';
  var AD_GROUP_NAME  = '갱년기_건강_커뮤니티';

  // ── 중복 방지 ──
  var existing = AdsApp.campaigns()
    .withCondition("Name = '" + CAMPAIGN_NAME + "'")
    .get();
  if (existing.hasNext()) {
    Logger.log('[SKIP] 이미 존재하는 캠페인: ' + CAMPAIGN_NAME);
    return;
  }

  // ── 1. 캠페인 생성 ──
  var campaignOp = AdsApp.newCampaignBuilder()
    .withName(CAMPAIGN_NAME)
    .withStatus('PAUSED')
    .withBiddingStrategy('MANUAL_CPC')
    .withDailyBudget(DAILY_BUDGET)
    .build();

  if (!campaignOp.isSuccessful()) {
    Logger.log('[ERROR] 캠페인 생성 실패: ' + campaignOp.getErrors());
    return;
  }
  var campaign = campaignOp.getResult();
  Logger.log('[OK] 캠페인 생성: ' + CAMPAIGN_NAME);

  // ── 2. 광고그룹 생성 ──
  var adGroupOp = campaign.newAdGroupBuilder()
    .withName(AD_GROUP_NAME)
    .withStatus('ENABLED')
    .withCpc(MAX_CPC)
    .build();

  if (!adGroupOp.isSuccessful()) {
    Logger.log('[ERROR] 광고그룹 생성 실패: ' + adGroupOp.getErrors());
    return;
  }
  var adGroup = adGroupOp.getResult();
  Logger.log('[OK] 광고그룹 생성: ' + AD_GROUP_NAME);

  // ── 3. 키워드 등록 ──
  // 구문일치: "텍스트" / 확장확인일치: 텍스트
  var keywords = [
    '"갱년기 증상"',
    '"갱년기 커뮤니티"',
    '"50대 건강 정보"',
    '"갱년기 경험"',
    '"중년 건강 고민"',
    '"갱년기 위로"',       // 변경: 극복 → 위로
    '"갱년기 공감"',       // 신규
    '"50대 건강 커뮤니티"',
    '중년 여성 건강',
    '갱년기 이야기',
  ];

  for (var i = 0; i < keywords.length; i++) {
    var kwOp = adGroup.newKeywordBuilder()
      .withText(keywords[i])
      .withCpc(MAX_CPC)
      .build();
    if (kwOp.isSuccessful()) {
      Logger.log('[OK] 키워드: ' + keywords[i]);
    } else {
      Logger.log('[ERROR] 키워드: ' + keywords[i] + ' → ' + kwOp.getErrors());
    }
  }

  // ── 4. 제외 키워드 등록 ──
  var negatives = [
    '병원 예약', '의사 상담', '약 처방', '치료', '클리닉',
    '한의원 예약', '내과', '산부인과', '시술', '보험',
  ];
  for (var j = 0; j < negatives.length; j++) {
    campaign.createNegativeKeyword(negatives[j]);
  }
  Logger.log('[OK] 제외 키워드 ' + negatives.length + '개 등록');

  // ── 5. RSA 생성 ──
  var headlines = [
    '나만 이런 줄 알았어요',         // 핵심 — 고정 1번 권장
    '다들 비슷하대요',
    '갱년기 5060 여성 공감 커뮤니티',
    '50대 건강 고민 여기서 해요',
    '또래 경험담이 제일 위로돼요',
    '괜찮아요 우리 다 이래요',
    '같은 증상 먼저 겪은 50대',
    '우리 나이가 어때서',
    '무료로 가입하기',
    '지금 확인하기',
    '내 증상 나만 아닌 거였어요',
    '50대 여성 건강 공감 공간',
    '병원 가기 전에 여기 먼저',
    '함께라 훨씬 나아요',
    '50·60대 건강 이야기 커뮤니티',
  ];

  var descriptions = [
    '이 증상, 나만 그런 게 아니에요. 50대 여성들 다 비슷하대요. 같이 얘기해볼까요.',
    '갱년기부터 체력 저하까지, "괜찮아요 우리 다 이래요" — 또래 경험담이 제일 위로됩니다.',
    '나만 이런 줄 알았는데 여기 다 있었어요. 50·60대 여성만의 건강 공감 커뮤니티.',
    '병원 가기 전에 먼저 또래 경험 들어보세요. 정보보다 위로가 먼저인 곳, 우나어.',
  ];

  var adOp = adGroup.newAd().responsiveSearchAdBuilder()
    .withHeadlines(headlines)
    .withDescriptions(descriptions)
    .withFinalUrl(FINAL_URL)
    .withPath1(PATH1)
    .withPath2(PATH2)
    .build();

  if (adOp.isSuccessful()) {
    Logger.log('[OK] RSA 광고 생성 완료');
  } else {
    Logger.log('[ERROR] RSA 광고 실패: ' + adOp.getErrors());
  }

  // ── 완료 보고 ──
  Logger.log('');
  Logger.log('====================================');
  Logger.log('생성 완료: ' + CAMPAIGN_NAME);
  Logger.log('상태: PAUSED (수동으로 ENABLED 전환 필요)');
  Logger.log('예산: ' + DAILY_BUDGET + '원/일 | 최대CPC: ' + MAX_CPC + '원');
  Logger.log('키워드: ' + keywords.length + '개 | 제외: ' + negatives.length + '개');
  Logger.log('랜딩: ' + FINAL_URL);
  Logger.log('====================================');
}
