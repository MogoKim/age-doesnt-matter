export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource}을(를) 찾을 수 없습니다`, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '접근 권한이 없습니다') {
    super(message, 403, 'FORBIDDEN')
    this.name = 'ForbiddenError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '로그인이 필요합니다') {
    super(message, 401, 'UNAUTHORIZED')
    this.name = 'UnauthorizedError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends AppError {
  constructor(message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요') {
    super(message, 429, 'RATE_LIMIT')
    this.name = 'RateLimitError'
  }
}
