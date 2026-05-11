// Sets the Sentry user context for the current scope.
//
// Accepts only the user ID — never email, username, name, or IP address.
// The TypeScript signature enforces this at every call site.
export function setSentryUser(id: string): void {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return

  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.setUser({ id })
    })
    .catch(() => {
      // Intentionally suppressed: user context is best-effort telemetry.
    })
}

// Clears the Sentry user context (call on sign-out).
export function clearSentryUser(): void {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return

  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.setUser(null)
    })
    .catch(() => {
      // Intentionally suppressed: same as setSentryUser.
    })
}
