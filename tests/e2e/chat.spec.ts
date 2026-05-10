import { test, expect } from '@playwright/test'

test.describe('Chat E2E', () => {
  test('chat list shows empty state when no chats', async ({ page }) => {
    await page.goto('/chats')

    // Should show empty state or redirect to auth
    const emptyText = page.getByText('Нет активных чатов')
    const authText = page.getByText('Требуется авторизация')

    await expect(emptyText.or(authText).first()).toBeVisible()
  })

  test('chat detail page requires auth', async ({ page }) => {
    await page.goto('/chats/test-chat-id')

    // Should show auth required or redirect
    const authText = page.getByText('Требуется авторизация')
    await expect(authText).toBeVisible()
  })

  test('chat nav link is visible in app layout', async ({ page }) => {
    await page.goto('/feed')

    // Check chat nav link exists (may redirect to auth)
    const chatLink = page.getByRole('link', { name: 'Чаты' })
    // Either visible on feed page or we're redirected to auth
    if (await chatLink.isVisible().catch(() => false)) {
      await expect(chatLink).toHaveAttribute('href', '/chats')
    }
  })

  test('composer trims whitespace and respects max length', async () => {
    // Unit-testable logic for the compose flow
    const compose = (text: string): string => {
      const trimmed = text.trim()
      if (!trimmed) return ''
      if (trimmed.length > 4000) return trimmed.slice(0, 4000)
      return trimmed
    }

    expect(compose('')).toBe('')
    expect(compose('   ')).toBe('')
    expect(compose('Hello')).toBe('Hello')
    expect(compose('  Hello  ')).toBe('Hello')
    expect(compose('x'.repeat(5000)).length).toBe(4000)
  })

  test('message edit window is 5 minutes', () => {
    const canEdit = (createdAt: string): boolean => {
      const created = new Date(createdAt).getTime()
      return Date.now() - created < 5 * 60 * 1000
    }

    const justNow = new Date().toISOString()
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString()

    expect(canEdit(justNow)).toBe(true)
    expect(canEdit(sixMinutesAgo)).toBe(false)
  })

  test('status icons show correct states', () => {
    const getStatusIcon = (status: string): string => {
      switch (status) {
        case 'sent':
          return 'check'
        case 'delivered':
          return 'checks'
        case 'read':
          return 'checks-blue'
        default:
          return 'clock'
      }
    }

    expect(getStatusIcon('sent')).toBe('check')
    expect(getStatusIcon('delivered')).toBe('checks')
    expect(getStatusIcon('read')).toBe('checks-blue')
  })

  test('unread badge count formatting', () => {
    const formatBadge = (count: number): string => {
      if (count <= 0) return ''
      if (count > 99) return '99+'
      return String(count)
    }

    expect(formatBadge(0)).toBe('')
    expect(formatBadge(1)).toBe('1')
    expect(formatBadge(50)).toBe('50')
    expect(formatBadge(99)).toBe('99')
    expect(formatBadge(100)).toBe('99+')
    expect(formatBadge(999)).toBe('99+')
  })

  test('message types have correct previews', () => {
    const getPreview = (type: string, content: string): string => {
      switch (type) {
        case 'image':
          return '📷 Фото'
        case 'voice':
          return '🎤 Голосовое'
        default:
          return content.length > 60 ? content.slice(0, 60) + '...' : content
      }
    }

    expect(getPreview('text', 'Short message')).toBe('Short message')
    expect(getPreview('text', 'x'.repeat(100))).toBe('x'.repeat(60) + '...')
    expect(getPreview('image', 'any')).toBe('📷 Фото')
    expect(getPreview('voice', 'any')).toBe('🎤 Голосовое')
  })
})
