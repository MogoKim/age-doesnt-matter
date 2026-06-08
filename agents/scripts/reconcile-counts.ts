// DISPATCH ONLY — 야간 크론 활성화는 창업자 승인 대기(매일 DB write). 현재는 수동 dispatch/백필 전용.
// 비정규화 카운트 드리프트 재계산·교정 (P1-1).
// 삭제/신고/숨김 경로에서 카운트 감소가 누락돼 생기는 영구 드리프트를 실제 개수로 교정한다.
//
// 정의(생성 경로의 increment 조건과 일치):
//   User.postCount    = 내 status='PUBLISHED' 글 수      (createPost가 PUBLISHED로 +1)
//   User.commentCount = 내 status='ACTIVE' 댓글 수        (createComment +1)
//   Post.commentCount = 그 글의 status='ACTIVE' 댓글 수
//   Post.likeCount    = Like + GuestLike (postId) — ⚠️ 측정만, 교정 안 함
//       (adminSetPostLikeCount로 어드민이 수동 부스팅하므로 실제 개수로 덮으면 안 됨)
//
// 실행: npx tsx --env-file=.env.local agents/scripts/reconcile-counts.ts [--dry]
//   --dry = 드리프트 규모만 출력(write 없음). 생략 시 실제 교정.
import { prisma, disconnect } from '../core/db.js'

export async function reconcileCounts(dry: boolean): Promise<{
  userPostDrift: number; userCmtDrift: number; postCmtDrift: number; postLikeDrift: number
}> {
  const tag = dry ? '[DRY]' : '[APPLY]'

  // ── User 카운트 (postCount, commentCount) ──
  const [pubPosts, actComments, users] = await Promise.all([
    prisma.post.groupBy({ by: ['authorId'], where: { status: 'PUBLISHED' }, _count: { _all: true } }),
    prisma.comment.groupBy({ by: ['authorId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
    prisma.user.findMany({ select: { id: true, postCount: true, commentCount: true } }),
  ])
  const postMap = new Map<string, number>()
  for (const p of pubPosts) if (p.authorId) postMap.set(p.authorId, p._count._all)
  const cmtMap = new Map<string, number>()
  for (const c of actComments) if (c.authorId) cmtMap.set(c.authorId, c._count._all)

  let userPostDrift = 0, userCmtDrift = 0
  for (const u of users) {
    const realPost = postMap.get(u.id) ?? 0
    const realCmt = cmtMap.get(u.id) ?? 0
    const data: { postCount?: number; commentCount?: number } = {}
    if (u.postCount !== realPost) { data.postCount = realPost; userPostDrift++ }
    if (u.commentCount !== realCmt) { data.commentCount = realCmt; userCmtDrift++ }
    if (Object.keys(data).length > 0 && !dry) await prisma.user.update({ where: { id: u.id }, data })
  }
  console.log(`${tag} User: postCount 드리프트 ${userPostDrift}명, commentCount 드리프트 ${userCmtDrift}명 / 전체 ${users.length}명`)

  // ── Post 카운트 (commentCount 교정 / likeCount 측정만) ──
  const [actCmtByPost, likeByPost, guestByPost, posts] = await Promise.all([
    prisma.comment.groupBy({ by: ['postId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
    prisma.like.groupBy({ by: ['postId'], where: { postId: { not: null } }, _count: { _all: true } }),
    prisma.guestLike.groupBy({ by: ['postId'], where: { postId: { not: null } }, _count: { _all: true } }),
    prisma.post.findMany({ select: { id: true, commentCount: true, likeCount: true } }),
  ])
  const cmtByPost = new Map<string, number>()
  for (const c of actCmtByPost) if (c.postId) cmtByPost.set(c.postId, c._count._all)
  const likeByPostMap = new Map<string, number>()
  for (const l of likeByPost) if (l.postId) likeByPostMap.set(l.postId, l._count._all)
  for (const g of guestByPost) if (g.postId) likeByPostMap.set(g.postId, (likeByPostMap.get(g.postId) ?? 0) + g._count._all)

  let postCmtDrift = 0, postLikeDrift = 0
  for (const p of posts) {
    const realCmt = cmtByPost.get(p.id) ?? 0
    const realLike = likeByPostMap.get(p.id) ?? 0
    if (p.likeCount !== realLike) postLikeDrift++ // 측정만 — 어드민 수동 부스팅 보존 위해 교정 안 함
    if (p.commentCount !== realCmt) {
      postCmtDrift++
      if (!dry) await prisma.post.update({ where: { id: p.id }, data: { commentCount: realCmt } })
    }
  }
  console.log(`${tag} Post: commentCount 드리프트 ${postCmtDrift}건(교정), likeCount 드리프트 ${postLikeDrift}건(측정만·어드민부스팅 보존) / 전체 ${posts.length}건`)

  return { userPostDrift, userCmtDrift, postCmtDrift, postLikeDrift }
}

// 직접 실행 시 (크론은 runner 경유 — import 후 reconcileCounts 호출)
async function main() {
  const dry = process.argv.includes('--dry')
  await reconcileCounts(dry)
  console.log(dry ? '\n→ DRY: 변경 없음. 실제 교정은 --dry 빼고 실행.' : '\n→ 교정 완료.')
  await disconnect()
}

const isDirect = process.argv[1]?.includes('reconcile-counts')
if (isDirect) main().catch((e) => { console.error(String(e)); process.exit(1) })
