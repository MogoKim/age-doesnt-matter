/**
 * Skill: Build Korean Woman Prompt
 * AI-티 없는 한국 50대 여성 이미지 프롬프트 빌더
 *
 * 조사 기반 7계층 구조:
 * 1. 피사체 (나이/국적 명확 지정)
 * 2. 캔디드/자연스러운 순간
 * 3. 카메라 장비 (사진작가처럼 생각)
 * 4. 조명 (자연광 기반)
 * 5. 피부 (anti-AI 핵심)
 * 6. 사진 품질 (필름 느낌)
 * 7. 브랜드 컬러 포인트
 *
 * // LOCAL ONLY — 이미지 생성 파이프라인 전용
 */

/**
 * 한국 50대 여성 사실적 이미지 프롬프트 생성
 *
 * @param scene - 장면 묘사 (영어). 예: "two Korean women at a cozy cafe, laughing"
 * @param message - 광고 메시지 텍스트 (선택). 프롬프트에 컨텍스트로 포함
 * @param brandAccent - 브랜드 컬러 힌트 (기본: 코랄 #FF6F61)
 */
export function buildKoreanWomanPrompt(
  scene: string,
  message?: string,
  brandAccent?: string
): string {
  const layers = [
    // 1. 피사체 — 나이/국적 명확히 지정
    scene,
    'Korean woman in her early-to-mid 50s',
    'natural Korean facial features, natural East Asian skin tone',

    // 2. 캔디드/자연스러운 순간 (연출 느낌 배제)
    'candid unposed moment, authentic expression, natural body language',
    'caught in a genuine laugh or thoughtful moment',

    // 3. 카메라 장비 — 사진작가처럼 생각하기
    'shot on Canon EOS R5, 85mm f/1.4 portrait lens',
    'f/2.8 aperture, shallow depth of field, subtle bokeh background',

    // 4. 조명 — 자연광 기반
    'soft natural window light, gentle golden hour warmth',
    'subsurface scattering skin effect',

    // 5. 피부 — 가장 중요한 anti-AI 요소
    'natural skin texture with visible pores, subtle smile lines, laugh lines',
    'NOT plastic skin NOT airbrushed NOT waxy NOT too smooth',
    'fine natural imperfections, no retouching',

    // 6. 사진 품질 — 필름 느낌
    'film grain, slight natural noise, Kodak Portra 400 color tones',
    'lifestyle editorial photography, documentary style',
    'NOT AI art NOT CGI NOT studio backdrop',

    // 7. 브랜드 컬러 포인트
    brandAccent ?? 'warm coral accent #FF6F61 visible in clothing, scarf, or background detail',

    // 8. 광고 메시지 컨텍스트 (있을 경우)
    ...(message ? [`mood matching the message: "${message}"`] : []),
  ]

  return layers.join(', ')
}

/**
 * 복수 인물 장면용 변형 (친구 둘 등)
 */
export function buildKoreanWomenGroupPrompt(
  scene: string,
  message?: string,
  brandAccent?: string
): string {
  const layers = [
    scene,
    'Korean women in their early-to-mid 50s',
    'natural Korean facial features, natural East Asian skin tones',
    'candid unposed group moment, authentic shared expressions',
    'genuine connection visible between people',
    'shot on Canon EOS R5, 35mm f/2 lens',
    'f/2.8 aperture, environmental context visible',
    'soft natural ambient light, warm indoor or outdoor setting',
    'natural skin textures, visible laugh lines, smile lines',
    'NOT plastic skin NOT airbrushed NOT posed group photo',
    'fine natural imperfections, no retouching',
    'film grain, Kodak Portra 400 color tones',
    'lifestyle documentary photography style',
    'NOT AI art NOT CGI NOT studio backdrop',
    brandAccent ?? 'warm coral accent #FF6F61 in clothing or setting',
    ...(message ? [`mood matching: "${message}"`] : []),
  ]

  return layers.join(', ')
}
