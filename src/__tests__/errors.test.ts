import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  RateLimitError,
} from '@/lib/errors'

describe('에러 클래스', () => {
  describe('AppError', () => {
    it('기본 상태코드 500, 코드 INTERNAL_ERROR', () => {
      const err = new AppError('서버 오류')
      expect(err.statusCode).toBe(500)
      expect(err.code).toBe('INTERNAL_ERROR')
      expect(err.message).toBe('서버 오류')
      expect(err.name).toBe('AppError')
    })

    it('커스텀 상태코드/코드 지정 가능', () => {
      const err = new AppError('커스텀', 418, 'TEAPOT')
      expect(err.statusCode).toBe(418)
      expect(err.code).toBe('TEAPOT')
    })

    it('Error 인스턴스', () => {
      expect(new AppError('test')).toBeInstanceOf(Error)
    })
  })

  describe('NotFoundError', () => {
    it('404 + NOT_FOUND', () => {
      const err = new NotFoundError('게시글')
      expect(err.statusCode).toBe(404)
      expect(err.code).toBe('NOT_FOUND')
      expect(err.message).toContain('게시글')
    })
  })

  describe('ForbiddenError', () => {
    it('403 + FORBIDDEN', () => {
      const err = new ForbiddenError()
      expect(err.statusCode).toBe(403)
      expect(err.code).toBe('FORBIDDEN')
    })
  })

  describe('UnauthorizedError', () => {
    it('401 + UNAUTHORIZED', () => {
      const err = new UnauthorizedError()
      expect(err.statusCode).toBe(401)
      expect(err.code).toBe('UNAUTHORIZED')
      expect(err.message).toBe('로그인이 필요합니다')
    })
  })

  describe('ValidationError', () => {
    it('400 + VALIDATION_ERROR', () => {
      const err = new ValidationError('잘못된 입력')
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('RateLimitError', () => {
    it('429 + RATE_LIMIT', () => {
      const err = new RateLimitError()
      expect(err.statusCode).toBe(429)
      expect(err.code).toBe('RATE_LIMIT')
    })
  })

  describe('상속 체인', () => {
    it('모든 에러는 AppError 인스턴스', () => {
      expect(new NotFoundError('x')).toBeInstanceOf(AppError)
      expect(new ForbiddenError()).toBeInstanceOf(AppError)
      expect(new UnauthorizedError()).toBeInstanceOf(AppError)
      expect(new ValidationError('x')).toBeInstanceOf(AppError)
      expect(new RateLimitError()).toBeInstanceOf(AppError)
    })
  })
})
