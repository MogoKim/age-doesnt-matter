import { describe, it, expect } from 'vitest'
import {
  WRITE_BOARDS,
  WRITE_BOARD_SLUGS,
  WRITE_CHIP_LIMIT,
  pickWriteChips,
} from '@/lib/write-boards'

/**
 * 게시판 선택 화면이 기대는 두 가지를 고정한다.
 *
 *  1. 글을 쓸 수 있는 곳만 보여준다 — 베스트·매거진·내일찾기는 글 쓰는 곳이 아니다
 *  2. 칩 문구는 DB에서 오되, 글쓰기 유도에 안 맞는 이름은 빠진다
 *
 * 특히 2번: DB 카테고리를 앞에서 그냥 3개 자르면 사는이야기가
 * "가입인사 · 건강 · 가족"이 된다. 글을 쓰러 온 사람에게 보여줄 첫 줄이 아니다.
 */

describe('WRITE_BOARDS — 글쓰기 가능한 게시판', () => {
  it('4개이고 홈 메뉴와 같은 순서다', () => {
    expect(WRITE_BOARD_SLUGS).toEqual(['menopause', 'stories', 'life2', 'humor'])
  })

  it('글을 쓸 수 없는 곳은 없다', () => {
    for (const notWritable of ['best', 'magazine', 'jobs', 'weekly']) {
      expect(WRITE_BOARD_SLUGS, notWritable).not.toContain(notWritable)
    }
  })

  it('표시명이 홈 메뉴 표기와 같다', () => {
    const names = Object.fromEntries(WRITE_BOARDS.map((b) => [b.slug, b.displayName]))
    expect(names).toEqual({
      menopause: '갱년기톡',
      stories: '사는이야기',
      life2: '2막준비',
      humor: '웃음방',
    })
  })

  it('색은 CSS 변수 이름만 들고 있다 — 새 hex를 만들지 않는다', () => {
    for (const b of WRITE_BOARDS) {
      expect(b.bgVar, b.slug).toMatch(/^--icon-[a-z0-9]+-bg$/)
      expect(b.strokeVar, b.slug).toMatch(/^--icon-[a-z0-9]+-stroke$/)
    }
  })

  it('아이콘이 모두 연결돼 있다', () => {
    for (const b of WRITE_BOARDS) expect(typeof b.Icon, b.slug).toBe('function')
  })
})

describe('pickWriteChips — 대표 칩 선정', () => {
  it('최대 3개까지만 — 4개면 375px·글씨 크게에서 두 줄로 넘어간다', () => {
    expect(pickWriteChips(['a', 'b', 'c', 'd', 'e'])).toHaveLength(WRITE_CHIP_LIMIT)
    expect(WRITE_CHIP_LIMIT).toBe(3)
  })

  it("'전체'는 뺀다 — 카테고리가 아니라 목록 필터다", () => {
    expect(pickWriteChips(['전체', '건강', '여행'])).toEqual(['건강', '여행'])
  })

  it("'가입인사'는 뺀다 — 글쓰기 유도 첫 줄로 부적절", () => {
    // 실제 STORY 카테고리
    expect(pickWriteChips(['가입인사', '건강', '가족', '취미', '고민', '자유수다']))
      .toEqual(['건강', '가족', '취미'])
  })

  it("'기타'는 뺀다 — 아무것도 설명하지 못한다", () => {
    // 실제 HUMOR 카테고리
    expect(pickWriteChips(['유머·웃음', '엔터·TV', '추천·리뷰', '기타']))
      .toEqual(['유머·웃음', '엔터·TV', '추천·리뷰'])
  })

  it('실제 운영 카테고리로 뽑은 결과', () => {
    expect(pickWriteChips(['나만 이런가요', '몸의 변화', '완경·호르몬', '마음의 변화', '가족·관계']))
      .toEqual(['나만 이런가요', '몸의 변화', '완경·호르몬'])
    expect(pickWriteChips(['은퇴준비', '재테크·연금', '보험', '주거·이사']))
      .toEqual(['은퇴준비', '재테크·연금', '보험'])
  })

  it('카테고리가 없거나 전부 제외 대상이면 빈 배열 — 화면은 칩 없이 그린다', () => {
    expect(pickWriteChips([])).toEqual([])
    expect(pickWriteChips(['전체'])).toEqual([])
  })

  it('원본 배열을 건드리지 않는다', () => {
    const src = ['전체', '건강', '가족', '취미', '고민']
    pickWriteChips(src)
    expect(src).toEqual(['전체', '건강', '가족', '취미', '고민'])
  })
})
