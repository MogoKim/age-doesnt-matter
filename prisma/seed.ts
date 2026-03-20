import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // ── BoardConfig ──
  const boardConfigs = [
    {
      boardType: 'STORY' as const,
      displayName: '사는이야기',
      description: '일상을 나누는 공간',
      categories: ['전체', '일상', '건강', '고민', '자녀', '기타'],
    },
    {
      boardType: 'HUMOR' as const,
      displayName: '활력충전소',
      description: '웃음과 힐링이 있는 곳',
      categories: ['전체', '유머', '힐링', '자랑', '추천', '기타'],
    },
    {
      boardType: 'WEEKLY' as const,
      displayName: '수다방',
      description: '가벼운 수다와 토론',
      categories: ['전체'],
    },
    {
      boardType: 'JOB' as const,
      displayName: '내 일 찾기',
      description: '시니어 맞춤 일자리 정보',
      categories: ['전체'],
    },
    {
      boardType: 'MAGAZINE' as const,
      displayName: '매거진',
      description: '건강, 재테크, 생활정보 등 유익한 콘텐츠',
      categories: ['전체', '건강', '재테크', '여행', '생활정보'],
    },
  ]

  for (const config of boardConfigs) {
    await prisma.boardConfig.upsert({
      where: { boardType: config.boardType },
      update: config,
      create: config,
    })
  }
  console.log('✅ BoardConfig seeded')

  // ── Users ──
  const usersData = [
    { providerId: 'seed_001', nickname: '행복한순자', grade: 'REGULAR' as const, postCount: 12, commentCount: 45, receivedLikes: 56 },
    { providerId: 'seed_002', nickname: '영희맘', grade: 'SPROUT' as const, postCount: 3, commentCount: 8, receivedLikes: 5 },
    { providerId: 'seed_003', nickname: '건강하자', grade: 'VETERAN' as const, postCount: 35, commentCount: 120, receivedLikes: 210 },
    { providerId: 'seed_004', nickname: '동네이장님', grade: 'WARM_NEIGHBOR' as const, postCount: 50, commentCount: 200, receivedLikes: 500 },
    { providerId: 'seed_005', nickname: '산책매니아', grade: 'REGULAR' as const, postCount: 8, commentCount: 30, receivedLikes: 22 },
    { providerId: 'seed_006', nickname: '텃밭농부', grade: 'SPROUT' as const, postCount: 2, commentCount: 5, receivedLikes: 3 },
    { providerId: 'seed_007', nickname: '여행좋아', grade: 'REGULAR' as const, postCount: 15, commentCount: 55, receivedLikes: 88 },
  ]

  const users = []
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { providerId: u.providerId },
      update: { nickname: u.nickname, grade: u.grade, postCount: u.postCount, commentCount: u.commentCount, receivedLikes: u.receivedLikes },
      create: u,
    })
    users.push(user)
  }
  console.log(`✅ ${users.length} users seeded`)

  // ── 사는이야기 Posts ──
  const storyPosts = [
    { title: '오늘 손주 돌잔치에 다녀왔어요 ㅎㅎ', category: '일상', summary: '기다리고 기다리던 손주 돌잔치! 표정이 얼마나 귀여운지 사진 공유해요.', content: '<p>기다리고 기다리던 손주 돌잔치에 다녀왔어요!</p><p>표정이 얼마나 귀여운지... 할머니 마음이 다 녹았답니다. 돌잔치에서 연필을 잡았는데, 이 아이가 공부를 좋아하게 될까요? ㅎㅎ</p><p>다들 건강하게 자라주기만 하면 그게 최고지요. 오늘 정말 행복한 하루였어요.</p>', authorIdx: 0, likeCount: 24, commentCount: 8, viewCount: 156, promotionLevel: 'HOT' as const },
    { title: '무릎 관절에 좋은 운동 추천해요', category: '건강', summary: '정형외과 선생님이 알려주신 무릎 관절에 좋은 운동 3가지 공유합니다.', content: '<p>정형외과 선생님이 알려주신 무릎 관절에 좋은 운동 3가지를 공유합니다.</p><p>1. 의자에 앉아서 다리 들기<br>2. 벽에 기대고 반 스쿼트<br>3. 수건 누르기 운동</p><p>저도 한 달 넘게 하고 있는데, 확실히 좋아졌어요. 무릎 아프신 분들 참고하세요!</p>', authorIdx: 2, likeCount: 18, commentCount: 12, viewCount: 230, promotionLevel: 'NORMAL' as const },
    { title: '퇴직 후 처음으로 요리를 해봤어요', category: '일상', summary: '40년간 회사만 다니다가 처음 부엌에 섰어요.', content: '<p>40년간 회사만 다니다가 퇴직하고 처음으로 부엌에 섰습니다.</p><p>아내가 감기에 걸려서 어쩔 수 없이 시작했는데... 생각보다 재미있더라고요!</p><p>계란말이가 좀 찢어졌지만 아내가 맛있다고 해줘서 기분 좋았습니다. ㅎㅎ</p>', authorIdx: 4, likeCount: 45, commentCount: 23, viewCount: 320, promotionLevel: 'HOT' as const },
    { title: '자녀에게 용돈 얼마까지 주시나요?', category: '자녀', summary: '성인 자녀 용돈 기준이 궁금합니다.', content: '<p>30대 직장인 아들이 있는데, 명절마다 용돈을 주고 있거든요.</p><p>주변에 물어봐도 다들 다르게 말해서... 여기 계신 분들은 어떠신지 궁금합니다.</p>', authorIdx: 1, likeCount: 15, commentCount: 19, viewCount: 180, promotionLevel: 'NORMAL' as const },
    { title: '오늘 등산 갔다가 야생 고라니를 봤어요!', category: '일상', summary: '관악산에서 고라니를 만났어요.', content: '<p>오늘 관악산 등산 갔다가 고라니를 만났어요!</p><p>처음엔 깜짝 놀랐는데, 고라니도 저를 보고 한참 쳐다보다가 유유히 가더라고요.</p><p>핸드폰 사진이 좀 흐릿하지만 공유합니다. 자연 속에 이런 친구가 있다니 신기하죠?</p>', authorIdx: 4, likeCount: 32, commentCount: 6, viewCount: 145, promotionLevel: 'NORMAL' as const },
    { title: '60대 마라톤 완주한 썰', category: '건강', summary: '60세에 첫 풀코스 마라톤을 완주했습니다!', content: '<p>올해 환갑에 첫 풀코스 마라톤을 완주했습니다!</p><p>3년 전 건강검진에서 당뇨 전단계 판정 받고 운동을 시작했는데, 마라톤까지 뛰게 될 줄은 몰랐어요.</p><p>5시간 42분... 느리지만 완주한 게 자랑스럽습니다. 나이는 정말 숫자일 뿐이에요!</p>', authorIdx: 2, likeCount: 89, commentCount: 34, viewCount: 567, promotionLevel: 'HALL_OF_FAME' as const },
    { title: '손주가 처음 "할머니" 불렀어요', category: '일상', summary: '손주의 첫 "할머니" 한마디에 가슴이 뭉클.', content: '<p>손주가 어제 처음으로 "할머니"라고 불렀어요.</p><p>그 한마디에 가슴이 뭉클해서 눈물이 날 것 같았습니다.</p><p>기다리고 기다리던 그 한마디... 세상에서 가장 행복한 순간이었어요.</p>', authorIdx: 0, likeCount: 67, commentCount: 15, viewCount: 342, promotionLevel: 'HALL_OF_FAME' as const },
    { title: '퇴직 후 텃밭 가꾸기 시작했어요', category: '기타', summary: '베란다 텃밭으로 시작했는데 재미에 빠졌습니다.', content: '<p>퇴직하고 할 게 없어서 베란다 텃밭을 시작했는데, 이게 이렇게 재미있을 줄이야!</p><p>상추, 고추, 방울토마토를 심었는데 하루하루 자라는 걸 보면 뿌듯해요.</p><p>오늘 첫 수확한 상추로 쌈밥 해먹었습니다. 맛이 기가 막히네요!</p>', authorIdx: 5, likeCount: 22, commentCount: 11, viewCount: 198, promotionLevel: 'NORMAL' as const },
  ]

  // ── 활력충전소 Posts ──
  const humorPosts = [
    { title: '아들이 보낸 카톡 ㅋㅋㅋ 현웃 터졌어요', category: '유머', summary: '아들이 실수로 여친한테 보낼 카톡을 저한테...', content: '<p>아들이 여자친구한테 보낼 카톡을 저한테 보냈어요 ㅋㅋㅋ</p><p>"자기야 오늘 뭐 먹을까~"</p><p>그래서 답했죠. "된장찌개 끓여놨다. 빨리 와라."</p><p>아들 반응이 정말 ㅋㅋㅋ 한참을 웃었네요.</p>', authorIdx: 3, likeCount: 56, commentCount: 28, viewCount: 430, promotionLevel: 'HOT' as const },
    { title: '60살에 운전면허 따는 중인데 요즘 세상 좋아졌어요', category: '유머', summary: '60살에 처음 운전면허에 도전 중입니다.', content: '<p>60살에 처음으로 운전면허에 도전하고 있어요.</p><p>자동차 학원 선생님이 손주뻘인데, 참 친절하게 가르쳐줘요.</p><p>어제 기능시험에서 떨어졌지만... 다시 도전합니다! 포기는 없어요!</p>', authorIdx: 6, likeCount: 52, commentCount: 31, viewCount: 380, promotionLevel: 'HOT' as const },
    { title: '요즘 웃긴 동영상 하나 공유할게요', category: '힐링', summary: '강아지가 거울 보고 짖는 영상인데 너무 웃겨요.', content: '<p>강아지가 거울에 비친 자기 모습 보고 짖는 영상을 봤는데 너무 웃겨서 공유해요.</p><p>우리 집 강아지도 처음에 그랬는데... 동물들이 참 귀엽죠.</p>', authorIdx: 3, likeCount: 33, commentCount: 14, viewCount: 220, promotionLevel: 'NORMAL' as const },
    { title: '병원에서 생긴 웃긴 일 ㅋㅋ', category: '유머', summary: '건강검진 받다가 생긴 에피소드.', content: '<p>건강검진 받으러 갔는데 의사 선생님이 "어디 불편하신 데 없으세요?" 하길래</p><p>"머리카락이 자꾸 빠져요" 했더니</p><p>"아... 그건 치료가 안 됩니다" ㅋㅋㅋ</p><p>순간 진료실이 웃음바다가 됐어요.</p>', authorIdx: 4, likeCount: 41, commentCount: 18, viewCount: 290, promotionLevel: 'NORMAL' as const },
  ]

  // ── 수다방 Posts ──
  const weeklyPosts = [
    { title: '요즘 젊은 사람들 예의 어떻게 생각하세요?', category: null, summary: '세대 차이에 대한 솔직한 생각을 나눠봐요.', content: '<p>버스에서 있었던 일인데요...</p><p>자리 양보 얘기가 아니라, 요즘 젊은 사람들이 더 예의바르다고 느낄 때가 많아요.</p><p>여러분은 어떻게 생각하세요?</p>', authorIdx: 3, likeCount: 28, commentCount: 42, viewCount: 510, promotionLevel: 'HOT' as const },
    { title: '은퇴 후 부부 여행 다녀온 후기 (제주도 3박4일)', category: null, summary: '제주도 여행 후기를 나눕니다.', content: '<p>은퇴 후 아내와 처음으로 제주도 여행을 다녀왔어요.</p><p>3박 4일 코스인데, 정말 좋았습니다. 올레길도 걷고, 맛집도 다니고...</p><p>특히 성산일출봉에서 본 일출은 평생 잊지 못할 것 같아요.</p>', authorIdx: 6, likeCount: 41, commentCount: 15, viewCount: 280, promotionLevel: 'NORMAL' as const },
  ]

  // ── 매거진 Posts ──
  const magazinePosts = [
    { title: '60대 건강검진, 꼭 챙겨야 할 5가지', category: '건강', summary: '60대에 특히 중요한 건강검진 항목을 정리했습니다.', content: '<p>60대가 되면 특히 신경 써야 할 건강검진 항목이 있습니다.</p><p>1. 대장내시경</p><p>2. 심장 초음파</p><p>3. 골밀도 검사</p><p>4. 갑상선 기능 검사</p><p>5. 치매 선별 검사</p>', authorIdx: 2, likeCount: 35, commentCount: 8, viewCount: 420, promotionLevel: 'NORMAL' as const },
    { title: '퇴직연금 수령 시 세금 줄이는 방법', category: '재테크', summary: '퇴직연금 세금 절약 노하우를 알려드립니다.', content: '<p>퇴직연금을 수령할 때 세금을 줄이는 방법이 있습니다.</p><p>연금 수령 시 연금소득세(3.3~5.5%)가 적용되는데, 일시금보다 유리합니다.</p>', authorIdx: 3, likeCount: 29, commentCount: 12, viewCount: 350, promotionLevel: 'NORMAL' as const },
    { title: '봄맞이 근교 나들이 추천 코스 7선', category: '여행', summary: '수도권에서 당일치기로 다녀올 수 있는 봄 나들이 코스.', content: '<p>봄이 오면 가볍게 다녀올 수 있는 근교 나들이 코스를 소개합니다.</p><p>1. 양평 세미원</p><p>2. 남양주 물의정원</p><p>3. 가평 자라섬</p>', authorIdx: 6, likeCount: 22, commentCount: 5, viewCount: 190, promotionLevel: 'NORMAL' as const },
    { title: '스마트폰 사기 피하는 법, 어르신 필독', category: '생활정보', summary: '문자/전화 사기 유형과 예방법을 정리했습니다.', content: '<p>최근 시니어를 대상으로 한 스마트폰 사기가 늘고 있습니다.</p><p>주요 유형: 택배 사칭, 건강보험공단 사칭, 자녀 사칭 등</p><p>의심되면 반드시 112 또는 1332로 확인하세요!</p>', authorIdx: 3, likeCount: 18, commentCount: 3, viewCount: 150, promotionLevel: 'NORMAL' as const },
  ]

  // ── 일자리 Posts ──
  const jobPosts = [
    { title: '도서관 사서 보조', summary: '초보 환영, 오전만 근무', content: '<p>도서관에서 사서 보조를 모집합니다. 나이 무관, 오전만 근무.</p>', authorIdx: 3, likeCount: 5, commentCount: 2, viewCount: 120, jobDetail: { company: '강남구립도서관', salary: '월 200만', location: '강남구', region: '서울', quickTags: ['나이무관', '오전만'] } },
    { title: '아파트 경비원', summary: '주 5일, 교대 근무', content: '<p>서초구 아파트 경비원을 모집합니다. 60대 환영합니다.</p>', authorIdx: 3, likeCount: 8, commentCount: 3, viewCount: 180, jobDetail: { company: '서초 래미안', salary: '월 220만', location: '서초구', region: '서울', quickTags: ['60대 환영'] }, promotionLevel: 'HOT' as const },
    { title: '카페 주방 보조', summary: '주 3일 가능', content: '<p>마포구 카페에서 주방 보조를 모집합니다. 초보 환영, 단기도 가능.</p>', authorIdx: 3, likeCount: 3, commentCount: 1, viewCount: 90, jobDetail: { company: '마포 카페', salary: '시급 1.2만', location: '마포구', region: '서울', quickTags: ['초보환영', '단기가능'] } },
    { title: '학교 급식 보조', summary: '방학 중 휴무', content: '<p>송파구 초등학교 급식 보조를 모집합니다.</p>', authorIdx: 3, likeCount: 4, commentCount: 2, viewCount: 95, jobDetail: { company: '송파초등학교', salary: '월 180만', location: '송파구', region: '서울', quickTags: ['나이무관'] } },
    { title: '주차장 관리원', summary: '주간 근무만', content: '<p>강동구 주차장 관리원을 모집합니다. 야간 없음.</p>', authorIdx: 3, likeCount: 6, commentCount: 1, viewCount: 110, jobDetail: { company: '강동구 공영주차장', salary: '월 210만', location: '강동구', region: '서울', quickTags: ['60대 환영', '야간없음'] } },
  ]

  // 기존 seed 데이터 삭제 (댓글 → 게시글 → 순서)
  await prisma.comment.deleteMany({ where: { post: { author: { providerId: { startsWith: 'seed_' } } } } })
  await prisma.jobDetail.deleteMany({ where: { post: { author: { providerId: { startsWith: 'seed_' } } } } })
  await prisma.post.deleteMany({ where: { author: { providerId: { startsWith: 'seed_' } } } })
  console.log('🗑️ Old seed posts cleaned')

  // Post 생성 함수
  async function createPost(
    data: { title: string; category?: string | null; summary: string; content: string; authorIdx: number; likeCount: number; commentCount: number; viewCount: number; promotionLevel?: 'NORMAL' | 'HOT' | 'HALL_OF_FAME'; jobDetail?: { company: string; salary: string; location: string; region: string; quickTags: string[] } },
    boardType: 'STORY' | 'HUMOR' | 'WEEKLY' | 'JOB' | 'MAGAZINE',
    daysAgo: number,
  ) {
    const publishedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    const post = await prisma.post.create({
      data: {
        boardType,
        category: data.category ?? undefined,
        title: data.title,
        content: data.content,
        summary: data.summary,
        authorId: users[data.authorIdx].id,
        status: 'PUBLISHED',
        promotionLevel: data.promotionLevel ?? 'NORMAL',
        likeCount: data.likeCount,
        commentCount: data.commentCount,
        viewCount: data.viewCount,
        publishedAt,
        createdAt: publishedAt,
      },
    })

    if (data.jobDetail) {
      await prisma.jobDetail.create({
        data: {
          postId: post.id,
          company: data.jobDetail.company,
          salary: data.jobDetail.salary,
          location: data.jobDetail.location,
          region: data.jobDetail.region,
          quickTags: data.jobDetail.quickTags,
        },
      })
    }

    return post
  }

  // 사는이야기
  const createdStoryPosts = []
  for (let i = 0; i < storyPosts.length; i++) {
    const post = await createPost(storyPosts[i], 'STORY', i * 0.5 + 0.1)
    createdStoryPosts.push(post)
  }
  console.log(`✅ ${createdStoryPosts.length} story posts seeded`)

  // 활력충전소
  for (let i = 0; i < humorPosts.length; i++) {
    await createPost(humorPosts[i], 'HUMOR', i * 0.7 + 0.2)
  }
  console.log(`✅ ${humorPosts.length} humor posts seeded`)

  // 수다방
  for (let i = 0; i < weeklyPosts.length; i++) {
    await createPost(weeklyPosts[i], 'WEEKLY', i * 1.2 + 0.3)
  }
  console.log(`✅ ${weeklyPosts.length} weekly posts seeded`)

  // 매거진
  for (let i = 0; i < magazinePosts.length; i++) {
    await createPost(magazinePosts[i], 'MAGAZINE', i * 2 + 1)
  }
  console.log(`✅ ${magazinePosts.length} magazine posts seeded`)

  // 일자리
  for (let i = 0; i < jobPosts.length; i++) {
    await createPost(jobPosts[i], 'JOB', i * 1.5 + 0.5)
  }
  console.log(`✅ ${jobPosts.length} job posts seeded`)

  // ── 댓글 (첫 번째 사는이야기 게시글에) ──
  const firstPost = createdStoryPosts[0]
  if (firstPost) {
    const c1 = await prisma.comment.create({
      data: { postId: firstPost.id, authorId: users[1].id, content: '와~ 손주가 너무 귀여웠겠어요! 사진 더 올려주세요 ㅎㅎ', likeCount: 5 },
    })
    await prisma.comment.create({
      data: { postId: firstPost.id, authorId: users[0].id, content: '감사합니다~ 다음에 더 올릴게요!', parentId: c1.id, likeCount: 2 },
    })

    const c2 = await prisma.comment.create({
      data: { postId: firstPost.id, authorId: users[2].id, content: '손주 돌잔치가 가장 행복한 날이죠. 축하드려요!', likeCount: 8 },
    })
    await prisma.comment.create({
      data: { postId: firstPost.id, authorId: users[4].id, content: '맞아요~ 저도 손주 돌잔치가 제일 기억에 남아요', parentId: c2.id, likeCount: 3 },
    })

    await prisma.comment.create({
      data: { postId: firstPost.id, authorId: users[3].id, content: '돌잡이에서 뭘 잡았나요? 궁금해요!', likeCount: 4 },
    })

    // 삭제된 댓글 (replies는 유지)
    const deleted = await prisma.comment.create({
      data: { postId: firstPost.id, authorId: users[5].id, content: '(삭제됨)', status: 'DELETED', likeCount: 0 },
    })
    await prisma.comment.create({
      data: { postId: firstPost.id, authorId: users[6].id, content: '위 댓글이 삭제됐지만, 손주 사진 정말 보고 싶네요!', parentId: deleted.id, likeCount: 1 },
    })

    console.log('✅ Comments seeded for first post')
  }

  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
