type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  [key: string]: unknown
}

function createEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    const entry = createEntry('info', message, data)
    console.log(JSON.stringify(entry))
  },

  warn(message: string, data?: Record<string, unknown>) {
    const entry = createEntry('warn', message, data)
    console.warn(JSON.stringify(entry))
  },

  error(message: string, error?: unknown, data?: Record<string, unknown>) {
    const entry = createEntry('error', message, {
      ...data,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
    })
    console.error(JSON.stringify(entry))
  },
}
