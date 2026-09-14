import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 봇 합성 댓글 파동(wave) 제거 회귀 방지선 — R4, 2026-09-09.
 *
 * consumer(wave-processor · user-post-wave-processor)는 PR #438 에서 지웠는데
 * producer(UserPostWaveQueue enqueue · CommentWaveQueue create · SHEET_COMMENT_WAVE_PENDING)가
 * 남아 **실회원이 글을 쓸 때마다 소비자 없는 큐가 계속 쌓이던** 상태였다.
 * 이 테스트는 그 조합이 다시 생기는 것을 막는다.
 *
 * Prisma 모델과 기존 DB 데이터는 의도적으로 보존한다 — 여기서 검사하지 않는다.
 */

const ROOT = join(__dirname, '../..')

/** 검사 대상: 런타임 코드만. 생성물·테스트·문서는 제외한다. */
const RUNTIME_DIRS = ['src', 'agents', 'scripts']
const EXCLUDE_DIR = new Set(['node_modules', '.next', 'generated', '__tests__', 'dist'])

function collectRuntimeFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of entries) {
    if (EXCLUDE_DIR.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectRuntimeFiles(full, acc)
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full)
  }
  return acc
}

const runtimeFiles = RUNTIME_DIRS.flatMap((d) => collectRuntimeFiles(join(ROOT, d)))

/** 파일별 본문을 한 번만 읽어 재사용 (수백 파일 × 여러 검사) */
const sources = runtimeFiles.map((f) => ({ file: f.replace(`${ROOT}/`, ''), src: readFileSync(f, 'utf-8') }))

describe('wave processor·producer 파일이 없다', () => {
  const DELETED_FILES = [
    // consumer (PR #438)
    'agents/cafe/wave-processor.ts',
    'agents/cafe/user-post-wave-processor.ts',
    // producer (PR #439)
    'src/lib/actions/wave-queue.ts',
    'src/app/api/internal/comment-wave/route.ts',
    'src/app/api/internal/user-post-wave/route.ts',
  ] as const

  for (const rel of DELETED_FILES) {
    it(`${rel} 는 존재하지 않는다`, () => {
      expect(existsSync(join(ROOT, rel)), `${rel} 가 되살아났다`).toBe(false)
    })
  }
})

describe('글 작성 경로에 wave enqueue 호출이 없다', () => {
  // 실회원 글쓰기 진입점 — 여기서 enqueue 하면 소비자 없는 큐가 매 글마다 쌓인다.
  const ENTRY_POINTS = ['src/lib/actions/posts.ts', 'src/lib/actions/greeting.ts'] as const

  for (const rel of ENTRY_POINTS) {
    it(`${rel} 에 enqueueUserPostWave 가 없다`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf-8')
      expect(src, `${rel} 에 enqueue 호출이 되살아났다`).not.toContain('enqueueUserPostWave')
    })
  }
})

describe('런타임에서 두 wave 큐를 쓰지 않는다', () => {
  // 모델·기존 데이터는 보존하므로 schema 는 검사 대상이 아니다. 런타임 접근만 막는다.
  const FORBIDDEN = [
    'commentWaveQueue',
    'userPostWaveQueue',
  ] as const

  /**
   * 정리(cleanup) 전용 예외.
   *
   * 이 가드가 막으려는 것은 **소비자 없는 큐를 다시 채우는 것**이다.
   * 두 큐에는 FK 가 없어서(평문 `postId` String) 글을 지워도 CASCADE 가 치워주지
   * 않는다 — 고아가 남는다. 그래서 영구 삭제 도구는 남은 행을 **지우기 위해**
   * 접근한다. 방향이 반대이므로 허용하되, 그 파일이 큐를 **채우지 않는지**
   * 바로 아래에서 따로 확인한다.
   */
  const CLEANUP_ONLY = new Set(['agents/coo/public-content-purge.ts', 'agents/purge/public-content-exec.ts'])
  const ENQUEUE_OPS = ['create', 'createMany', 'upsert', 'update', 'updateMany'] as const

  for (const symbol of FORBIDDEN) {
    it(`prisma.${symbol} 접근이 정리 도구 밖에서 0건이다`, () => {
      const hits = sources
        .filter((s) => s.src.includes(`prisma.${symbol}`))
        .map((s) => s.file)
        .filter((f) => !CLEANUP_ONLY.has(f))
      expect(hits, `런타임에서 ${symbol} 를 다시 쓴다`).toEqual([])
    })

    it(`정리 도구조차 ${symbol} 를 채우지 않는다`, () => {
      const hits = sources
        .filter((s) => CLEANUP_ONLY.has(s.file))
        .filter((s) => ENQUEUE_OPS.some((op) => s.src.includes(`${symbol}.${op}`)))
        .map((s) => s.file)
      expect(hits, `정리 도구가 ${symbol} 에 쓰기를 한다`).toEqual([])
    })
  }

  it('SHEET_COMMENT_WAVE_PENDING 생산이 0건이다', () => {
    const hits = sources.filter((s) => s.src.includes('SHEET_COMMENT_WAVE_PENDING')).map((s) => s.file)
    expect(hits, 'consumer 없는 SHEET_COMMENT_WAVE_PENDING 이 되살아났다').toEqual([])
  })

  it('enqueueCommentWave helper 가 0건이다', () => {
    const hits = sources.filter((s) => s.src.includes('enqueueCommentWave')).map((s) => s.file)
    expect(hits, 'wave 등록 helper 가 되살아났다').toEqual([])
  })
})
