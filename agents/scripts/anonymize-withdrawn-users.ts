// DISPATCH ONLY — 탈퇴 회원 익명화 (P2-①). 크론은 dry만, 실제는 --apply 수동.
// ⚠️ 불가역. 기본 dry. 30일 경과 WITHDRAWN 회원의 PII를 비우고 닉네임/providerId를 익명화한다.
// 글·댓글은 authorId 보존(스레드 안 깨짐), 표시는 toUserSummary가 status=WITHDRAWN이면 '탈퇴한 회원' 마스킹.
//
// 익명화: email·profileImage·birthYear·gender·phone → null, regions → [], isGenderPublic/isRegionPublic → false,
//        nickname → '탈퇴회원_{id8}'(유니크), providerId → 'withdrawn_{원본}'(같은 카카오 재가입 시 새 계정).
// 보존: status·withdrawnAt·postCount/commentCount/receivedLikes·authorId·interests·role·grade.
//
// 실행: npx tsx --env-file=.env.local agents/scripts/anonymize-withdrawn-users.ts          (dry)
//       npx tsx --env-file=.env.local agents/scripts/anonymize-withdrawn-users.ts --apply  (실제)
import { prisma, disconnect } from '../core/db.js'

const DAY = 86400000

export async function anonymizeWithdrawn(dry: boolean): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * DAY)
  // 30일 경과 WITHDRAWN + 아직 익명화 안 된 것(providerId 미마스킹)
  const targets = await prisma.user.findMany({
    where: {
      status: 'WITHDRAWN',
      withdrawnAt: { lt: cutoff },
      NOT: { providerId: { startsWith: 'withdrawn_' } },
    },
    select: { id: true, providerId: true },
  })
  console.log(`${dry ? '[DRY]' : '[APPLY]'} 익명화 대상(30일+ 탈퇴, 미익명화): ${targets.length}명`)
  if (dry || targets.length === 0) return targets.length

  let done = 0
  for (const u of targets) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        nickname: `탈퇴회원_${u.id.slice(0, 8)}`, // @unique — id 기반이라 충돌 없음
        providerId: `withdrawn_${u.providerId}`, // 재가입 시 새 계정(원 providerId 못 찾음)
        email: null,
        profileImage: null,
        birthYear: null,
        gender: null,
        phone: null,
        regions: [],
        isGenderPublic: false,
        isRegionPublic: false,
      },
    })
    done++
  }
  console.log(`[APPLY] ${done}명 익명화 완료`)
  return done
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? '[APPLY 모드] 실제 익명화' : '[DRY 모드] 미변경 — 실제는 --apply')
  await anonymizeWithdrawn(!apply)
  await disconnect()
}

const isDirect = process.argv[1]?.includes('anonymize-withdrawn')
if (isDirect) main().catch((e) => { console.error(String(e)); process.exit(1) })
