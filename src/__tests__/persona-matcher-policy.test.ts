import { describe, it, expect } from 'vitest'
import {
  analyzePost,
  classifyTopicGroups,
  findHardConstraintViolation,
  scoreCandidate,
  matchPersona,
  emptyExposure,
  type ExposureState,
} from '../../agents/coo/persona-matcher-policy'
import { buildAllProfiles, inferFamilyStatus, type PersonaProfile } from '../../agents/coo/persona-matcher-profiles'

/** persona matcher dry-run — 글 분석·hard constraint·penalty·reserve fallback 계약 고정 */

const mk = (over: Partial<PersonaProfile>): PersonaProfile => ({
  key: 'T1',
  authorEmail: 'bot-t1@unao.bot',
  nickname: '테스트',
  origin: 'bot',
  board: 'STORY',
  topicGroups: ['FAMILY_SPOUSE'],
  familyStatus: 'married',
  hasGrandchildren: false,
  reactionOnly: false,
  reserveCandidate: false,
  lightTone: false,
  nicknameLightTone: false,
  empathyTone: false,
  depth: 'deep',
  ...over,
})

const post = (title: string, content = '', boardType = 'STORY') => analyzePost({ title, content, boardType })

describe('analyzePost — 화자 단서·세계관 위반 (배정 불가 + Haiku 표본)', () => {
  it('명시적 남성 1인칭(제/내/우리 와이프, 저는 남자인데)만 MALE_SELF', () => {
    expect(post('제 와이프가 요즘 말이 없어요').worldviewViolation).toBe('MALE_SELF')
    expect(post('고민입니다', '저는 남자인데 이런 고민 이상한가요').worldviewViolation).toBe('MALE_SELF')
  })
  it("남초 일반론/3인칭('남자들은 와이프가~')은 MALE_SELF 아님 — MALE_DISCOURSE로 분리 (calibration 3)", () => {
    const a = post('이혼한 제 친구 보고 궁금한점', '남자들은 와이프가 미우면 애한테 정이 안 간다던데요')
    expect(a.worldviewViolation).toBeNull()
    expect(a.speakerClues.maleDiscourse).toBe(true)
    expect(post('그 집 와이프분이 고생이 많으시네요').worldviewViolation).toBeNull()
  })
  it("가정문('제가 쎄보이는 남자라도')은 MALE_SELF 아님", () => {
    expect(post('방금 심한 욕 들었는데', '제가 쎄보이는 남자라도 과연 그렇게했을까').worldviewViolation).toBeNull()
  })
  it("맞벌이+육아 결합은 CURRENT_PARENTING (calibration 6 — '맞벌이면서 집안일 육아 혼자' 표본)", () => {
    expect(post('맞벌이면서 집안일 육아 혼자 다하는거요').worldviewViolation).toBe('CURRENT_PARENTING')
    expect(post('독박육아 시절 생각나요').worldviewViolation).toBe('CURRENT_PARENTING')
  })
  it('2030 자기발화(남자친구)는 YOUNG_SELF', () => {
    expect(post('남자친구가 결혼 얘기를 안 해요').worldviewViolation).toBe('YOUNG_SELF')
  })
  it('무근거 임신/출산 자기발화는 YOUNG_SELF (calibration 원칙 ①)', () => {
    expect(post('제가 임신 8주인데 입덧이 심해요').worldviewViolation).toBe('YOUNG_SELF')
  })
  it('초등 현재 양육(초6 피씨방)은 CURRENT_PARENTING', () => {
    expect(post('초6 아들 피씨방 5만원 사건').worldviewViolation).toBe('CURRENT_PARENTING')
  })
  it('손주/성인자녀 이야기는 위반 아님', () => {
    expect(post('손녀가 첫 글자를 썼어요').worldviewViolation).toBeNull()
    expect(post('취직한 아들이 용돈을 줬어요').worldviewViolation).toBeNull()
  })
  it('남편 현재형 글은 husbandPresent, 사별 문맥은 아님', () => {
    expect(post('남편이 은퇴하고 하루종일 집에 있어요').speakerClues.husbandPresent).toBe(true)
    expect(post('남편을 먼저 보내고 혼자 산 지 5년', '').speakerClues.husbandPresent).toBe(false)
  })
})

describe('classifyTopicGroups — 주제군 분류 (글·페르소나 공용)', () => {
  it('남편/시댁/연금/건강/동네 키워드 분류', () => {
    expect(classifyTopicGroups('남편 잔소리에 지쳐요')).toContain('FAMILY_SPOUSE')
    expect(classifyTopicGroups('시어머니가 김치를 또 보내셨어요')[0]).toBe('INLAW')
    expect(classifyTopicGroups('국민연금 수령 나이 고민')).toContain('RETIRE_MONEY')
    expect(classifyTopicGroups('갱년기 불면증 어떻게 하세요')).toContain('HEALTH')
    expect(classifyTopicGroups('동네 시장 계란값이 올랐어요')).toContain('LOCAL_DAILY')
  })
  it('매칭 없으면 GENERAL, HUMOR 보드는 HUMOR_LIGHT 부여', () => {
    expect(classifyTopicGroups('오늘의 기록')).toEqual(['GENERAL'])
    expect(classifyTopicGroups('오늘의 기록', 'HUMOR')).toContain('HUMOR_LIGHT')
  })
  it('살림/가전/음식/모임/피곤 신호는 reserve로 안 빠지고 주제군 분류 (calibration 4)', () => {
    expect(classifyTopicGroups('제습기 풀가동 해도 실내습도가 73프로에요')).toContain('LOCAL_DAILY')
    expect(classifyTopicGroups('대왕오징어채는 못먹을 수준인가요?')).toContain('LOCAL_DAILY')
    expect(classifyTopicGroups('소외감 느껴지는 모임은 나갈 필요없겠죠?')).toContain('LOCAL_DAILY')
    expect(classifyTopicGroups('몸이 늘 피곤하고 예민한데 절에 가면 가벼워져요')).toContain('HEALTH')
  })
  it('category 보조 신호 — 텍스트가 못 잡는 글의 reserve 과다 방지 (1차 실측 45% 보정)', () => {
    expect(classifyTopicGroups('하이닉스 단타로 300 벌었어요', 'LIFE2', '재테크·연금')).toContain('RETIRE_MONEY')
    expect(classifyTopicGroups('아들 자랑 하나 해도 될까요', 'STORY', '가족')).toContain('FAMILY_SPOUSE')
    expect(classifyTopicGroups('오늘의 기록', 'STORY', '자유수다')).toEqual(['GENERAL']) // 무매핑 category는 텍스트에 맡김
  })
})

describe('findHardConstraintViolation — hard 제외', () => {
  const husbandPost = post('남편이 각방을 쓰자고 해요')
  it('reaction_only(wave 전용)는 원글 배정 절대 불가', () => {
    expect(findHardConstraintViolation(mk({ reactionOnly: true }), husbandPost)).toBe('REACTION_ONLY')
  })
  it('남편 현재형 글은 사별/이혼/혼자 페르소나가 맡지 않음', () => {
    expect(findHardConstraintViolation(mk({ familyStatus: 'widowed' }), husbandPost)).toBe('FAMILY_CONFLICT_WIDOWED')
    expect(findHardConstraintViolation(mk({ familyStatus: 'divorced' }), husbandPost)).toBe('FAMILY_CONFLICT_DIVORCED')
    expect(findHardConstraintViolation(mk({ familyStatus: 'solo' }), husbandPost)).toBe('FAMILY_CONFLICT_SOLO')
  })
  it('기혼/unknown은 통과 (unknown은 검수 플래그로만)', () => {
    expect(findHardConstraintViolation(mk({ familyStatus: 'married' }), husbandPost)).toBeNull()
    expect(findHardConstraintViolation(mk({ familyStatus: 'unknown' }), husbandPost)).toBeNull()
  })
  it('건강 글에 유머형은 닉네임 기준으로도 기본 제외 — 정체성이 건강/공감형일 때만 예외 (calibration 1)', () => {
    const healthPost = post('갱년기 불면증 어떻게 하세요')
    expect(findHardConstraintViolation(mk({ lightTone: true }), healthPost)).toBe('TONE_MISMATCH_HEALTH')
    expect(findHardConstraintViolation(mk({ nicknameLightTone: true }), healthPost)).toBe('TONE_MISMATCH_HEALTH')
    expect(findHardConstraintViolation(mk({ nicknameLightTone: true, empathyTone: true }), healthPost)).toBeNull()
  })
})

describe('scoreCandidate — diversity penalty·quota', () => {
  const a = post('남편이 각방을 쓰자고 해요')
  it('일 2편/주 8편 도달 시 overQuota', () => {
    const e = emptyExposure()
    e.daily.T1 = 2
    expect(scoreCandidate(mk({}), a, e).overQuota).toBe(true)
    const e2 = emptyExposure()
    e2.weekly.T1 = 8
    expect(scoreCandidate(mk({}), a, e2).overQuota).toBe(true)
  })
  it('reserve는 주 3회 도달 시 overQuota (일반 페르소나보다 낮은 상한)', () => {
    const e = emptyExposure()
    e.weekly.T1 = 3
    expect(scoreCandidate(mk({ reserveCandidate: true }), a, e).overQuota).toBe(true)
    expect(scoreCandidate(mk({ reserveCandidate: false }), a, e).overQuota).toBe(false)
  })
  it('첫 화면 중복·72h 같은 주제군·연속 담당 감점', () => {
    const e: ExposureState = {
      ...emptyExposure(),
      firstScreen: { T1: 2 },
      recentGroups72h: { T1: ['FAMILY_SPOUSE'] },
      lastGroup: { T1: 'FAMILY_SPOUSE' },
    }
    const s = scoreCandidate(mk({}), a, e)
    expect(s.score).toBe(100 - 60 - 40 - 30)
    expect(s.penalties).toEqual(expect.arrayContaining(['FIRST_SCREEN_DUP', 'SAME_GROUP_72H(x1)', 'CONSECUTIVE_SAME_GROUP']))
  })
})

describe('calibration 2 — 은퇴/돈 글 유머형 감점 + nicknameToneMismatch flag', () => {
  const moneyPost = post('국민연금 수령 나이 고민')
  it('정체성까지 가벼우면 -60, 닉네임만 유머형이면 -30', () => {
    const light = scoreCandidate(mk({ topicGroups: ['RETIRE_MONEY'], lightTone: true }), moneyPost, emptyExposure())
    expect(light.penalties).toContain('LIGHT_TONE_ON_MONEY')
    const nick = scoreCandidate(mk({ topicGroups: ['RETIRE_MONEY'], nicknameLightTone: true }), moneyPost, emptyExposure())
    expect(nick.penalties).toContain('NICKNAME_TONE_ON_MONEY')
    expect(light.score).toBeLessThan(nick.score)
  })
  it('돈 글에 유머형 닉네임(정상 정체성) 배정 시 nicknameToneMismatch flag + 검수 사유', () => {
    const r = matchPersona([mk({ key: 'N1', topicGroups: ['RETIRE_MONEY'], nicknameLightTone: true })], moneyPost, emptyExposure())
    expect(r.finalPick?.key).toBe('N1')
    expect(r.nicknameToneMismatch).toBe(true)
    expect(r.needsReview).toBe(true)
  })
  it('MALE_DISCOURSE 글은 배정되되 needsReview', () => {
    const a = post('궁금한점', '남자들은 와이프가 사랑스러워야 자식도 예뻐한다던데')
    const r = matchPersona([mk({ key: 'F1' })], a, emptyExposure())
    expect(r.finalPick?.key).toBe('F1')
    expect(r.needsReview).toBe(true)
    expect(r.reviewReasons.join(' ')).toContain('MALE_DISCOURSE')
  })
})

describe('matchPersona — 후보군·reserve fallback·final pick', () => {
  const pool = [
    mk({ key: 'F1', topicGroups: ['FAMILY_SPOUSE'] }),
    mk({ key: 'F2', topicGroups: ['FAMILY_SPOUSE', 'HEALTH'] }),
    mk({ key: 'F3', topicGroups: ['FAMILY_SPOUSE'] }),
    mk({ key: 'H1', topicGroups: ['HEALTH'] }),
    mk({ key: 'R1', topicGroups: ['GENERAL'], reserveCandidate: true }),
    mk({ key: 'W1', reactionOnly: true }),
  ]
  const familyPost = post('남편이 각방을 쓰자고 해요')

  it('가족/부부/남편 글에서 후보군이 1명으로 몰리지 않음 (F1~F3)', () => {
    const r = matchPersona(pool, familyPost, emptyExposure())
    expect(r.eligibleCount).toBeGreaterThanOrEqual(3)
    expect(r.singleCandidateWarning).toBe(false)
    expect(r.reserveFallback).toBe(false)
    expect(['F1', 'F2', 'F3']).toContain(r.finalPick?.key)
    expect(r.excluded.W1).toBe('REACTION_ONLY')
  })
  it('주제군 뚜렷한 글에는 reserve가 나오지 않음', () => {
    const r = matchPersona(pool, familyPost, emptyExposure())
    expect(r.finalPick?.key).not.toBe('R1')
  })
  it('주제군 약한 일상글만 reserve fallback', () => {
    const r = matchPersona(pool, post('오늘 하루도 지나갑니다'), emptyExposure())
    expect(r.reserveFallback).toBe(true)
    expect(r.finalPick?.key).toBe('R1')
  })
  it('eligible 전원 quota 소진 시에만 reserve fallback + 수급 검수 플래그', () => {
    const e = emptyExposure()
    e.daily.F1 = 2
    e.daily.F2 = 2
    e.daily.F3 = 2
    const r = matchPersona(pool, familyPost, e)
    expect(r.reserveFallback).toBe(true)
    expect(r.needsReview).toBe(true)
  })
  it('후보 1명뿐이면 singleCandidateWarning + 검수 플래그', () => {
    const r = matchPersona([pool[0], pool[5]], familyPost, emptyExposure())
    expect(r.singleCandidateWarning).toBe(true)
    expect(r.needsReview).toBe(true)
  })
  it('동점이면 최장 미노출자 우선', () => {
    const e = emptyExposure()
    e.lastAssignedAt.F1 = 2000
    e.lastAssignedAt.F3 = 1000 // F3이 더 오래 쉼
    const r = matchPersona([pool[0], pool[2]], familyPost, e)
    expect(r.finalPick?.key).toBe('F3')
  })
  it('세계관 위반 글은 finalPick null + haikuSampleCandidate', () => {
    const r = matchPersona(pool, post('초6 아들 피씨방 5만원 사건'), emptyExposure())
    expect(r.finalPick).toBeNull()
    expect(r.haikuSampleCandidate).toBe(true)
    expect(r.needsReview).toBe(true)
  })
})

describe('buildAllProfiles — bot/curator 통합 풀', () => {
  const profiles = buildAllProfiles()
  it('bot + curator 양 체계 포함, 남성 페르소나 없음', () => {
    expect(profiles.some(p => p.origin === 'bot')).toBe(true)
    expect(profiles.filter(p => p.origin === 'curator').length).toBeGreaterThanOrEqual(90)
  })
  it('wave 전용 BI~BW는 reactionOnly, BX(말티즈엄마)는 아님', () => {
    expect(profiles.find(p => p.key === 'BI')?.reactionOnly).toBe(true)
    expect(profiles.find(p => p.key === 'BW')?.reactionOnly).toBe(true)
    expect(profiles.find(p => p.key === 'BX')?.reactionOnly).toBe(false)
  })
  it('curator key는 curator- 접두사 + 이메일 소문자', () => {
    const c = profiles.find(p => p.key === 'curator-A')
    expect(c?.authorEmail).toBe('curator-a@unao.bot')
    expect(c?.depth).toBe('shallow')
  })
})

describe('inferFamilyStatus — 텍스트 휴리스틱', () => {
  it('사별/이혼/혼자/기혼/unknown 분기', () => {
    expect(inferFamilyStatus('남편을 먼저 보내고 혼자 지낸다')).toBe('widowed')
    expect(inferFamilyStatus('이혼 후 새 삶')).toBe('divorced')
    expect(inferFamilyStatus('혼자 산 지 10년, 독거 생활')).toBe('solo')
    expect(inferFamilyStatus('남편과 시장 다니는 이야기')).toBe('married')
    expect(inferFamilyStatus('꽃꽂이와 산책을 좋아함')).toBe('unknown')
  })
  it('자녀/손주 신호는 married 추론 (calibration 5 — 사별/이혼/혼자 신호가 우선)', () => {
    expect(inferFamilyStatus('아들 도시락 싸주던 시절 이야기')).toBe('married')
    expect(inferFamilyStatus('손녀 재롱에 하루가 간다')).toBe('married')
    expect(inferFamilyStatus('이혼 후 딸과 둘이 산다')).toBe('divorced')
  })
})
