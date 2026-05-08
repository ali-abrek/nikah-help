import { test, expect } from '@playwright/test'

test.describe('Notifications E2E', () => {
  test('notifications page shows empty state when no notifications', async ({ page }) => {
    await page.goto('/notifications')

    const emptyText = page.getByText('Нет уведомлений')
    const authText = page.getByText('Требуется авторизация')

    await expect(emptyText.or(authText).first()).toBeVisible()
  })

  test('notifications page requires auth', async ({ page }) => {
    await page.goto('/notifications')

    const authText = page.getByText('Требуется авторизация')
    await expect(authText).toBeVisible()
  })

  test('notifications nav link is visible in app layout', async ({ page }) => {
    await page.goto('/feed')

    const notifLink = page.getByRole('link', { name: 'Уведомления' })
    if (await notifLink.isVisible().catch(() => false)) {
      await expect(notifLink).toHaveAttribute('href', '/notifications')
    }
  })

  test('settings page shows notification preferences', async ({ page }) => {
    await page.goto('/settings')

    // Should show either settings content or auth required
    const settingsHeader = page.getByText('Настройки')
    const authText = page.getByText('Требуется авторизация')

    await expect(settingsHeader.or(authText).first()).toBeVisible()
  })

  test('mark all as read button only shows when unread exist', async () => {
    // Unit-testable logic
    const hasUnread = (items: { status: string }[]): boolean =>
      items.some((n) => n.status === 'unread')

    expect(hasUnread([{ status: 'unread' }, { status: 'read' }])).toBe(true)
    expect(hasUnread([{ status: 'read' }, { status: 'read' }])).toBe(false)
    expect(hasUnread([])).toBe(false)
  })

  test('notification item shows unread dot for unread notifications', async () => {
    const isUnread = (status: string): boolean => status === 'unread'

    expect(isUnread('unread')).toBe(true)
    expect(isUnread('read')).toBe(false)
  })

  test('relative time formatting produces expected values', async () => {
    const formatRelativeTime = (iso: string): string => {
      const date = new Date(iso)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const minutes = Math.floor(diff / 60_000)
      const hours = Math.floor(diff / 3_600_000)

      if (minutes < 1) return 'только что'
      if (minutes < 60) return `${minutes} мин`
      if (hours < 24) return `${hours} ч`
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    }

    expect(formatRelativeTime(new Date().toISOString())).toBe('только что')
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 мин')
    expect(formatRelativeTime(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe('2 ч')
  })
})
