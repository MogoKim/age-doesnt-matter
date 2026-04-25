/**
 * 전사적 이미지 프롬프트 빌더 — 공유 유틸리티
 * 규칙 문서: agents/core/image-generation-rules.md
 *
 * v1: ImageStyle — 카드뉴스용 (하위 호환 유지)
 * v2: ImageType  — 매거진용 (5종 분류, Unsplash 지원)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** v2: 매거진 이미지 타입 5종 */
export type ImageType =
  | 'PERSON_REAL'   // 한국인 인물 실사 → DALL-E 전용
  | 'FOOD_PHOTO'    // 음식·식재료 → Unsplash 우선, DALL-E 폴백
  | 'SCENE_PHOTO'   // 장소·공간·환경 → Unsplash 우선, DALL-E 폴백
  | 'OBJECT_PHOTO'  // 제품·도구·의료기기 → Unsplash 우선, DALL-E 폴백
  | 'ILLUSTRATION'  // 추상 개념·정보 → DALL-E 전용

/** v1: 카드뉴스 스타일 (하위 호환) */
export type ImageStyle =
  | 'warm-lifestyle'
  | 'clean-infographic'
  | 'cozy-community'
  | 'active-growth'

// ---------------------------------------------------------------------------
// Person Style Guide — 한국인 실사 인물 규칙 (v2)
// 레퍼런스 연령대: 1956~1965년생 한국 여성 (만 60~70세) — 우나어 5060 타겟 매칭
// ---------------------------------------------------------------------------

/** 다중 인물 감지 키워드 */
const MULTI_PERSON_KEYWORDS = [
  'two', 'three', 'women', 'friends', 'together', 'group',
  'couple', 'sisters', 'colleagues', 'gathering', 'duo',
]

/** dallePrompt에 복수 인물 키워드가 포함됐는지 감지 */
export function isMultiPersonPrompt(dallePrompt: string): boolean {
  const lower = dallePrompt.toLowerCase()
  return MULTI_PERSON_KEYWORDS.some((kw) => lower.includes(kw))
}

/** 실제 한국인임을 강조하는 공통 기반 (단수·복수 공유) */
const KOREAN_REALISM_BASE =
  // 실제 인물 3중 강조
  'THIS IS A PHOTOGRAPH OF REAL PEOPLE — not AI art, not illustration, not CGI. '
  + 'Captured on a full-frame mirrorless camera, photojournalistic documentary style, '
  + 'indistinguishable from a real photograph taken by a professional photographer. '
  // 한국인 특성
  + 'Genuine East Asian Korean facial features and bone structure — '
  + 'inspired by the natural appearance of real Korean women in their 50s and 60s, '
  + 'NOT resembling any specific individual or celebrity. '
  // 헤어·피부 — 5060 자연스러운 노화 허용 (흰머리 금지 조항 제거)
  + 'Naturally styled hair with possible subtle grey highlights (less than 20%), '
  + 'modern flattering Korean cut that celebrates natural aging beautifully. '
  + 'Healthy luminous skin with genuine human skin texture: visible pores, '
  + 'fine lines around eyes and mouth showing life experience, '
  + 'natural pigmentation — '
  + 'NOT airbrushed NOT perfectly smooth NOT model skin. '
  // 부정 지시
  + 'NOT illustration, NOT animation, NOT CGI render, NOT Midjourney style, '
  + 'NOT elderly frail, NOT young girl under 45, '
  + 'NOT Western, NOT Caucasian, NOT Southeast Asian.'

export const PERSON_STYLE_GUIDE = {
  /** 단일 인물 (1명) — 5060 한국 여성 (DALL-E 렌더링 기준 mid-40s = 실제 5060 외모) */
  femalePromptSingle:
    'Photorealistic photograph, one Korean woman in her mid-40s, '
    + 'refined intelligent warmth, modern Korean everyday fashion in muted elegant tones, '
    + 'candid authentic lifestyle moment — genuine natural expression, NOT posed, '
    + 'soft natural window light or warm outdoor golden light, '
    + 'shot on Canon EOS R5 85mm f/1.8 portrait lens, shallow depth of field, '
    + 'editorial magazine photograph quality, subtle warm coral accent in environment, '
    + KOREAN_REALISM_BASE,

  /** 복수 인물 (2~3명) — 5060 한국 여성들 그룹 (DALL-E 렌더링 기준 mid-40s = 실제 5060) */
  femalePromptMultiple:
    'Photorealistic photograph, two to three Korean women in their mid-40s, '
    + 'genuine warm friendship — real laughter, natural eye contact, authentic joyful connection, '
    + 'NOT models, NOT posed stock photo, spontaneous candid moment, '
    + 'modern Korean everyday fashion, '
    + 'soft natural window light or warm outdoor golden light, '
    + 'shot on Canon EOS R5 35mm f/2.8, editorial magazine quality, '
    + KOREAN_REALISM_BASE,

  /** 하위 호환용 — 기존 코드 참조 대응 (= femalePromptSingle) */
  get femalePrompt() { return this.femalePromptSingle },

  never: [
    'wrinkled', 'elderly frail', 'senior citizen',
    'old person hunched', 'frail', 'walking stick', 'cane', 'Western', 'Caucasian',
  ] as const,
} as const

// ---------------------------------------------------------------------------
// Style Prefixes v1 — 카드뉴스 하위 호환
// ---------------------------------------------------------------------------

export const STYLE_PREFIXES: Record<ImageStyle, string> = {
  'warm-lifestyle':
    'Photorealistic editorial photograph, warm natural lighting, Korean everyday life scene, magazine quality,',
  'clean-infographic':
    'Clean minimal flat design illustration, professional Korean magazine style, soft warm color palette, NOT cartoon, NOT anime,',
  'cozy-community':
    'Photorealistic photograph, warm cozy community atmosphere, people together, soft natural lighting,',
  'active-growth':
    'Photorealistic photograph, energetic active lifestyle, dynamic moment, natural lighting,',
}

// ---------------------------------------------------------------------------
// Image Type Prefixes v2 — 매거진 타입별 DALL-E 프리픽스
// ---------------------------------------------------------------------------

const IMAGE_TYPE_PREFIXES: Record<Exclude<ImageType, 'PERSON_REAL'>, string> = {
  'FOOD_PHOTO':
    'Photorealistic food photography, warm natural window lighting, fresh appetizing ingredients, '
    + 'Korean home cooking aesthetic, magazine editorial quality, clean composition,',
  'SCENE_PHOTO':
    'Photorealistic lifestyle photograph, warm golden natural lighting, '
    + 'Korean aesthetic sensibility, cinematic quality, wide angle,',
  'OBJECT_PHOTO':
    'Photorealistic product photography, clean neutral background, '
    + 'professional soft studio lighting, sharp detail, magazine quality,',
  'ILLUSTRATION':
    'Clean minimal flat design illustration, professional Korean digital magazine style, '
    + 'soft warm color palette with coral accent, geometric shapes and simple icons, '
    + 'NOT cartoon characters, NOT anime, NOT children illustration style,',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERSON_KEYWORDS = ['사람', '여성', '남성', '얼굴', '인물', '남자', '여자', '부부', '커플']
const NO_TEXT_DIRECTIVE = 'No text, no letters, no words, no numbers in the image.'

/** 프롬프트에 인물 관련 키워드가 포함되어 있는지 감지 */
export function containsPersonKeyword(prompt: string): boolean {
  return PERSON_KEYWORDS.some((kw) => prompt.includes(kw))
}

/** 네거티브 프롬프트 생성 (인물 이미지용) */
export function buildNegativePrompt(): string {
  return PERSON_STYLE_GUIDE.never.map((term) => `NOT ${term}`).join(', ')
}

/**
 * v1: 카드뉴스용 DALL-E 프롬프트 조립 (하위 호환)
 */
export function buildImagePrompt(prompt: string, style: ImageStyle): string {
  const parts: string[] = [STYLE_PREFIXES[style]]

  if (containsPersonKeyword(prompt)) {
    parts.push(PERSON_STYLE_GUIDE.femalePrompt)
    parts.push(buildNegativePrompt())
  }

  parts.push(prompt)
  parts.push(NO_TEXT_DIRECTIVE)

  return parts.join(' ')
}

/**
 * v2: 매거진용 타입별 DALL-E 프롬프트 조립
 */
export function buildImagePromptByType(
  prompt: string,
  imageType: ImageType,
): string {
  if (imageType === 'PERSON_REAL') {
    const basePrompt = isMultiPersonPrompt(prompt)
      ? PERSON_STYLE_GUIDE.femalePromptMultiple
      : PERSON_STYLE_GUIDE.femalePromptSingle
    return `${basePrompt}, ${prompt}, ${buildNegativePrompt()} ${NO_TEXT_DIRECTIVE}`
  }

  const prefix = IMAGE_TYPE_PREFIXES[imageType]
  return `${prefix} ${prompt} ${NO_TEXT_DIRECTIVE}`.trim()
}

// ---------------------------------------------------------------------------
// Magazine Style Mapping v1 — 하위 호환
// ---------------------------------------------------------------------------

/** 매거진 카테고리를 v1 ImageStyle로 매핑 */
export function getMagazineImageStyle(category: string): ImageStyle {
  const map: Record<string, ImageStyle> = {
    '건강': 'clean-infographic',
    '재테크': 'clean-infographic',
    '일자리': 'clean-infographic',
    '유머': 'active-growth',
    '문화': 'active-growth',
    '취미': 'active-growth',
    '여행': 'warm-lifestyle',
    '요리': 'warm-lifestyle',
    '생활': 'warm-lifestyle',
    '관계': 'warm-lifestyle',
    '집꾸미기': 'warm-lifestyle',
    '패션': 'warm-lifestyle',
    '간병': 'warm-lifestyle',
  }
  return map[category] ?? 'warm-lifestyle'
}

// ---------------------------------------------------------------------------
// Magazine Image Plan v2 — 카테고리별 기본 이미지 컨텍스트
// ---------------------------------------------------------------------------

/** 매거진 이미지 컨텍스트 (v2) */
export interface ImageContext {
  type: ImageType
  gender?: 'female'
  dallePrompt: string       // DALL-E용 영문 프롬프트
  unsplashQuery?: string    // Unsplash 검색어 (FOOD/SCENE/OBJECT만)
}

/** 카테고리별 기본 이미지 컨텍스트 2종 (AI가 컨텍스트를 주지 않을 때 폴백) */
export function getDefaultImagePlan(category: string): [ImageContext, ImageContext] {
  const plans: Record<string, [ImageContext, ImageContext]> = {
    '건강': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her mid-40s doing gentle morning walk outdoors smiling, natural sunlight, park path',
        unsplashQuery: 'mature women outdoor walk smiling park morning',
      },
      {
        type: 'FOOD_PHOTO',
        dallePrompt: 'fresh healthy Korean vegetables and ingredients on wooden table, natural light, appetizing',
        unsplashQuery: 'fresh vegetables healthy food wooden table light',
      },
    ],
    '생활': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her 60s organizing a cozy Korean home with warm morning sunlight',
      },
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'cozy Korean home interior warm living room natural light',
        unsplashQuery: 'korean home interior cozy living room',
      },
    ],
    '관계': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her mid-40s smiling warmly at cafe table with coffee, genuine happy expression, window light, candid moment',
        unsplashQuery: 'women friends laughing together coffee cafe',
      },
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'cozy Korean cafe interior warm wooden tables coffee cups afternoon light, inviting atmosphere',
        unsplashQuery: 'cozy cafe interior wooden table warm light',
      },
    ],
    '재테크': [
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'Korean home study desk with notebook, glasses, calculator, warm morning light, cozy atmosphere',
        unsplashQuery: 'home desk notebook writing morning light cozy',
      },
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her mid-40s reviewing financial documents at home desk with reading glasses, thoughtful expression, warm light',
        unsplashQuery: 'mature woman reading documents desk home',
      },
    ],
    '여행': [
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'beautiful Korean nature scenery mountains or coast autumn golden hour',
        unsplashQuery: 'asian women 50s travel outdoor smiling group',
      },
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'two Korean women in their 60s enjoying sightseeing at a scenic Korean location together',
      },
    ],
    '요리': [
      {
        type: 'FOOD_PHOTO',
        dallePrompt: 'delicious Korean home cooked meal with rice and healthy banchan side dishes',
        unsplashQuery: 'korean food homemade healthy banchan',
      },
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her 60s cooking happily in a bright modern kitchen smiling',
      },
    ],
    '집꾸미기': [
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'beautifully decorated Korean home interior cozy living room warm lighting',
        unsplashQuery: 'cozy home interior living room warm lighting decor',
      },
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her 60s proudly decorating her home interior with plants and cozy items',
      },
    ],
    '패션': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her 60s wearing elegant comfortable everyday Korean fashion smiling confidently',
      },
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'elegant minimal Korean fashion accessories scarf bag shoes flat lay, soft light',
        unsplashQuery: 'mature woman casual elegance modern fashion style',
      },
    ],
    '문화': [
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'Korean art gallery museum interior warm elegant lighting',
        unsplashQuery: 'korean museum art gallery interior',
      },
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her 60s reading a book in a cozy sunlit Korean cafe',
      },
    ],
    '취미': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her 60s happily doing a hobby like painting or gardening with natural sunlight',
      },
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'hobby craft supplies art materials warm light creative workspace',
        unsplashQuery: 'hobby craft painting creative lifestyle woman',
      },
    ],
    '일자리': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her 60s working confidently at a clean modern office desk',
      },
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'modern clean Korean workplace office bright natural lighting',
        unsplashQuery: 'modern office workspace professional',
      },
    ],
    '간병': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman in her mid-40s warmly and gently holding hands with elderly parent at home, soft warm light, caring expression',
        unsplashQuery: 'daughter caring elderly parent home warm',
      },
      {
        type: 'ILLUSTRATION',
        dallePrompt: 'warm home care support concept illustration — gentle hands holding, soft warm colors, minimal style, caring family bond',
      },
    ],
  }
  return plans[category] ?? plans['생활']
}
