/**
 * 닉네임 규칙 — 단일 진실의 원천 (Single Source of Truth)
 *
 * 가입 온보딩(OnboardingForm + onboarding.ts)과 프로필 변경(NicknameSettings + settings.ts)이
 * 모두 이 파일을 참조한다. 화면마다 규칙(글자수·금지어·메시지)이 어긋나는 drift를 방지.
 *
 * ⚠️ 규칙 변경 시 이 파일만 수정하면 가입/변경 양쪽에 동시 반영됨.
 */

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 10
export const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]+$/

// 운영자 사칭·브랜드 보호용 예약어 (가입/변경 공통 차단)
export const BANNED_WORDS = ['운영자', '관리자', 'admin', '어드민', '관리인', '우나어']

/**
 * 닉네임 형식 검증 (클라이언트·서버 공통).
 * 통과하면 null, 위반하면 사용자에게 보여줄 한국어 안내 문구를 반환.
 * 중복(DB)·변경주기(30일)는 형식 검증이 아니므로 서버에서 별도 확인.
 *
 * @param value 원본 입력값(공백 검출을 위해 trim하지 않음 — 호출부에서 필요 시 trim)
 */
export function validateNicknameFormat(value: string): string | null {
  // 띄어쓰기는 별도 안내 — "한글, 영문, 숫자만"으로 뭉뚱그리면 한글 친 유저가 공백이 문제인 줄 모름
  if (/\s/.test(value)) return '닉네임에는 띄어쓰기를 넣을 수 없어요'
  if (value.length < NICKNAME_MIN) return `${NICKNAME_MIN}자 이상 입력해 주세요`
  if (value.length > NICKNAME_MAX) return `${NICKNAME_MAX}자 이하로 입력해 주세요`
  if (!NICKNAME_REGEX.test(value)) return '한글, 영문, 숫자만 사용할 수 있어요'
  const lower = value.toLowerCase()
  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) return '사용할 수 없는 닉네임이에요'
  }
  return null
}
