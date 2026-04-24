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
// 레퍼런스 연령대: 1978~1982년생 한국 여성 (만 44~46세)
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
  + 'Korean women born in the late 1970s to early 1980s (around 1978–1982), '
  + 'inspired by the natural appearance of real Korean women of this generation, '
  + 'NOT resembling any specific individual or celebrity. '
  // 헤어·피부
  + 'Naturally styled dark brown to dark black hair, modern flattering Korean cut, '
  + 'barely visible grey — less than 5% grey strands at most. '
  + 'Healthy luminous skin with genuine human skin texture: visible pores, '
  + 'subtle laugh lines at eye corners, natural pigmentation — '
  + 'NOT airbrushed NOT perfectly smooth NOT model skin. '
  // 부정 지시
  + 'NOT illustration, NOT animation, NOT CGI render, NOT Midjourney style, '
  + 'NOT gray hair, NOT white hair, NOT elderly, NOT young girl under 35, '
  + 'NOT Western, NOT Caucasian, NOT Southeast Asian.'

export const PERSON_STYLE_GUIDE = {
  /** 단일 인물 (1명) — 중반 40대 한국 여성 */
  femalePromptSingle:
    'Photorealistic photograph, one Korean woman in her mid-40s (age 44 to 46), '
    + 'refined intelligent warmth, modern Korean everyday fashion in muted elegant tones, '
    + 'candid authentic lifestyle moment — genuine natural expression, NOT posed, '
    + 'soft natural window light or warm outdoor golden light, '
    + 'shot on Canon EOS R5 85mm f/1.8 portrait lens, shallow depth of field, '
    + 'editorial magazine photograph quality, subtle warm coral accent in environment, '
    + KOREAN_REALISM_BASE,

  /** 복수 인물 (2~3명) — 중반 40대 한국 여성들 */
  femalePromptMultiple:
    'Photorealistic photograph, two to three Korean women in their mid-40s (age 44 to 46), '
    + 'genuine warm friendship — real laughter, natural eye contact, authentic connection, '
    + 'NOT models, NOT posed stock photo, spontaneous candid moment, '
    + 'modern Korean everyday fashion, '
    + 'soft natural window light or warm outdoor golden light, '
    + 'shot on Canon EOS R5 35mm f/2.8, editorial magazine quality, '
    + KOREAN_REALISM_BASE,

  /** 하위 호환용 — 기존 코드 참조 대응 (= femalePromptSingle) */
  get femalePrompt() { return this.femalePromptSingle },

  never: [
    'white hair', 'gray hair', 'wrinkled', 'elderly', 'senior citizen',
    'old person', 'frail', 'walking stick', 'cane', 'Western', 'Caucasian',
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
    '여행': 'warm-lifestyle',
    '요리': 'warm-lifestyle',
    '생활': 'warm-lifestyle',
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
        dallePrompt: 'Korean woman doing gentle morning exercise or stretching outdoors',
      },
      {
        type: 'FOOD_PHOTO',
        dallePrompt: 'fresh healthy Korean vegetables and ingredients on wooden table',
        unsplashQuery: 'korean healthy food vegetables',
      },
    ],
    '생활': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman organizing a tidy Korean home with warm morning sunlight',
      },
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'cozy Korean home interior warm living room natural light',
        unsplashQuery: 'korean home interior cozy living room',
      },
    ],
    '재테크': [
      {
        type: 'ILLUSTRATION',
        dallePrompt: 'savings growth finance investment concept illustration — coins, growth chart, piggy bank',
      },
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman reviewing financial documents at home desk with smartphone',
      },
    ],
    '여행': [
      {
        type: 'SCENE_PHOTO',
        dallePrompt: 'beautiful Korean nature scenery mountains or coast autumn golden hour',
        unsplashQuery: 'korea nature scenery mountains autumn',
      },
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman enjoying sightseeing at a scenic Korean location',
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
        dallePrompt: 'Korean woman cooking in a bright modern Korean kitchen smiling',
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
        dallePrompt: 'Korean woman reading a book in a cozy sunlit Korean cafe',
      },
    ],
    '일자리': [
      {
        type: 'PERSON_REAL',
        gender: 'female',
        dallePrompt: 'Korean woman working confidently at a clean modern office desk',
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
        dallePrompt: 'Korean woman warmly and gently caring for an elderly parent at home',
      },
      {
        type: 'OBJECT_PHOTO',
        dallePrompt: 'home care medical supplies caregiving items organized neatly',
        unsplashQuery: 'home care medical supplies healthcare',
      },
    ],
  }
  return plans[category] ?? plans['생활']
}
