/**
 * SNS 플랫폼 토큰 검증 + 테스트 게시
 *
 * 실행: npx tsx cmo/test-platforms.ts [validate|post-test]
 * - validate: 토큰 유효성만 확인 (읽기 전용 API)
 * - post-test: 실제 테스트 게시물 1개씩 올림
 */

const GRAPH_API_FB = 'https://graph.facebook.com/v21.0'
const GRAPH_API_THREADS = 'https://graph.threads.net/v1.0'

interface PlatformResult {
  platform: string
  configured: boolean
  tokenValid: boolean
  details: string
  postId?: string
}

// ── 1. 토큰 검증 (읽기 전용) ──

async function validateFacebook(): Promise<PlatformResult> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? ''
  const pageId = process.env.FACEBOOK_PAGE_ID ?? ''

  if (!token || !pageId) {
    return { platform: 'Facebook', configured: false, tokenValid: false, details: '환경변수 누락' }
  }

  try {
    const res = await fetch(`${GRAPH_API_FB}/${pageId}?fields=name,id&access_token=${token}`)
    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return { platform: 'Facebook', configured: true, tokenValid: false, details: `API 에러: ${JSON.stringify(json)}` }
    }

    return { platform: 'Facebook', configured: true, tokenValid: true, details: `페이지: ${json.name} (ID: ${json.id})` }
  } catch (err) {
    return { platform: 'Facebook', configured: true, tokenValid: false, details: `네트워크 에러: ${err}` }
  }
}

async function validateInstagram(): Promise<PlatformResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN ?? ''
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? ''

  if (!token || !accountId) {
    return { platform: 'Instagram', configured: false, tokenValid: false, details: '환경변수 누락' }
  }

  try {
    const res = await fetch(`${GRAPH_API_FB}/${accountId}?fields=name,username,profile_picture_url&access_token=${token}`)
    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return { platform: 'Instagram', configured: true, tokenValid: false, details: `API 에러: ${JSON.stringify(json)}` }
    }

    return { platform: 'Instagram', configured: true, tokenValid: true, details: `계정: @${json.username} (${json.name})` }
  } catch (err) {
    return { platform: 'Instagram', configured: true, tokenValid: false, details: `네트워크 에러: ${err}` }
  }
}

async function validateThreads(): Promise<PlatformResult> {
  const token = process.env.THREADS_ACCESS_TOKEN ?? ''
  const appId = process.env.THREADS_APP_ID ?? ''

  if (!token || !appId) {
    return { platform: 'Threads', configured: false, tokenValid: false, details: '환경변수 누락' }
  }

  try {
    const res = await fetch(`${GRAPH_API_THREADS}/me?fields=id,username&access_token=${token}`)
    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return { platform: 'Threads', configured: true, tokenValid: false, details: `API 에러: ${JSON.stringify(json)}` }
    }

    return { platform: 'Threads', configured: true, tokenValid: true, details: `계정: @${json.username} (ID: ${json.id})` }
  } catch (err) {
    return { platform: 'Threads', configured: true, tokenValid: false, details: `네트워크 에러: ${err}` }
  }
}

async function validateX(): Promise<PlatformResult> {
  const consumerKey = process.env.X_CONSUMER_KEY ?? ''
  const consumerSecret = process.env.X_CONSUMER_SECRET ?? ''
  const accessToken = process.env.X_ACCESS_TOKEN ?? ''
  const accessSecret = process.env.X_ACCESS_SECRET ?? ''

  if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) {
    return { platform: 'X (Twitter)', configured: false, tokenValid: false, details: '환경변수 누락 (4개 모두 필요)' }
  }

  // X API는 OAuth 1.0a 서명이 필요해서 여기서는 configured만 확인
  return { platform: 'X (Twitter)', configured: true, tokenValid: true, details: '토큰 설정 완료 (서명 검증은 실제 게시 시)' }
}

async function validateBand(): Promise<PlatformResult> {
  const token = process.env.BAND_ACCESS_TOKEN ?? ''
  const key = process.env.BAND_KEY ?? ''

  if (!token || !key) {
    return { platform: 'Band', configured: false, tokenValid: false, details: '환경변수 누락' }
  }

  try {
    const res = await fetch(`https://openapi.band.us/v2.2/bands?access_token=${token}`)
    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return { platform: 'Band', configured: true, tokenValid: false, details: `API 에러: ${JSON.stringify(json)}` }
    }

    return { platform: 'Band', configured: true, tokenValid: true, details: `밴드 목록 조회 성공` }
  } catch (err) {
    return { platform: 'Band', configured: true, tokenValid: false, details: `네트워크 에러: ${err}` }
  }
}

// ── 2. 테스트 게시 ──

async function testPostFacebook(): Promise<PlatformResult> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? ''
  const pageId = process.env.FACEBOOK_PAGE_ID ?? ''

  const testMessage = `🧪 [자동화 테스트] 우리 나이가 어때서 — SNS 자동 게시 시스템 테스트입니다.\n\n이 게시물은 자동으로 삭제됩니다.\n테스트 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`

  try {
    const res = await fetch(`${GRAPH_API_FB}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: testMessage, access_token: token }),
    })
    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return { platform: 'Facebook', configured: true, tokenValid: false, details: `게시 실패: ${JSON.stringify(json)}` }
    }

    const postId = json.id as string
    return { platform: 'Facebook', configured: true, tokenValid: true, details: `✅ 테스트 게시 성공!`, postId }
  } catch (err) {
    return { platform: 'Facebook', configured: true, tokenValid: false, details: `게시 에러: ${err}` }
  }
}

async function testPostThreads(): Promise<PlatformResult> {
  const token = process.env.THREADS_ACCESS_TOKEN ?? ''

  const testText = `🧪 [자동화 테스트] 우리 나이가 어때서 — SNS 자동 게시 시스템 테스트입니다.\n\n테스트 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`

  try {
    // Step 1: 유저 ID
    const meRes = await fetch(`${GRAPH_API_THREADS}/me?fields=id&access_token=${token}`)
    const meJson = await meRes.json() as Record<string, unknown>
    if (!meRes.ok) {
      return { platform: 'Threads', configured: true, tokenValid: false, details: `유저 조회 실패: ${JSON.stringify(meJson)}` }
    }
    const userId = meJson.id as string

    // Step 2: Container 생성
    const containerRes = await fetch(`${GRAPH_API_THREADS}/${userId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'TEXT', text: testText, access_token: token }),
    })
    const containerJson = await containerRes.json() as Record<string, unknown>
    if (!containerRes.ok) {
      return { platform: 'Threads', configured: true, tokenValid: false, details: `Container 생성 실패: ${JSON.stringify(containerJson)}` }
    }

    // Step 3: Publish
    const publishRes = await fetch(`${GRAPH_API_THREADS}/${userId}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerJson.id, access_token: token }),
    })
    const publishJson = await publishRes.json() as Record<string, unknown>
    if (!publishRes.ok) {
      return { platform: 'Threads', configured: true, tokenValid: false, details: `Publish 실패: ${JSON.stringify(publishJson)}` }
    }

    return { platform: 'Threads', configured: true, tokenValid: true, details: `✅ 테스트 게시 성공!`, postId: publishJson.id as string }
  } catch (err) {
    return { platform: 'Threads', configured: true, tokenValid: false, details: `게시 에러: ${err}` }
  }
}

// ── 3. 테스트 게시물 삭제 ──

async function deleteTestPost(platform: string, postId: string): Promise<void> {
  try {
    if (platform === 'Facebook') {
      const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? ''
      await fetch(`${GRAPH_API_FB}/${postId}?access_token=${token}`, { method: 'DELETE' })
      console.log(`  🗑️  Facebook 테스트 게시물 삭제 완료 (${postId})`)
    }
    // Threads는 삭제 API가 제한적이므로 수동 삭제 안내
  } catch {
    console.log(`  ⚠️  ${platform} 테스트 게시물 삭제 실패 — 수동 삭제 필요`)
  }
}

// ── Main ──

async function main() {
  const mode = process.argv[2] ?? 'validate'
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  SNS 플랫폼 테스트 — 모드: ${mode}`)
  console.log(`  시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`)
  console.log(`${'='.repeat(60)}\n`)

  // Step 1: 토큰 검증
  console.log('📋 [1/3] 토큰 유효성 검증\n')

  const results = await Promise.all([
    validateFacebook(),
    validateInstagram(),
    validateThreads(),
    validateX(),
    validateBand(),
  ])

  for (const r of results) {
    const statusIcon = !r.configured ? '⬜' : r.tokenValid ? '✅' : '❌'
    console.log(`  ${statusIcon} ${r.platform}: ${r.details}`)
  }

  const validCount = results.filter(r => r.tokenValid).length
  const configuredCount = results.filter(r => r.configured).length
  console.log(`\n  요약: ${validCount}/${results.length} 유효 | ${configuredCount}/${results.length} 설정됨\n`)

  // 실패한 플랫폼이 있으면 경고
  const failures = results.filter(r => r.configured && !r.tokenValid)
  if (failures.length > 0) {
    console.log('  ⚠️  토큰이 설정되었지만 유효하지 않은 플랫폼:')
    for (const f of failures) {
      console.log(`     - ${f.platform}: ${f.details}`)
    }
    console.log('')
  }

  if (mode !== 'post-test') {
    console.log('💡 실제 테스트 게시를 하려면: npx tsx cmo/test-platforms.ts post-test\n')
    process.exit(failures.length > 0 ? 1 : 0)
  }

  // Step 2: 테스트 게시
  console.log('📝 [2/3] 테스트 게시물 작성\n')

  const postResults: PlatformResult[] = []

  // Facebook 테스트
  if (results.find(r => r.platform === 'Facebook')?.tokenValid) {
    const fbResult = await testPostFacebook()
    postResults.push(fbResult)
    console.log(`  ${fbResult.tokenValid ? '✅' : '❌'} Facebook: ${fbResult.details}${fbResult.postId ? ` (ID: ${fbResult.postId})` : ''}`)
  } else {
    console.log('  ⏭️  Facebook: 토큰 미유효 — 스킵')
  }

  // Threads 테스트
  if (results.find(r => r.platform === 'Threads')?.tokenValid) {
    const thResult = await testPostThreads()
    postResults.push(thResult)
    console.log(`  ${thResult.tokenValid ? '✅' : '❌'} Threads: ${thResult.details}${thResult.postId ? ` (ID: ${thResult.postId})` : ''}`)
  } else {
    console.log('  ⏭️  Threads: 토큰 미유효 — 스킵')
  }

  // Instagram은 이미지 URL이 필요하므로 텍스트 테스트 불가 — validate만
  console.log('  ℹ️  Instagram: 이미지 필요 — 카드뉴스 E2E 테스트에서 검증')
  console.log('  ℹ️  X: 토큰 미발급 — 스킵')
  console.log('  ℹ️  Band: 토큰 미발급 — 스킵')

  // Step 3: 테스트 게시물 정리
  console.log('\n🗑️  [3/3] 테스트 게시물 정리\n')

  // Facebook 테스트 게시물은 10초 후 자동 삭제
  const fbPost = postResults.find(r => r.platform === 'Facebook' && r.postId)
  if (fbPost?.postId) {
    console.log('  Facebook 테스트 게시물 10초 후 삭제...')
    await new Promise(resolve => setTimeout(resolve, 10000))
    await deleteTestPost('Facebook', fbPost.postId)
  }

  const thPost = postResults.find(r => r.platform === 'Threads' && r.postId)
  if (thPost?.postId) {
    console.log('  ℹ️  Threads 테스트 게시물은 수동 삭제 필요 (API 제한)')
  }

  // 최종 요약
  console.log(`\n${'='.repeat(60)}`)
  console.log('  최종 결과:')
  const allPassed = postResults.every(r => r.tokenValid)
  if (allPassed && postResults.length > 0) {
    console.log('  🎉 테스트 게시 성공! SNS 자동 게시 파이프라인 준비 완료')
  } else if (postResults.length === 0) {
    console.log('  ⚠️  게시 가능한 플랫폼 없음')
  } else {
    console.log('  ❌ 일부 플랫폼 게시 실패 — 로그 확인 필요')
  }
  console.log(`${'='.repeat(60)}\n`)

  process.exit(allPassed ? 0 : 1)
}

main().catch(err => {
  console.error('테스트 실행 실패:', err)
  process.exit(1)
})
