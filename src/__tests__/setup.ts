import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// React의 server-only `cache()` 함수는 테스트 환경(happy-dom)에서 미지원
// → identity function으로 대체
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: (fn: unknown) => fn }
})
