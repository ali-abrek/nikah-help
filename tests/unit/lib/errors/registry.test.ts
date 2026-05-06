import { describe, it, expect } from 'vitest'
import { STATUS_MAP } from '@/lib/errors/registry'
import ruMessages from '@/messages/ru.json'
import enMessages from '@/messages/en.json'

describe('error code registry', () => {
  const validStatuses = [401, 403, 404, 409, 422, 429, 500, 502, 503, 504]

  it('should have valid HTTP status for every code', () => {
    for (const [code, status] of Object.entries(STATUS_MAP)) {
      expect(validStatuses).toContain(status)
    }
  })

  it('should have at least 50 error codes', () => {
    expect(Object.keys(STATUS_MAP).length).toBeGreaterThanOrEqual(50)
  })

  it('should have RU and EN translation for every error code', () => {
    for (const code of Object.keys(STATUS_MAP)) {
      expect(ruMessages.errors, `Missing RU: ${code}`).toHaveProperty(code)
      expect(enMessages.errors, `Missing EN: ${code}`).toHaveProperty(code)
    }
  })

  it('should not have orphaned translations without registry entry', () => {
    for (const key of Object.keys(ruMessages.errors)) {
      expect(STATUS_MAP, `Orphan RU key: ${key}`).toHaveProperty(key)
    }
    for (const key of Object.keys(enMessages.errors)) {
      expect(STATUS_MAP, `Orphan EN key: ${key}`).toHaveProperty(key)
    }
  })
})
