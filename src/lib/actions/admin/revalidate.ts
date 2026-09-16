import { revalidatePath } from 'next/cache'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

// BoardType → 서비스 페이지 경로 (SSoT: board-registry)
const BOARD_PATHS: Record<string, string> = BOARD_URL_PREFIX

/**
 * 🔴 이 파일에 `'use server'` 를 붙이지 마라.
 *    붙이는 순간 export 가 **브라우저에서 호출 가능한 server action 엔드포인트**가 된다.
 *    원래 이 함수는 액션 파일 안의 private 함수였다 — 외부에 열린 적이 없다.
 *    여기서는 액션 파일들이 import 해 쓰는 **평범한 서버 헬퍼**로만 남는다.
 */

/**
 * 게시글 상태가 바뀐 뒤 서비스 페이지 캐시를 무효화한다.
 *
 * 🔴 **순수 함수가 아니다.** 어떤 경로를 어떤 순서로 몇 번 부르느냐가 곧 동작이다.
 *    콘텐츠·회원·신고 세 어드민 액션이 같은 코드를 복사해 쓰고 있었는데,
 *    한 곳만 경로를 늘리면 나머지 두 화면은 **조용히 낡은 캐시를 계속 보여준다.**
 *
 * 호출 순서와 횟수는 기존 세 복사본과 동일하다:
 *   1. 게시판 목록 (boardType 이 알려진 경우에만)
 *   2. 글 상세   (위 + postIdentifier 가 있는 경우에만)
 *   3. `/` · `/best` · `/search` — 항상
 *
 * `src/__tests__/admin-revalidate-and-real-user.test.ts` 가 경로·순서·횟수를 고정한다.
 */
export function revalidateServicePaths(
  boardType?: string | null,
  postIdentifier?: string | null,
): void {
  const boardPath = boardType ? BOARD_PATHS[boardType] : null
  if (boardPath) {
    revalidatePath(boardPath)
    if (postIdentifier) revalidatePath(`${boardPath}/${postIdentifier}`)
  }
  revalidatePath('/')
  revalidatePath('/best')
  revalidatePath('/search')
}
