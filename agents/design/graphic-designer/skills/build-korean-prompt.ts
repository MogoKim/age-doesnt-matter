/**
 * Skill: Build Korean Prompt
 * AI-티 없는 한국 40대 후반~50대 이미지 프롬프트 빌더
 *
 * 핵심 원칙:
 * - 나이 앵커링: "late 40s" — 실제 타겟은 50-60대지만 AI가 "50s" 해석 시
 *   주름 과장 → 할머니 느낌. "late 40s"로 지정해야 전도연·송윤아 같은
 *   자연스러운 50대 외모가 생성됨.
 * - 한국 배경 명시: 카페/거실/공원 모두 한국 특유 디테일 포함
 * - 연예인 레퍼런스: 전도연, 송윤아 (1973년생 52세) — AI 스타일 앵커
 * - 7계층 anti-AI 구조 유지
 *
 * // LOCAL ONLY — 이미지 생성 파이프라인 전용
 */

// ─── 한국 배경 스니펫 (장소별) ──────────────────────────────────────────────

export const KOREAN_BACKGROUNDS = {
  cafe: [
    'Korean cafe interior setting',
    'wooden tables, small succulent plants on windowsill, Korean-brand coffee cups',
    'warm-toned cafe interior, floor-to-ceiling windows overlooking a Korean residential street',
    'soft warm lighting typical of Korean specialty coffee shops',
  ].join(', '),

  living_room: [
    'Korean apartment living room',
    'clean minimal Korean furniture, ondol-style low seating or modern sofa',
    'plants on balcony visible through sliding glass door',
    'natural morning light from east-facing apartment windows',
    'Korean interior aesthetic — neutral tones, tidy space',
  ].join(', '),

  park: [
    'Korean neighborhood park',
    'concrete walking path with metal handrails, wooden benches',
    'ginkgo or cherry blossom trees along path',
    'Seoul residential apartment buildings softly visible in background haze',
    'spring or autumn afternoon light',
  ].join(', '),

  outdoor_cafe: [
    'outdoor terrace of a Korean cafe',
    'Mapo or Yeonnam district street aesthetic',
    'low wooden tables, cushioned chairs, potted plants',
    'Korean storefront signage blur-visible in background',
    'warm golden afternoon sun',
  ].join(', '),

  home_kitchen: [
    'Korean apartment kitchen',
    'tiled backsplash, Korean kitchen appliances, small potted herb on counter',
    'warm natural light from kitchen window',
    'clean and lived-in feel, not staged',
  ].join(', '),

  library_cultural_center: [
    'Korean community cultural center or local library',
    'rows of Korean books, reading tables with warm lamp light',
    'quiet daytime atmosphere, other patrons blur-visible in background',
  ].join(', '),
} as const

export type KoreanBackground = keyof typeof KOREAN_BACKGROUNDS

// ─── 여성 단독 프롬프트 ────────────────────────────────────────────────────

/**
 * 한국 50대 여성 사실적 이미지 프롬프트 생성
 *
 * 나이 앵커: "late 40s" — AI가 50대를 과장하지 않도록.
 * 실제 타겟은 50-60대지만, 전도연·송윤아(52세)처럼 보이는 자연스러운
 * 외모가 목표이므로 "late 40s" 지정이 올바른 전략.
 *
 * @param scene - 장면 묘사 (영어). 예: "woman sitting at a Korean cafe, holding coffee"
 * @param message - 광고 메시지 (선택). 감정 무드 컨텍스트로 포함
 * @param brandAccent - 브랜드 컬러 힌트 (기본: 코랄 #FF6F61)
 */
export function buildKoreanWomanPrompt(
  scene: string,
  message?: string,
  brandAccent?: string
): string {
  const layers = [
    // 1. 피사체 — 나이 앵커 + 국적 + 연예인 레퍼런스
    scene,
    'Korean woman who appears to be in her late 40s, naturally aged',
    'similar natural look to Korean actress Jeon Do-yeon or Song Yoon-ah',
    'natural Korean facial features, natural East Asian skin tone',
    'no heavy makeup, minimal natural makeup at most',

    // 2. 의상 — 한국 일상 스타일 (너무 트렌디 X, 너무 올드 X)
    'wearing relaxed Korean casual fashion — linen blouse or knit cardigan or comfortable daily wear',
    'NOT hospital gown NOT overly formal attire NOT outdated fashion NOT idol-style trendy',

    // 3. 캔디드/자연스러운 순간 (연출 느낌 배제)
    'candid unposed moment, authentic expression, natural body language',
    'caught in a genuine laugh or quiet thoughtful moment, NOT posing for camera',

    // 4. 카메라 장비 — 사진작가처럼
    'shot on Canon EOS R5, 85mm f/1.4 portrait lens',
    'f/2.0 aperture, shallow depth of field, soft bokeh of Korean background',

    // 5. 조명 — 자연광 기반
    'soft natural window light from Korean apartment or cafe, gentle warm afternoon sun',
    'subsurface scattering skin effect, no harsh shadows, no studio lighting',

    // 6. 피부 — anti-AI 핵심 레이어
    'natural skin texture with visible pores, subtle crow\'s feet around eyes, gentle smile lines',
    'NOT plastic skin NOT airbrushed NOT waxy NOT perfectly smooth',
    'fine natural wrinkles around eyes and mouth that suggest warmth and life experience, NOT heavy aging',
    'real skin imperfections that show character, no retouching',

    // 7. 사진 품질 — 필름 느낌
    'film grain, Kodak Portra 400 color tones, lifestyle editorial photography',
    'documentary candid style, NOT AI art NOT CGI NOT studio backdrop NOT stock photo look',

    // 8. 브랜드 컬러 포인트
    brandAccent ?? 'subtle warm coral #FF6F61 accent visible in scarf, cup, clothing detail, or background element',

    // 9. 메시지 감정 컨텍스트
    ...(message ? [`emotional mood of the scene matches: "${message}"`] : []),
  ]

  return layers.join(', ')
}

// ─── 복수 여성 그룹 프롬프트 ──────────────────────────────────────────────

/**
 * 복수 인물 장면용 (RELATION 욕망 — 친구 둘이 함께)
 */
export function buildKoreanWomenGroupPrompt(
  scene: string,
  message?: string,
  brandAccent?: string
): string {
  const layers = [
    // 1. 피사체 — 복수 인물
    scene,
    'two Korean women who appear to be in their late 40s to early 50s',
    'similar natural look to Korean actresses like Jeon Do-yeon, Song Yoon-ah, or Lee Mi-yeon',
    'natural Korean facial features, natural East Asian skin tones',
    'no heavy makeup, natural everyday appearance',

    // 2. 의상
    'wearing relaxed Korean casual fashion — comfortable knit tops, linen blouses, everyday Korean style',
    'NOT matching outfits NOT overly formal NOT hospital gowns',

    // 3. 캔디드 그룹 순간
    'candid unposed group moment, authentic shared expressions',
    'genuine connection visible — looking at each other, sharing a laugh, or leaning in to talk',
    'NOT posed group photo NOT looking at camera NOT stiff',

    // 4. 카메라
    'shot on Canon EOS R5, 35mm f/2 lens for environmental context',
    'f/2.5 aperture, Korean setting visible in background bokeh',

    // 5. 조명
    'soft natural ambient light, warm indoor Korean cafe or outdoor park setting',
    'no harsh flash, no studio lighting',

    // 6. 피부
    'natural skin textures on both women, visible laugh lines, gentle smile lines',
    'NOT plastic skin NOT airbrushed, real natural imperfections',
    'fine wrinkles that suggest warmth and shared history',

    // 7. 품질
    'film grain, Kodak Portra 400 color tones',
    'lifestyle documentary photography, NOT AI art NOT CGI NOT stock photo',

    // 8. 브랜드 컬러
    brandAccent ?? 'subtle warm coral #FF6F61 accent in clothing, cups, or setting',

    // 9. 메시지
    ...(message ? [`scene emotional tone matches: "${message}"`] : []),
  ]

  return layers.join(', ')
}

// ─── 남성 프롬프트 (타겟 20-30%) ──────────────────────────────────────────

/**
 * 한국 50대 남성 사실적 이미지 프롬프트
 * 레퍼런스: 차인표 (1968년생, 57세) — 자연스러운 중년 남성미
 */
export function buildKoreanManPrompt(
  scene: string,
  message?: string,
  brandAccent?: string
): string {
  const layers = [
    // 1. 피사체
    scene,
    'Korean man who appears to be in his late 40s to early 50s, naturally aged',
    'similar natural look to Korean actor Cha In-pyo — distinguished, warm, naturally weathered face',
    'natural Korean facial features, natural East Asian skin tone',
    'light stubble or clean-shaven, natural salt-and-pepper hair acceptable',

    // 2. 의상
    'wearing relaxed Korean casual fashion — casual button-down shirt, light jacket, or comfortable sweater',
    'NOT hospital gown NOT suit NOT outdated fashion',

    // 3. 캔디드
    'candid unposed moment, authentic expression, natural relaxed body language',
    'caught in a thoughtful moment or gentle smile, NOT posing NOT stiff',

    // 4. 카메라
    'shot on Canon EOS R5, 85mm f/1.4 portrait lens',
    'f/2.0 aperture, soft bokeh of Korean background',

    // 5. 조명
    'soft natural window light, warm afternoon Korean cafe or park setting',
    'no harsh shadows, no studio lighting',

    // 6. 피부
    'natural skin texture, subtle laugh lines around eyes, gentle forehead lines',
    'NOT plastic skin NOT airbrushed, real natural aging that shows character',
    'distinguished naturally aged Korean man, NOT too young NOT elderly',

    // 7. 품질
    'film grain, Kodak Portra 400 color tones, lifestyle editorial photography',
    'documentary candid style, NOT AI art NOT CGI NOT studio backdrop',

    // 8. 브랜드 컬러
    brandAccent ?? 'subtle warm coral #FF6F61 accent in setting or clothing detail',

    // 9. 메시지
    ...(message ? [`emotional mood: "${message}"`] : []),
  ]

  return layers.join(', ')
}

// ─── 욕망 코드별 배경색 + 장면 매핑 ────────────────────────────────────────

export type DesireCode = 'RELATION' | 'RETIRE' | 'MONEY' | 'HEALTH'

export const DESIRE_VISUAL_MAP: Record<DesireCode, {
  bgColor: string
  bgDescription: string
  recommendedBackground: KoreanBackground
  sceneKeywords: string[]
}> = {
  RELATION: {
    bgColor: '#FF6F61',
    bgDescription: '코랄 — 따뜻함, 소속감, "나만 그런 게 아니었어"',
    recommendedBackground: 'cafe',
    sceneKeywords: ['sharing coffee', 'laughing together', 'looking at phone together', 'warm conversation'],
  },
  RETIRE: {
    bgColor: '#E8F5F0',
    bgDescription: '민트/세이지 — 청량함, 새출발, 자기효능감',
    recommendedBackground: 'library_cultural_center',
    sceneKeywords: ['writing in notebook', 'focused on laptop', 'reading thoughtfully', 'walking purposefully'],
  },
  MONEY: {
    bgColor: '#FFF9F0',
    bgDescription: '크림 — 안정감, 신뢰, 차분',
    recommendedBackground: 'living_room',
    sceneKeywords: ['reviewing documents', 'checking phone calmly', 'relaxed in bright indoor space'],
  },
  HEALTH: {
    bgColor: '#F0F8F0',
    bgDescription: '라이트 그린 — 활력, 자연, 안심',
    recommendedBackground: 'park',
    sceneKeywords: ['walking in park', 'gentle stretching', 'enjoying fresh air', 'relaxed outdoor moment'],
  },
}

/**
 * 욕망 코드 기반 완성 프롬프트 생성 (배경 자동 포함)
 */
export function buildDesirePrompt(
  desireCode: DesireCode,
  customScene?: string,
  message?: string,
  gender: 'woman' | 'man' | 'group' = 'woman'
): string {
  const visual = DESIRE_VISUAL_MAP[desireCode]
  const bg = KOREAN_BACKGROUNDS[visual.recommendedBackground]
  const defaultScene = `${visual.sceneKeywords[0]}, ${bg}`
  const scene = customScene ?? defaultScene

  if (gender === 'group') return buildKoreanWomenGroupPrompt(scene, message, `${visual.bgColor} color accent`)
  if (gender === 'man') return buildKoreanManPrompt(scene, message, `${visual.bgColor} color accent`)
  return buildKoreanWomanPrompt(scene, message, `${visual.bgColor} color accent`)
}
