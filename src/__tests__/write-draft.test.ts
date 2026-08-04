import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { draftKey, readDraft, saveDraft, removeDraft, findLatestDraft } from '@/lib/write-draft'

/**
 * 비회원이 글을 먼저 쓰고 로그인하러 나갔다 돌아오는 사이, 이 값이 글을 붙들고 있다.
 * 여기가 깨지면 사용자가 쓴 글이 그냥 사라진다 — 이 기능에서 가장 무거운 실패다.
 */

const root = join(__dirname, '../..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

const BOARDS = ['menopause', 'stories', 'life2', 'humor']
const draft = (board: string, title = '제목', content = '본문내용입니다') => ({
  board, category: '건강', title, content,
})

beforeEach(() => localStorage.clear())

describe('키 형식 — 기존 임시저장을 잃지 않는다', () => {
  it('예전부터 쓰던 형식 그대로다', () => {
    expect(draftKey('stories')).toBe('unae_post_draft_stories')
  })

  it('게시판마다 다른 칸을 쓴다 — 서로 덮어쓰지 않는다', () => {
    saveDraft(draft('stories', '사는이야기 글'), 1000)
    saveDraft(draft('humor', '웃음방 글'), 2000)
    expect(readDraft('stories')?.title).toBe('사는이야기 글')
    expect(readDraft('humor')?.title).toBe('웃음방 글')
  })

  it('이 코드가 생기기 전에 저장된 값(savedAt 없음)도 읽는다', () => {
    localStorage.setItem(
      'unae_post_draft_life2',
      JSON.stringify({ board: 'life2', category: '보험', title: '옛 글', content: '옛 본문' }),
    )
    const d = readDraft('life2')
    expect(d?.title).toBe('옛 글')
    expect(d?.category).toBe('보험')
    expect(d?.savedAt).toBeUndefined()
  })
})

describe('저장·복원', () => {
  it('board/category/title/content를 모두 담는다', () => {
    saveDraft(draft('menopause'), 1234)
    const d = readDraft('menopause')
    expect(d).toEqual({
      board: 'menopause', category: '건강', title: '제목', content: '본문내용입니다', savedAt: 1234,
    })
  })

  it('빈 글은 저장하지 않는다 — 빈 값이 진짜 글을 덮어쓰면 안 된다', () => {
    saveDraft(draft('stories'), 1000)
    expect(saveDraft({ board: 'stories', category: '', title: '', content: '' }, 2000)).toBe(false)
    expect(readDraft('stories')?.title).toBe('제목')
  })

  it('게시판이 비면 저장하지 않는다', () => {
    expect(saveDraft({ board: '', category: '', title: 'x', content: 'y' }, 1)).toBe(false)
  })

  it('삭제하면 사라진다', () => {
    saveDraft(draft('humor'), 1000)
    removeDraft('humor')
    expect(readDraft('humor')).toBeNull()
  })

  it('없는 게시판·빈 slug는 null', () => {
    expect(readDraft('stories')).toBeNull()
    expect(readDraft('')).toBeNull()
  })
})

describe('브라우저가 막아도 화면이 죽지 않는다', () => {
  /**
   * localStorage 접근이 통째로 막힌 브라우저(사파리 시크릿·저장공간 초과)를 흉내 낸다.
   *
   * Storage.prototype이나 인스턴스 메서드에 모킹을 걸어봤지만 happy-dom에서는 먹지 않아
   * (조용히 통과해 검증이 헛돌았다) localStorage 객체 자체를 바꿔치운다.
   */
  function withBrokenStorage(method: 'setItem' | 'getItem' | 'removeItem', run: () => void) {
    const original = window.localStorage
    const broken = {
      ...original,
      getItem: original.getItem.bind(original),
      setItem: original.setItem.bind(original),
      removeItem: original.removeItem.bind(original),
      clear: original.clear.bind(original),
      key: original.key.bind(original),
      length: original.length,
      [method]: () => { throw new Error('SecurityError') },
    } as unknown as Storage
    Object.defineProperty(window, 'localStorage', { value: broken, configurable: true })
    try {
      run()
    } finally {
      Object.defineProperty(window, 'localStorage', { value: original, configurable: true })
    }
  }

  it('저장이 막히면 false를 돌려준다 (사파리 시크릿 등)', () => {
    withBrokenStorage('setItem', () => {
      expect(saveDraft(draft('stories'), 1000)).toBe(false)
    })
  })

  it('읽기가 막히면 null — 예외를 밖으로 던지지 않는다', () => {
    saveDraft(draft('stories'), 1000)
    withBrokenStorage('getItem', () => {
      expect(() => readDraft('stories')).not.toThrow()
      expect(readDraft('stories')).toBeNull()
    })
  })

  it('삭제가 막혀도 예외를 던지지 않는다', () => {
    withBrokenStorage('removeItem', () => {
      expect(() => removeDraft('stories')).not.toThrow()
    })
  })

  it('막혔던 저장소가 돌아오면 정상 동작한다 — 위 테스트가 뒤를 오염시키지 않는지 확인', () => {
    saveDraft(draft('humor', '정상 저장'), 9000)
    expect(readDraft('humor')?.title).toBe('정상 저장')
  })

  it('값이 깨져 있어도 null', () => {
    localStorage.setItem('unae_post_draft_stories', '{깨진 JSON')
    expect(readDraft('stories')).toBeNull()
  })
})

describe('findLatestDraft — board 쿼리를 잃었을 때의 안전망', () => {
  it('가장 최근에 저장한 것을 고른다', () => {
    saveDraft(draft('stories', '오래된'), 1000)
    saveDraft(draft('menopause', '최근'), 5000)
    saveDraft(draft('life2', '중간'), 3000)
    expect(findLatestDraft(BOARDS)?.title).toBe('최근')
  })

  it('savedAt 없는 옛 값보다 있는 쪽을 우선한다', () => {
    localStorage.setItem(
      'unae_post_draft_humor',
      JSON.stringify({ board: 'humor', title: '옛 글', content: '본문' }),
    )
    saveDraft(draft('stories', '새 글'), 100)
    expect(findLatestDraft(BOARDS)?.title).toBe('새 글')
  })

  it('하나도 없으면 null', () => {
    expect(findLatestDraft(BOARDS)).toBeNull()
  })

  it('빈 껍데기만 있으면 null — 안내를 띄우지 않는다', () => {
    localStorage.setItem(
      'unae_post_draft_stories',
      JSON.stringify({ board: 'stories', category: '', title: '', content: '' }),
    )
    expect(findLatestDraft(BOARDS)).toBeNull()
  })

  it('board 값을 그대로 돌려준다 — 어느 게시판 글인지 알려줄 수 있어야 한다', () => {
    saveDraft(draft('menopause', '갱년기 글'), 1000)
    expect(findLatestDraft(BOARDS)?.board).toBe('menopause')
  })
})

describe('저장 게이트는 서버에 그대로 있다 — 소스 고정', () => {
  it('createPost가 첫머리에서 세션을 확인한다', () => {
    const src = read('src/lib/actions/posts.ts')
    const body = src.slice(src.indexOf('export async function createPost'))
    expect(body.slice(0, 260)).toMatch(/const session = await auth\(\)/)
    expect(body.slice(0, 260)).toMatch(/로그인이 필요합니다/)
  })

  it('글 수정은 여전히 로그인 + 작성자 확인을 한다', () => {
    const src = read('src/app/(main)/community/[boardSlug]/[postId]/edit/page.tsx')
    expect(src).toMatch(/from '@\/lib\/auth'/)
    expect(src).toMatch(/if \(!session\?\.user\?\.id\) redirect\('\/login'\)/)
    expect(src).toMatch(/post\.authorId !== session\.user\.id/)
  })

  it('글쓰기 폼은 비회원이 등록을 누르면 createPost를 부르지 않는다', () => {
    const src = read('src/components/features/community/PostWriteForm.tsx')
    // 비회원 분기가 startTransition(=저장 실행)보다 앞에 있어야 한다
    const guard = src.indexOf('!isEditMode && !isLoggedIn')
    const submit = src.indexOf('await createPost(formData)')
    expect(guard).toBeGreaterThan(-1)
    expect(submit).toBeGreaterThan(guard)
  })
})
