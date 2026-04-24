# 전사적 이미지 생성 가이드라인

> 모든 에이전트(카드뉴스, 매거진, 향후 추가 에이전트)가 DALL-E 등으로 이미지를 생성할 때 반드시 따라야 하는 규칙.
> 코드 구현체: `agents/core/image-prompt-builder.ts`

## 1. 인물 묘사 규칙

### 여성
- "elegant Korean woman in her early 50s, well-groomed, healthy and vibrant"
- "natural dark hair with subtle highlights, confident smile"
- "stylish casual outfit, warm natural lighting"
- "similar vibe to a refined Korean actress in her 50s"

### 남성
- "charismatic Korean man in his early 50s, well-maintained appearance"
- "natural dark hair, warm genuine smile"
- "smart casual style, confident posture"
- "similar vibe to a distinguished Korean actor in his 50s"

### 절대 금지 (네거티브 프롬프트)
다음 표현은 인물 이미지에서 반드시 `NOT` 접두사로 제외:
- white hair, gray hair, wrinkled, elderly, senior citizen
- old person, frail, walking stick, cane
- Western, Caucasian

### 인물 감지 키워드
프롬프트에 아래 키워드가 포함되면 자동으로 인물 스타일 가이드 적용:
- 사람, 여성, 남성, 얼굴, 인물, 남자, 여자, 부부, 커플

## 2. 스타일 프리픽스

| 스타일 ID | 설명 | 프리픽스 |
|-----------|------|----------|
| `warm-lifestyle` | 따뜻한 생활 | "따뜻하고 밝은 톤의 일러스트레이션, 한국적 감성, 잡지 품질," |
| `clean-infographic` | 깔끔한 정보형 | "깔끔하고 신뢰감 있는 인포그래픽 스타일, 미니멀," |
| `cozy-community` | 포근한 커뮤니티 | "포근하고 따뜻한 커뮤니티 분위기, 함께하는 장면," |
| `active-growth` | 활기찬 성장 | "활기차고 에너지 넘치는, 도전과 성장의 분위기," |

## 3. 텍스트 금지
모든 이미지에 아래 디렉티브 자동 추가:
> "No text, no letters, no words, no numbers in the image."

## 4. 기술 설정
- 모델: `dall-e-3`
- 크기: `1024x1024`
- 품질: `standard` ($0.04/장)
- `hd` 품질은 비용 2배 → 사용 금지 (월간 예산 초과 위험)

## 5. 비용 통제
- 카드뉴스: 슬라이드당 1장, 전체 2~4장/회
- 매거진: 히어로 1장 + 본문 최대 2장 = 최대 3장/기사
- 월간 DALL-E 예산 상한: ~$20 (전체 $50 예산의 40%)
