/**
 * author-reply lane cap 재설계 (2026-08-07)
 *
 * 전역 DAILY_JUDGE_CAP(10)이 실회원·게스트·봇 companion·SKIP·ESCALATE를 한 통에 세면서
 * 실회원 응답이 밀리던 문제를 lane 분리로 고쳤다. 이 테스트가 그 계약을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  laneOf, judgeCapFor, judgeOrderRank, sortByJudgeOrder,
  DAILY_HUMAN_JUDGE_CAP, DAILY_COMPANION_JUDGE_CAP, PER_USER_DAILY_REPLY_CAP,
  MAX_AUTHOR_REPLIES_PER_POST, companionQuota, selectThreadReplyTargets,
  type CommentActor, type ReplyTargetRole,
} from '../../agents/coo/author-reply-policy'

const ROOT = join(__dirname, '../..')
const driverSrc = readFileSync(join(ROOT, 'agents/coo/author-reply-driver.ts'), 'utf8')
const policySrc = readFileSync(join(ROOT, 'agents/coo/author-reply-policy.ts'), 'utf8')

describe('레거시 제거 — 옛 cap과 병존하지 않는다', () => {
  it('DAILY_JUDGE_CAP 잔존 0 (driver·policy)', () => {
    expect(driverSrc).not.toContain('DAILY_JUDGE_CAP')
    expect(policySrc).not.toContain('DAILY_JUDGE_CAP')
  })

  it('새 cap 상수가 실제로 driver에서 쓰인다', () => {
    for (const k of ['DAILY_HUMAN_JUDGE_CAP', 'DAILY_COMPANION_JUDGE_CAP', 'PER_USER_DAILY_REPLY_CAP']) {
      expect(driverSrc, k).toContain(k)
    }
  })

  it('확정 수치', () => {
    expect(DAILY_HUMAN_JUDGE_CAP).toBe(12)
    expect(DAILY_COMPANION_JUDGE_CAP).toBe(6)
    expect(PER_USER_DAILY_REPLY_CAP).toBe(2)
    expect(MAX_AUTHOR_REPLIES_PER_POST).toBe(3) // PR #302 불변
  })
})

describe('lane 매핑', () => {
  it('사람 PRIMARY는 human', () => {
    expect(laneOf('REAL_MEMBER', 'PRIMARY')).toBe('human')
    expect(laneOf('GUEST', 'PRIMARY')).toBe('human')
  })

  it('COMPANION은 대상이 사람이어도 companion — 사람 몫을 잠식하지 않는다', () => {
    expect(laneOf('REAL_MEMBER', 'COMPANION')).toBe('companion')
    expect(laneOf('BOT', 'COMPANION')).toBe('companion')
    expect(laneOf('GUEST', 'COMPANION')).toBe('companion')
  })

  it('NON_REAL PRIMARY는 human 몫을 쓰지 않는다', () => {
    expect(laneOf('NON_REAL', 'PRIMARY')).toBe('companion')
  })

  it('lane별 cap이 독립', () => {
    expect(judgeCapFor('human')).toBe(12)
    expect(judgeCapFor('companion')).toBe(6)
    expect(judgeCapFor('human')).not.toBe(judgeCapFor('companion'))
  })
})

describe('처리 순서 — 사람 PRIMARY가 항상 봇 COMPANION보다 먼저', () => {
  it('rank: 사람 PRIMARY 0 < 기타 PRIMARY 1 < COMPANION 2', () => {
    expect(judgeOrderRank('REAL_MEMBER', 'PRIMARY')).toBe(0)
    expect(judgeOrderRank('GUEST', 'PRIMARY')).toBe(0)
    expect(judgeOrderRank('NON_REAL', 'PRIMARY')).toBe(1)
    expect(judgeOrderRank('BOT', 'COMPANION')).toBe(2)
    expect(judgeOrderRank('REAL_MEMBER', 'COMPANION')).toBe(2)
  })

  it('앞 글의 COMPANION이 뒤 글의 실회원 PRIMARY를 밀어내지 않는다 (회귀 케이스)', () => {
    // 수정 전 planned 순서: 글1[P, C, C] → 글2[P] → 글3[P]
    const planned = [
      { id: 'p1-primary', actor: 'BOT' as CommentActor, role: 'PRIMARY' as ReplyTargetRole },
      { id: 'p1-comp1', actor: 'BOT' as CommentActor, role: 'COMPANION' as ReplyTargetRole },
      { id: 'p1-comp2', actor: 'BOT' as CommentActor, role: 'COMPANION' as ReplyTargetRole },
      { id: 'p2-real', actor: 'REAL_MEMBER' as CommentActor, role: 'PRIMARY' as ReplyTargetRole },
      { id: 'p3-guest', actor: 'GUEST' as CommentActor, role: 'PRIMARY' as ReplyTargetRole },
    ]
    const ordered = sortByJudgeOrder(planned, x => ({ actor: x.actor, role: x.role }))
    expect(ordered.map(x => x.id)).toEqual([
      'p2-real', 'p3-guest',   // 사람 PRIMARY 먼저
      'p1-primary',            // 기타 PRIMARY
      'p1-comp1', 'p1-comp2',  // COMPANION 마지막
    ])
  })

  it('같은 rank 안에서는 원래 순서(작성 시각) 유지 — 안정 정렬', () => {
    const items = ['a', 'b', 'c'].map(id => ({ id, actor: 'REAL_MEMBER' as CommentActor, role: 'PRIMARY' as ReplyTargetRole }))
    expect(sortByJudgeOrder(items, x => x).map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('lane 독립 소진 시뮬레이션', () => {
  /** driver 루프의 cap 판정을 그대로 재현 */
  const run = (plans: Array<{ actor: CommentActor; role: ReplyTargetRole }>, used = { human: 0, companion: 0 }) => {
    const judged: string[] = []
    for (const p of sortByJudgeOrder(plans, x => x)) {
      const lane = laneOf(p.actor, p.role)
      if (used[lane] >= judgeCapFor(lane)) continue
      used[lane]++
      judged.push(lane)
    }
    return { judged, used }
  }

  it('companion cap 소진 후에도 human PRIMARY는 계속 처리된다', () => {
    const plans: Array<{ actor: CommentActor; role: ReplyTargetRole }> = [
      ...Array.from({ length: 10 }, () => ({ actor: 'BOT' as CommentActor, role: 'COMPANION' as ReplyTargetRole })),
      ...Array.from({ length: 4 }, () => ({ actor: 'REAL_MEMBER' as CommentActor, role: 'PRIMARY' as ReplyTargetRole })),
    ]
    const { used } = run(plans)
    expect(used.companion).toBe(DAILY_COMPANION_JUDGE_CAP) // 6에서 멈춤
    expect(used.human).toBe(4)                              // 사람은 전부 처리 ✅
  })

  it('human cap 소진 후에도 companion은 자기 몫으로 돈다', () => {
    const plans: Array<{ actor: CommentActor; role: ReplyTargetRole }> = [
      ...Array.from({ length: 20 }, () => ({ actor: 'REAL_MEMBER' as CommentActor, role: 'PRIMARY' as ReplyTargetRole })),
      ...Array.from({ length: 3 }, () => ({ actor: 'BOT' as CommentActor, role: 'COMPANION' as ReplyTargetRole })),
    ]
    const { used } = run(plans)
    expect(used.human).toBe(DAILY_HUMAN_JUDGE_CAP) // 12
    expect(used.companion).toBe(3)                  // companion 정상 처리 ✅
  })

  it('이미 소진된 상태로 시작해도 다른 lane은 영향 없음', () => {
    const { used } = run(
      [{ actor: 'REAL_MEMBER', role: 'PRIMARY' }, { actor: 'BOT', role: 'COMPANION' }],
      { human: 0, companion: DAILY_COMPANION_JUDGE_CAP },
    )
    expect(used.human).toBe(1)                              // 사람은 처리 ✅
    expect(used.companion).toBe(DAILY_COMPANION_JUDGE_CAP)  // companion은 그대로
  })

  it('합계 상한은 18 — 무제한이 아니다', () => {
    const plans = Array.from({ length: 100 }, (_, i) => ({
      actor: (i % 2 ? 'REAL_MEMBER' : 'BOT') as CommentActor,
      role: (i % 2 ? 'PRIMARY' : 'COMPANION') as ReplyTargetRole,
    }))
    const { judged } = run(plans)
    expect(judged.length).toBe(DAILY_HUMAN_JUDGE_CAP + DAILY_COMPANION_JUDGE_CAP)
    expect(judged.length).toBe(18)
  })
})

describe('per-user 하루 상한 (AI 티 방지)', () => {
  const gate = (actor: CommentActor, authorId: string | null, repliedToday: Map<string, number>) =>
    !(actor === 'REAL_MEMBER' && authorId && (repliedToday.get(authorId) ?? 0) >= PER_USER_DAILY_REPLY_CAP)

  it('같은 실회원 3번째부터 차단', () => {
    const m = new Map<string, number>()
    expect(gate('REAL_MEMBER', 'u1', m)).toBe(true); m.set('u1', 1)
    expect(gate('REAL_MEMBER', 'u1', m)).toBe(true); m.set('u1', 2)
    expect(gate('REAL_MEMBER', 'u1', m)).toBe(false) // 3번째 ✅
  })

  it('다른 유저는 영향 없음', () => {
    const m = new Map([['u1', 5]])
    expect(gate('REAL_MEMBER', 'u2', m)).toBe(true)
  })

  it('게스트·봇에는 적용하지 않는다', () => {
    const m = new Map([['g1', 9]])
    expect(gate('GUEST', null, m)).toBe(true)
    expect(gate('BOT', 'g1', m)).toBe(true)
  })

  it('driver가 per-user 게이트를 실제로 갖고 있다', () => {
    expect(driverSrc).toContain('PER_USER_DAILY_REPLY_CAP')
    expect(driverSrc).toContain('repliedTodayByUser')
  })
})

describe('PR #302 정책 회귀 없음', () => {
  it('companionQuota 밀도 규칙 불변', () => {
    expect(companionQuota(4)).toBe(0)
    expect(companionQuota(5)).toBe(1)
    expect(companionQuota(7)).toBe(1)
    expect(companionQuota(8)).toBe(2)
  })

  it('사람 댓글이 없으면 companion을 만들지 않는다', () => {
    expect(selectThreadReplyTargets({
      postId: 'p', topLevel: Array.from({ length: 8 }, (_, i) => ({
        id: `b${i}`, actor: 'BOT' as CommentActor, content: '봇 댓글입니다 좋네요',
        hasAuthorReply: false, hasRealUserReply: false,
      })),
    })).toEqual([])
  })

  it('글당 3 초과 금지', () => {
    const targets = selectThreadReplyTargets({
      postId: 'p', topLevel: [
        { id: 'r1', actor: 'REAL_MEMBER', content: '저도 그런 적 있어요 정말 공감돼요', hasAuthorReply: false, hasRealUserReply: false },
        ...Array.from({ length: 9 }, (_, i) => ({
          id: `b${i}`, actor: 'BOT' as CommentActor, content: '저도 그런 적 있어요 정말 공감됩니다',
          hasAuthorReply: false, hasRealUserReply: false,
        })),
      ],
    })
    expect(targets.length).toBeLessThanOrEqual(MAX_AUTHOR_REPLIES_PER_POST)
  })
})

describe('safety gate / registry 전환 불변', () => {
  it('민감 주제 safety skip이 driver에 그대로 있다', () => {
    expect(driverSrc).toContain('findMenopauseAuthorReplySafetySkip')
    expect(driverSrc).toContain('menopauseSafetySkip')
  })

  it('safety SKIP도 lane을 소진한다 (판정 비용은 이미 발생)', () => {
    expect(driverSrc).toMatch(/menopauseSafetySkip\)\s*\{[\s\S]{0,120}used\[lane\]\+\+/)
  })

  it('PR #314 persona-registry 전환 유지 — 호출부 무변경', () => {
    expect(driverSrc).toContain('resolveAuthorPersonaContext')
    expect(driverSrc).not.toContain('persona-data.js')
    expect(driverSrc).not.toContain('curator-shared.js')
  })
})

describe('관측 보강 (additive)', () => {
  it('logData에 lane·capState가 기록된다', () => {
    expect(driverSrc).toContain('lane,')
    expect(driverSrc).toContain('capState:')
  })

  it('기존 logData 키를 지우지 않았다', () => {
    for (const k of ['commentId', 'postId', 'personaId', 'verdict', 'replyDraft', 'writtenCommentId']) {
      expect(driverSrc, k).toContain(k)
    }
  })
})
