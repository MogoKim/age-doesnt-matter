/**
 * 일자리 지역(시도) SEO 랜딩페이지용 단일 진실의 원천.
 * region 필드는 "경기 수원시"·"전남 순천시"처럼 "시도 시군구" 형태(1~2단어)로 저장됨.
 * → contains 필터(시도 단축명)로 매칭, startsWith로 카드 시도 추출.
 */
export const JOB_SIDO_LIST = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const

export type JobSido = (typeof JOB_SIDO_LIST)[number]

export function isJobSido(value: string): value is JobSido {
  return (JOB_SIDO_LIST as readonly string[]).includes(value)
}

/** region 문자열에서 시도 추출 ("세종특별자치시"·"서울 강남구" 모두 대응) */
export function sidoFromRegion(region: string): JobSido | null {
  const r = region.trim()
  return JOB_SIDO_LIST.find((s) => r.startsWith(s)) ?? null
}
